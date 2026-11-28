'use server';

import { createHash, randomUUID } from 'node:crypto';
import { headers } from 'next/headers';
import { supabasePublico } from '@/lib/supabase/publico';
import { supabaseServicio } from '@/lib/supabase/servicio';
import { codigoNuevo, huellaCodigo, mandarCodigoFirma } from '@/lib/servidor/codigoFirma';
import { validaDoc } from '@/lib/documentoIdentidad';
import { CONTACTO } from '@/lib/atencion';
import { comprobarEntrada } from '@/lib/entradas/comprobar';
import { ficherosNoValidos } from '@/lib/servidor/contenidoArchivo';
import { direccionDeCoordenadas } from '@/lib/servidor/geocodificar';

export type DatosFirma = { parada_id: string | null; rol: 'remitente' | 'transportista' | 'destinatario'; nombre: string; documento: string; pais: string; email: string; png: string;
  reservas?: string;     // daños o faltantes: van ANTES de la firma y entran en su huella
  fotos?: string[];      // fotos de las reservas, ya subidas a cmr/<token>/… (máx. 6)
  extra?: boolean;       // firma AÑADIDA (máx. 3 por envío): no ocupa la casilla ni anota reservas
  gps?: { lat: number; lon: number; precision_m?: number; direccion?: string } | null;   // ubicación VIVA del dispositivo al pulsar firmar, si dio permiso
  // Matrículas al firmar (2026-11-11): solo las manda la CABECERA (transportista o
  // cargador de la 1.ª parada); la base de datos las exige, valida y guarda.
  matricula_camion?: string; matricula_remolque?: string;
  camion_rigido?: boolean };   // quien firma declara que es un rígido (sin semirremolque)

