'use server';

import { mensajeError } from '@/lib/mensajeError';
import { esGestor } from '@/lib/sesion';
import type { ContactoDatos } from '@/lib/contactos';
import { validarHorario, tramosDe, MMDD, type GrupoHorario, type Verano } from '@/lib/horarios';
import { guardarContactos, validarContactos, sinVacios } from '@/lib/contactosServidor';
import type { TablaInsert, TablaUpdate } from '@/lib/supabase/tipos';
import { gestorOCliente } from '@/lib/guardia';
import { comprobarEntrada } from '@/lib/entradas/comprobar';

export type SitioDatos = {
  cliente_id: string; nombre_empresa: string; tipo: string;
  direccion: string; codigo_postal: string; poblacion: string; provincia: string; pais_codigo_iso: string;
  horario: GrupoHorario[];        // obligatorio (tabla sitio_horarios, temporada general)
  verano?: Verano;                // horario de verano (opcional; temporada verano)
  url_google_maps: string; anotaciones: string;
  requiere_cita: boolean; tiene_medios_carga: boolean;
  contactos: ContactoDatos[];     // personas (tabla contactos, una o varias)
  emails_avisos: string;          // uno o varios, separados por comas (sitios.emails_avisos)
  // Solo en los almacenes de Dynamo (catálogo interno): disponibilidad y tarifa propia.
  almacen?: { disponible: boolean; precio_almacenamiento_semana: number | null; precio_reparto: number | null };
};
type Res = { ok: true; id: string } | { ok: false; error: string; duplicado?: { id: string; nombre: string } };

