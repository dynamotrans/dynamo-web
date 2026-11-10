'use server';

import { createHash, randomUUID } from 'node:crypto';
import { headers } from 'next/headers';
import { supabasePublico } from '@/lib/supabase/publico';
import { validaDoc } from '@/lib/documentoIdentidad';
import { CONTACTO } from '@/lib/atencion';
import { comprobarEntrada } from '@/lib/entradas/comprobar';

export type DatosFirma = { parada_id: string | null; rol: 'remitente' | 'transportista' | 'destinatario'; nombre: string; documento: string; pais: string; email: string; png: string;
  reservas?: string;     // daños o faltantes: van ANTES de la firma y entran en su huella
  fotos?: string[];      // fotos de las reservas, ya subidas a cmr/<token>/… (máx. 6)
  extra?: boolean;       // firma AÑADIDA (máx. 3 por envío): no ocupa la casilla ni anota reservas
  gps?: { lat: number; lon: number; precision_m?: number; direccion?: string } | null };   // ubicación VIVA del dispositivo al pulsar firmar, si dio permiso

// Firmar una casilla del CMR. La validez del documento la decide AQUÍ el servidor (la
// pantalla solo avisa); la hora la pone la base de datos; el trazo va al almacén privado,
// en la carpeta de este enlace; y se guarda la huella de los datos del CMR que se firmaron.
export async function firmar(token: string, d: DatosFirma): Promise<{ ok: true } | { ok: false; error: string }> {
  comprobarEntrada("app/cmr/[token]/acciones#firmar", [token, d]);
  const sb = supabasePublico();
  if (!sb || !/^[0-9a-f-]{36}$/i.test(token)) return { ok: false, error: 'Este enlace no es válido.' };
  const { data: mant } = await sb.rpc('mantenimiento_activo');
  if (mant) return { ok: false, error: 'La plataforma está en mantenimiento. Vuelve a intentarlo en un rato.' };
  // El documento lo escribe SIEMPRE quien firma (quien tiene el enlace no es necesariamente
  // el conductor: no se rellena con el de su ficha).
  if (!d.nombre.trim() || !d.documento.trim()) return { ok: false, error: 'Indica el documento y el nombre y apellidos de quien firma.' };
  const v = validaDoc(d.pais, d.documento);
  if (!v.ok) return { ok: false, error: v.msg || 'El documento no es válido.' };
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(d.png);
  const png = m ? Buffer.from(m[1], 'base64') : null;
  if (!png || png.length < 200 || png.length > 600_000 || png.subarray(0, 4).toString('hex') !== '89504e47') return { ok: false, error: 'Falta la firma: firma con el dedo dentro del recuadro.' };

  // Lo que había en pantalla al firmar (sin las firmas): su huella prueba QUÉ se firmó.
  const { data: cmr } = await sb.rpc('cmr_publico', { p_token: token });
  const datos = cmr as { resultado?: string; firmas?: unknown; [campo: string]: unknown } | null;
  if (!datos || datos.resultado !== 'ok') return { ok: false, error: datos?.resultado === 'cancelado' ? 'Este envío está cancelado.' : 'Este enlace ya no es válido.' };
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- se separan las firmas para no devolverlas
  const { firmas: _f, ...contenido } = datos;
  // Máximo 300 caracteres, como el campo de la pantalla (usuario, 2026-11-10).
  const reservas = d.extra ? '' : (d.reservas ?? '').trim().slice(0, 300);
  const sha = createHash('sha256').update(JSON.stringify(reservas ? { ...contenido, reservas } : contenido)).digest('hex');
  // Reservas (protocolo de siniestro): se anotan antes de firmar y abren un siniestro para
  // Dynamo. Las FOTOS (ya subidas por la página a la carpeta de este enlace) se cuelgan de
  // esa incidencia; la base de datos revalida que son de este enlace, imágenes y ≤25 MB.
  if (reservas) {
    const fotos = (d.fotos ?? []).filter((f) => f.startsWith(`cmr/${token}/`)).slice(0, 6);
    const { data: rv, error: er } = await sb.rpc('anotar_reservas_cmr_publico', { p_token: token, p_parada: d.parada_id, p_rol: d.rol, p_texto: reservas, p_fotos: fotos.length ? fotos : null });
    const rr = (rv as { resultado?: string } | null)?.resultado;
    if (er || rr !== 'ok') return { ok: false, error: rr === 'texto_no_valido' ? 'Las reservas tienen que tener entre 3 y 1.000 caracteres.' : rr === 'demasiadas' ? `Ya hay varias reservas anotadas en esta casilla: llámanos al ${CONTACTO.telefono}.` : 'No se han podido guardar las reservas. Vuelve a intentarlo o llámanos.' };
  }

  const ruta = `cmr/${token}/${randomUUID()}.png`;
  const { error: e1 } = await sb.storage.from('documentos').upload(ruta, png, { contentType: 'image/png', upsert: false });
  if (e1) return { ok: false, error: 'No se ha podido guardar la firma. Vuelve a intentarlo.' };

  const h = await headers();
  const ip = (h.get('x-forwarded-for') ?? '').split(',')[0].trim() || null;
  // El GPS es opcional y lo sanea también la base de datos; aquí se descarta lo que no
  // sea un par finito dentro de rango.
  const g = d.gps && Number.isFinite(d.gps.lat) && Number.isFinite(d.gps.lon)
    && Math.abs(d.gps.lat) <= 90 && Math.abs(d.gps.lon) <= 180 ? d.gps : null;
  const { data, error } = await sb.rpc('firmar_cmr_publico', {
    p_token: token, p_parada: d.parada_id, p_rol: d.rol, p_nombre: d.nombre, p_documento: v.norm, p_pais: d.pais,
    p_validado: !v.soft, p_email: d.email, p_ruta: ruta, p_ip: ip, p_navegador: h.get('user-agent'), p_sha256: sha, p_extra: !!d.extra,
    p_lat: g?.lat ?? null, p_lon: g?.lon ?? null,
    p_gps_precision_m: g && Number.isFinite(g.precision_m) ? Math.max(0, Math.min(100000, Math.round(g.precision_m!))) : null,
    p_gps_direccion: g?.direccion ? String(g.direccion).trim().slice(0, 300) : null,
  });
  if (error) return { ok: false, error: 'No se ha podido guardar la firma. Vuelve a intentarlo.' };
  const r = (data as { resultado: string }).resultado;
  if (r === 'firmada') return { ok: true };
  const msg: Record<string, string> = {
    ya_firmada: 'Esta casilla ya está firmada.', demasiadas_firmas: 'Ya hay 3 firmas extra en este CMR: no caben más.', enlace_no_valido: 'Este enlace ya no es válido.', cancelado: 'Este envío está cancelado.',
    parada_no_valida: 'Esa casilla no corresponde a este envío.', faltan_datos: 'Indica el documento y el nombre y apellidos.', falta_trazo: 'Falta la firma.',
  };
  return { ok: false, error: msg[r] ?? 'No se ha podido guardar la firma.' };
}