// Fallos PASAJEROS del servicio (pool de conexiones agotado, 5xx, red): la firma del
// conductor no puede caerse por un pico de 2 segundos, así que se reintenta hasta 3
// veces con una pequeña espera creciente. Cualquier otro fallo (permiso, tope, datos
// malos) sale a la primera: reintentarlo no lo arregla.
const FALLO_PASAJERO = /too many connections|internal server error|timeout|timed out|fetch failed|network|socket|econn|statuscode.*5\d\d/i;
async function reintentando<T>(fn: () => PromiseLike<T>, mensajeFallo: (r: T) => string | null): Promise<T> {
  let r = await fn();
  for (let i = 1; i <= 2; i++) {
    const msg = mensajeFallo(r);
    if (msg === null || !FALLO_PASAJERO.test(msg)) return r;
    await new Promise((listo) => setTimeout(listo, 500 * i + Math.floor(Math.random() * 400)));
    r = await fn();
  }
  return r;
}

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
  // La firma SOLO la registra este servidor, con la clave de servicio (usuario, 2026-11-22):
  // la base de datos rechaza la clave pública, así que la hora, la IP, el navegador y la
  // huella de lo firmado son siempre los que pone aquí el servidor, nunca los de quien llama.
  const srv = supabaseServicio();
  if (!srv) {
    console.error('[cmr/firmar] falta SUPABASE_SERVICE_ROLE_KEY: no se puede registrar la firma');
    return { ok: false, error: `Ahora mismo no se puede guardar la firma. Llámanos al ${CONTACTO.telefono}.` };
  }

  // Lo que había en pantalla al firmar (sin las firmas): su huella prueba QUÉ se firmó.
  const rCmr = await reintentando(() => sb.rpc('cmr_publico', { p_token: token }), (x) => x.error?.message ?? null);
  if (rCmr.error) {
    // Fallo de transporte (p. ej. pool de conexiones agotado): NO es un enlace caducado.
    console.error('[cmr/firmar] fallo al leer la hoja', { token: token.slice(0, 8) + '…', rol: d.rol, mensaje: rCmr.error.message });
    return { ok: false, error: 'Ahora mismo no se puede cargar la hoja. Espera unos segundos y vuelve a intentarlo.' };
  }
  const datos = rCmr.data as { resultado?: string; firmas?: unknown; [campo: string]: unknown } | null;
  if (!datos || datos.resultado !== 'ok') return { ok: false, error: datos?.resultado === 'cancelado' ? 'Este envío está cancelado.' : 'Este enlace ya no es válido.' };
  const { firmas: _f, ...contenido } = datos;
  // Casilla ya firmada: se corta AQUÍ, antes de subir el trazo. Cada subida cuenta para
  // el tope de ficheros del enlace, así que no se sube un trazo condenado de antemano.
  const firmasPrevias = (_f as { parada_id: string | null; rol: string; extra: boolean }[] | null) ?? [];
  if (!d.extra && firmasPrevias.some((f) => !f.extra && f.rol === d.rol && (f.parada_id ?? null) === (d.parada_id ?? null))) {
    return { ok: false, error: 'Esta casilla ya está firmada.' };
  }
  // Máximo 300 caracteres, como el campo de la pantalla (usuario, 2026-11-10).
  const reservas = d.extra ? '' : (d.reservas ?? '').trim().slice(0, 300);
  const sha = createHash('sha256').update(JSON.stringify(reservas ? { ...contenido, reservas } : contenido)).digest('hex');
  // Reservas (protocolo de siniestro): se anotan antes de firmar y abren un siniestro para
  // Dynamo. Las FOTOS (ya subidas por la página a la carpeta de este enlace) se cuelgan de
  // esa incidencia; la base de datos revalida que son de este enlace, imágenes y ≤25 MB.
  if (reservas) {
    const fotos = (d.fotos ?? []).filter((f) => f.startsWith(`cmr/${token}/`)).slice(0, 6);
    if ((await ficherosNoValidos(fotos, `cmr/${token}/foto-`, true)).length) return { ok: false, error: 'Una de las fotos no es una imagen de verdad: quítala y vuelve a hacerla.' };
    const { data: rv, error: er } = await srv.rpc('anotar_reservas_cmr_publico', { p_token: token, p_parada: d.parada_id, p_rol: d.rol, p_texto: reservas, p_fotos: fotos.length ? fotos : null });
    const rr = (rv as { resultado?: string } | null)?.resultado;
    if (er || rr !== 'ok') return { ok: false, error: rr === 'firma_cerrada' ? 'El plazo para firmar este CMR ya se ha cerrado (3 días después de la entrega): solo se puede ver y descargar.' : rr === 'texto_no_valido' ? 'Las reservas tienen que tener entre 3 y 1.000 caracteres.' : rr === 'demasiadas' ? `Ya hay varias reservas anotadas en esta casilla: llámanos al ${CONTACTO.telefono}.` : 'No se han podido guardar las reservas. Vuelve a intentarlo o llámanos.' };
  }

  const ruta = `cmr/${token}/${randomUUID()}.png`;
  let { error: e1 } = await reintentando(
    () => sb.storage.from('documentos').upload(ruta, png, { contentType: 'image/png', upsert: false }),
    (x) => x.error?.message ?? null,
  );
  // Si un intento anterior llegó al servidor pero su respuesta se perdió, el reintento
  // choca con su propio fichero (la ruta es un UUID recién generado): eso ES haber subido.
  if (e1 && /duplicate|already exists/i.test(e1.message ?? '')) e1 = null;
  if (e1) {
    console.error('[cmr/firmar] fallo al subir el trazo', { token: token.slice(0, 8) + '…', rol: d.rol, mensaje: e1.message });
    return { ok: false, error: 'No se ha podido guardar la firma. Vuelve a intentarlo.' };
  }

  const h = await headers();
  const ip = (h.get('x-forwarded-for') ?? '').split(',')[0].trim() || null;
  // El GPS es opcional y lo sanea también la base de datos; aquí se descarta lo que no
  // sea un par finito dentro de rango.
  const g = d.gps && Number.isFinite(d.gps.lat) && Number.isFinite(d.gps.lon)
    && Math.abs(d.gps.lat) <= 90 && Math.abs(d.gps.lon) <= 180 ? d.gps : null;
  // La dirección aproximada de esas coordenadas la pone el servidor con Google (si la
  // plataforma tiene su clave); sin ella vale la que traiga el navegador.
  if (g && !g.direccion) g.direccion = (await direccionDeCoordenadas(g.lat, g.lon)) ?? undefined;
  const { data, error } = await srv.rpc('firmar_cmr_publico', {
    p_token: token, p_parada: d.parada_id, p_rol: d.rol, p_nombre: d.nombre, p_documento: v.norm, p_pais: d.pais,
    p_validado: !v.soft, p_email: d.email, p_ruta: ruta, p_ip: ip, p_navegador: h.get('user-agent'), p_sha256: sha, p_extra: !!d.extra,
    p_lat: g?.lat ?? null, p_lon: g?.lon ?? null,
    p_gps_precision_m: g && Number.isFinite(g.precision_m) ? Math.max(0, Math.min(100000, Math.round(g.precision_m!))) : null,
    p_gps_direccion: g?.direccion ? String(g.direccion).trim().slice(0, 300) : null,
    // El MISMO PNG, también en la fila de la firma (2026-11-11): de ahí lo leen la
    // página y el PDF públicos sin clave de servicio.
    p_trazo_png: m![1],
    p_matricula_camion: (d.matricula_camion ?? '').trim().toUpperCase().slice(0, 16) || null,
    p_matricula_remolque: (d.matricula_remolque ?? '').trim().toUpperCase().slice(0, 16) || null,
    p_camion_rigido: !!d.camion_rigido,
  });
  const r = error ? null : (data as { resultado: string }).resultado;
  if (r !== null && r !== 'firmada') {
    // La firma NO ha quedado registrada (resultado definitivo): el trazo recién subido se
    // borra (con la clave de servicio, si la hay) para que los intentos fallidos no llenen
    // el tope de ficheros del enlace. Con un fallo de transporte no se borra: la firma
    // podría haberse registrado igualmente y su trazo debe quedarse.
    try {
      await srv.storage.from('documentos').remove([ruta]);
    } catch { /* mejor un huérfano que romper el aviso de error */ }
  }
  if (error) {
    console.error('[cmr/firmar] fallo en firmar_cmr_publico', { token: token.slice(0, 8) + '…', rol: d.rol, parada: d.parada_id, codigo: error.code, mensaje: error.message, detalle: error.details, pista: error.hint });
    return { ok: false, error: 'No se ha podido guardar la firma. Vuelve a intentarlo.' };
  }
  if (r === 'firmada') {
    // Aviso por email de la firma (y, con todas, el eCMR en PDF a las partes —
    // usuario, 2026-11-12). Nunca rompe la firma.
    const { avisosFirmaCmr } = await import('@/lib/servidor/avisosEnvio');
    await avisosFirmaCmr(token).catch(() => {});
    // Si al firmar la cabecera se han puesto las matrículas, el DeCA acaba de emitirse (o de
    // cambiar): su copia se archiva y se envía al transportista. Una firma sola no lo cambia.
    const { programarCopiaDeca } = await import('@/lib/servidor/archivoDeca');
    await programarCopiaDeca({ token });
    return { ok: true };
  }
  const msg: Record<string, string> = {
    ya_firmada: 'Esta casilla ya está firmada.', demasiadas_firmas: 'Ya hay 3 firmas extra en este CMR: no caben más.', enlace_no_valido: 'Este enlace ya no es válido.', cancelado: 'Este envío está cancelado.',
    parada_no_valida: 'Esa casilla no corresponde a este envío.', faltan_datos: 'Indica el documento y el nombre y apellidos.', falta_trazo: 'Falta la firma.',
    solo_servidor: `Ahora mismo no se puede guardar la firma. Llámanos al ${CONTACTO.telefono}.`,
    sin_transportista: 'El envío no tiene transportista asignado ahora mismo: no se puede firmar hasta que se asigne.',
    firma_cerrada: 'El plazo para firmar este CMR ya se ha cerrado (3 días después de la entrega): solo se puede ver y descargar.',
    faltan_matriculas: 'Faltan las matrículas del camión (tractora y semirremolque): ponlas en la ventana de firma (sin ellas no se puede salir de la 1.ª parada).',
    matricula_no_valida: 'La matrícula no es válida: solo letras, números, espacios y guiones (de 2 a 16).',
    sin_matriculas: 'Faltan matrículas del camión (tractora y, si es un tráiler, también el semirremolque): primero firma el transportista (o el cargador de la 1.ª recogida) poniéndolas.',
    falta_remolque: 'Falta la matrícula del semirremolque: un tráiler lleva las dos en el documento de control. Si es un camión rígido, márcalo en la ventana de firma.',
    faltan_sitios: 'El envío no tiene completos sus sitios de recogida y entrega: no se puede firmar hasta que Dynamo los complete.',
  };
  return { ok: false, error: msg[r ?? ''] ?? 'No se ha podido guardar la firma.' };
}