function traducir(msg: string): string {
  if (/contactos_telefono_check/i.test(msg)) return 'El teléfono no es válido: solo números, con el prefijo del país.';
  if (/contactos_email_check/i.test(msg)) return 'Hay un email que no es válido.';
  if (/ck_sitios_dueno/i.test(msg)) return 'Elige de qué cliente es el sitio.';
  if (/permission denied|42501|row-level security/i.test(msg)) return 'No tienes permiso para hacer esto.';
  return mensajeError(msg);   // los de las reglas de la base de datos ya vienen en castellano
}
const vacio = (s: string) => (s ?? '').trim() || null;
// Mismo criterio que el índice de posibles duplicados de la base de datos.
const clave = (s: string) => (s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const puede = gestorOCliente;

export async function guardarSitio(id: string | null, d: SitioDatos, aunqueParezcaRepetido = false): Promise<Res> {
  comprobarEntrada("app/panel/(app)/sitios/acciones#guardarSitio", [id, d, aunqueParezcaRepetido]);
  const s = await puede();
  if (!s) return { ok: false, error: 'No tienes permiso para gestionar sitios.' };
  const esAlmacen = !!d.almacen;
  if (esAlmacen && !esGestor(s.perfil!.rol)) return { ok: false, error: 'Los almacenes Dynamo solo los gestiona Dynamo.' };
  if (!esAlmacen && !d.cliente_id) return { ok: false, error: 'Elige de qué cliente es el sitio.' };
  const precioMal = [d.almacen?.precio_almacenamiento_semana, d.almacen?.precio_reparto].some((v) => v != null && (!Number.isFinite(v) || v < 0));
  if (precioMal) return { ok: false, error: 'Los precios tienen que ser un número (o vacíos para usar los de por defecto).' };
  if (!d.nombre_empresa.trim() || !d.direccion.trim() || !d.codigo_postal.trim() || !d.poblacion.trim()) {
    return { ok: false, error: 'Empresa, dirección, código postal y población son obligatorios.' };
  }

  // Emails de avisos: varios separados por comas, cada uno válido, máximo 10.
  const emails = [...new Set(d.emails_avisos.split(/[,;\s]+/).map((e) => e.trim().toLowerCase()).filter(Boolean))];
  if (emails.length > 10) return { ok: false, error: `Máximo 10 emails de avisos por sitio (has puesto ${emails.length}).` };
  const malo = emails.find((e) => !EMAIL.test(e));
  if (id && emails.length === 0) {
    const { data: antes } = await s.supabase.from('sitios').select('emails_avisos').eq('id', id).single();
    if ((antes?.emails_avisos ?? []).length) return { ok: false, error: 'El email de avisos no se puede dejar vacío: solo se puede cambiar por otro válido.' };
  }
  if (malo) return { ok: false, error: `«${malo}» no es un email válido. Si pones varios, sepáralos por comas.` };

  const malHorario = validarHorario(d.horario);
  if (malHorario) return { ok: false, error: malHorario };
  if (d.verano?.activo) {
    if (!MMDD.test(d.verano.desde) || !MMDD.test(d.verano.hasta)) return { ok: false, error: 'Pon las fechas del horario de verano (desde y hasta).' };
    const malV = validarHorario(d.verano.horario);
    if (malV) return { ok: false, error: `Horario de verano: ${malV.charAt(0).toLowerCase()}${malV.slice(1)}` };
  }
  const contactos = sinVacios(d.contactos);
  const malContacto = validarContactos(contactos);
  if (malContacto) return { ok: false, error: malContacto };

  // Aviso de duplicado (no bloquea): mismo cliente, mismo nombre y mismo código postal.
  if (!id && !aunqueParezcaRepetido) {
    const base = s.supabase.from('sitios').select('id, nombre_empresa, codigo_postal')
      .eq('borrado', false).eq('codigo_postal', d.codigo_postal.trim());
    const { data: suyos } = await (esAlmacen ? base.eq('es_almacen_dynamo', true) : base.eq('cliente_id', d.cliente_id));
    const rep = (suyos ?? []).find((x) => clave(x.nombre_empresa) === clave(d.nombre_empresa));
    if (rep) return { ok: false, error: 'repetido', duplicado: { id: rep.id, nombre: rep.nombre_empresa } };
  }

  const fila: Record<string, unknown> = {
    nombre_empresa: d.nombre_empresa.trim(), tipo: d.tipo || 'almacen_nave',
    direccion: d.direccion.trim(), codigo_postal: d.codigo_postal.trim(), poblacion: d.poblacion.trim(),
    provincia: vacio(d.provincia), pais_codigo_iso: d.pais_codigo_iso || 'ES',
    anotaciones: vacio(d.anotaciones),
    requiere_cita: d.requiere_cita, tiene_medios_carga: d.tiene_medios_carga,
    emails_avisos: emails,
  };
  // El enlace de Google Maps solo lo toca Dynamo (en el mockup, el cliente lo ve fijo).
  if (esGestor(s.perfil!.rol)) fila.url_google_maps = vacio(d.url_google_maps);
  if (esAlmacen) {
    fila.disponible = d.almacen!.disponible;
    fila.precio_almacenamiento_semana = d.almacen!.precio_almacenamiento_semana;
    fila.precio_reparto = d.almacen!.precio_reparto;
    if (!id) fila.es_almacen_dynamo = true;
  } else if (!id) fila.cliente_id = d.cliente_id;

  const q = id
    ? s.supabase.from('sitios').update(fila as TablaUpdate<'sitios'>).eq('id', id).select('id').single()
    : s.supabase.from('sitios').insert(fila as TablaInsert<'sitios'>).select('id').single();
  const { data, error } = await q;
  if (error) return { ok: false, error: traducir(error.message) };
  const sitioId = data.id as string;

  // Horario: de una vez (todo o nada). Al crear, sustituye al de por defecto.
  const eh = await s.supabase.rpc('guardar_horario', { p_sitio: sitioId, p_tramos: tramosDe(d.horario) });
  if (eh.error) return { ok: false, error: /se pisan/i.test(eh.error.message) ? 'Hay dos tramos del mismo día que se pisan.' : traducir(eh.error.message) };
  if (d.verano) {
    const ev = await s.supabase.rpc('guardar_horario_verano', { p_sitio: sitioId, p_activo: d.verano.activo, p_desde: d.verano.desde, p_hasta: d.verano.hasta,
      p_tramos: d.verano.activo ? tramosDe(d.verano.horario) : [] });
    if (ev.error) return { ok: false, error: /se pisan/i.test(ev.error.message) ? 'Horario de verano: hay dos tramos del mismo día que se pisan.' : traducir(ev.error.message) };
  }
  const e2 = await guardarContactos(s.supabase, { sitio_id: sitioId }, contactos);
  if (e2) return { ok: false, error: traducir(e2) };
  return { ok: true, id: sitioId };
}

// Borrado SUAVE: sale de la agenda y del buscador; los envíos ya hechos conservan la
// dirección. Si tenía la estrella, la base de datos se la quita sola.
export async function borrarSitio(id: string): Promise<{ ok: boolean; error?: string }> {
  comprobarEntrada("app/panel/(app)/sitios/acciones#borrarSitio", [id]);
  const s = await puede();
  if (!s) return { ok: false, error: 'No tienes permiso para borrar sitios.' };
  const { error } = await s.supabase.from('sitios')
    .update({ borrado: true }).eq('id', id);   // la hora la pone la base de datos
  return error ? { ok: false, error: traducir(error.message) } : { ok: true };
}

export async function marcarPrincipal(clienteId: string, sitioId: string | null): Promise<{ ok: boolean; error?: string }> {
  comprobarEntrada("app/panel/(app)/sitios/acciones#marcarPrincipal", [clienteId, sitioId]);
  const s = await puede();
  if (!s) return { ok: false, error: 'No tienes permiso.' };
  const { error } = await s.supabase.rpc('marcar_sitio_principal', { p_cliente: clienteId, p_sitio: sitioId });
  return error ? { ok: false, error: traducir(error.message) } : { ok: true };
}