// CÓDIGO DE 6 CIFRAS AL EMAIL DE QUIEN FIRMA (usuario, 2026-11-22). Opcional: si lo escribe
// bien antes de firmar, la base de datos marca su firma «email verificado» (sale en el PDF);
// sin él se firma igual («email sin verificar»), para no dejar a nadie tirado en un muelle sin
// cobertura de email. Todo con la clave de servicio: el código no viaja nunca al navegador.
export type CasillaCodigo = { parada_id: string | null; rol: 'remitente' | 'transportista' | 'destinatario'; email: string };
const EMAIL_VALE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function pedirCodigoFirma(token: string, c: CasillaCodigo): Promise<{ ok: true; email: string } | { ok: false; error: string }> {
  comprobarEntrada("app/cmr/[token]/acciones#pedirCodigoFirma", [token, c]);
  const email = (c.email ?? '').trim().toLowerCase();
  if (!/^[0-9a-f-]{36}$/i.test(token)) return { ok: false, error: 'Este enlace no es válido.' };
  if (!EMAIL_VALE.test(email)) return { ok: false, error: 'Pon antes un email válido.' };
  const srv = supabaseServicio();
  if (!srv) return { ok: false, error: 'Ahora mismo no se puede mandar el código. Puedes firmar sin él.' };
  const codigo = codigoNuevo();
  const { data, error } = await srv.rpc('cmr_codigo_firma_crear', { p_token: token, p_parada: c.parada_id, p_rol: c.rol, p_email: email, p_codigo_sha: huellaCodigo(token, codigo) });
  const j = (error ? null : data) as { resultado?: string; id?: string; envio_id?: string; referencia?: string | null } | null;
  if (j?.resultado === 'ok' && j.id && j.envio_id) {
    const salio = await mandarCodigoFirma({ codigoId: j.id, envioId: j.envio_id, para: email, codigo, referencia: j.referencia ?? null });
    return salio ? { ok: true, email } : { ok: false, error: 'No hemos podido mandar el código a ese email. Revisa que está bien escrito o firma sin código.' };
  }
  const msg: Record<string, string> = {
    espera: 'Acabamos de mandarte un código: espera un minuto antes de pedir otro (mira también en «Spam»).',
    demasiados: 'Se han pedido demasiados códigos. Firma sin código o llámanos.',
    email_no_valido: 'Pon antes un email válido.', enlace_no_valido: 'Este enlace ya no es válido.', cancelado: 'Este envío está cancelado.',
    firma_cerrada: 'El plazo para firmar este CMR ya se ha cerrado (3 días después de la entrega): solo se puede ver y descargar.',
  };
  if (error) console.error('[cmr/codigo] fallo al apuntar el código', { token: token.slice(0, 8) + '…', codigo: error.code, mensaje: error.message });
  return { ok: false, error: msg[j?.resultado ?? ''] ?? 'No se ha podido mandar el código. Puedes firmar sin él.' };
}

export async function comprobarCodigoFirma(token: string, c: CasillaCodigo & { codigo: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  comprobarEntrada("app/cmr/[token]/acciones#comprobarCodigoFirma", [token, c]);
  const codigo = (c.codigo ?? '').replace(/\D/g, '');
  if (!/^[0-9a-f-]{36}$/i.test(token)) return { ok: false, error: 'Este enlace no es válido.' };
  if (codigo.length !== 6) return { ok: false, error: 'El código tiene 6 cifras.' };
  const srv = supabaseServicio();
  if (!srv) return { ok: false, error: 'Ahora mismo no se puede comprobar el código. Puedes firmar sin él.' };
  const { data, error } = await srv.rpc('cmr_codigo_firma_comprobar', { p_token: token, p_parada: c.parada_id, p_rol: c.rol, p_email: (c.email ?? '').trim().toLowerCase(), p_codigo_sha: huellaCodigo(token, codigo) });
  const j = (error ? null : data) as { resultado?: string; quedan?: number } | null;
  if (j?.resultado === 'ok') return { ok: true };
  if (j?.resultado === 'no_coincide') return { ok: false, error: `El código no coincide. Te quedan ${j.quedan ?? 0} intentos.` };
  if (j?.resultado === 'bloqueado') return { ok: false, error: 'Demasiados intentos con este código: pide uno nuevo.' };
  if (j?.resultado === 'caducado') return { ok: false, error: 'Ese código ha caducado (15 minutos) o es de otro email: pide uno nuevo.' };
  return { ok: false, error: 'No se ha podido comprobar el código. Vuelve a intentarlo o firma sin él.' };
}

// Páginas del CMR / carta de porte EN PAPEL (usuario, 2026-11-17): quien no quiere firmar
// en el móvil sube las fotos desde la hoja de firmas. Ya están en el almacén, en la carpeta
// de este enlace; aquí se cuelgan del envío y Dynamo recibe el aviso. Lo que vale (solo
// imágenes o PDF de ESTE enlace, 20 MB, 10 páginas) lo decide la base de datos.
// Con clase 'doc' (pantalla de firma) son fotos de documentos ADICIONALES del transporte:
// misma ventana y mismos límites, pero se guardan como documento «otro».
export async function registrarCmrPapel(token: string, rutas: string[], clase: 'papel' | 'doc' = 'papel'): Promise<{ ok: true; paginas: number; total: number } | { ok: false; error: string }> {
  comprobarEntrada("app/cmr/[token]/acciones#registrarCmrPapel", [token, rutas, clase]);
  const sb = supabasePublico();
  if (!sb) return { ok: false, error: 'No se ha podido conectar. Vuelve a intentarlo.' };
  // El contenido REAL de cada página (solo las de ESTE enlace): lo que no es imagen ni PDF
  // se rechaza y se borra, y no se cuelga del envío.
  if ((await ficherosNoValidos(rutas.slice(0, 10), `cmr/${token}/${clase}-`)).length) return { ok: false, error: 'Una de las páginas no es una imagen ni un PDF de verdad: quítala y vuelve a subirla (haz una foto o guárdala como PDF).' };
  const { data, error } = await reintentando(
    () => sb.rpc(clase === 'doc' ? 'subir_documentos_extra_publico' : 'subir_cmr_papel_publico', { p_token: token, p_fotos: rutas.slice(0, 10) }),
    (x) => x.error?.message ?? null,
  );
  if (error) {
    console.error('[cmr/papel] fallo al registrar las páginas', { token: token.slice(0, 8) + '…', clase, codigo: error.code, mensaje: error.message });
    return { ok: false, error: 'No se han podido guardar las páginas. Vuelve a intentarlo.' };
  }
  const j = (data ?? {}) as { resultado?: string; paginas?: number; total?: number };
  if (j.resultado === 'ok') return { ok: true, paginas: Number(j.paginas ?? 0), total: Number(j.total ?? 0) };
  const msg: Record<string, string> = {
    enlace_no_valido: 'Este enlace ya no es válido.', cancelado: 'Este envío está cancelado: ya no admite documentos.',
    demasiadas: 'Este envío ya tiene las 10 páginas que caben. Si falta alguna, envíanosla por email o WhatsApp.',
    sin_fotos: 'No ha llegado ninguna página válida (solo imágenes o PDF, de 20 MB como mucho). Vuelve a intentarlo.',
  };
  return { ok: false, error: msg[j.resultado ?? ''] ?? `No se han podido guardar las páginas. Llámanos al ${CONTACTO.telefono}.` };
}
