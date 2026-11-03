'use server';

import { sesion, esGestor } from '@/lib/sesion';
import { randomUUID, createHash } from 'node:crypto';
import { pdfDeEnvioDynamo } from '@/lib/pdf/generar';

type Res = { ok: true; aviso?: string } | { ok: false; error: string };
const vacio = (s: string | null | undefined) => (s ?? '').trim() || null;
const ESTADOS_FASE = ['programado', 'hacia_la_carga', 'cargando', 'en_ruta', 'entregado'] as const;

function traducir(msg: string): string {
  if (/permission denied|42501|row-level security/i.test(msg)) return 'No tienes permiso para hacer esto.';
  if (/conductor_telefono|telefono/i.test(msg) && /check/i.test(msg)) return 'El teléfono del conductor no es válido.';
  return msg;   // los mensajes de las reglas de la base de datos ya vienen en castellano
}
async function soloDynamo() {
  const s = await sesion();
  if (!s?.perfil || s.perfil.estado !== 'activa' || !esGestor(s.perfil.rol)) return null;
  return s;
}

export type Asignacion = {
  transportista_id: string; importe_transportista: number | null;
  matricula_camion: string; matricula_remolque: string; conductor_nombre: string; conductor_telefono: string;
};

export async function asignarTransportista(envio: string, a: Asignacion): Promise<Res> {
  const s = await soloDynamo();
  if (!s) return { ok: false, error: 'Solo Dynamo asigna transportistas.' };
  if (!a.transportista_id) return { ok: false, error: 'Elige el transportista.' };
  const { data: t } = await s.supabase.from('transportistas').select('estado_operativo, nima').eq('id', a.transportista_id).single();
  if (!t) return { ok: false, error: 'Ese transportista no existe.' };
  if (t.estado_operativo === 'suspendido') return { ok: false, error: 'Ese transportista está suspendido: no se le puede dar carga.' };
  if (a.importe_transportista != null && (!Number.isFinite(a.importe_transportista) || a.importe_transportista < 0)) {
    return { ok: false, error: 'El precio del transportista no es un número válido.' };
  }
  const tel = a.conductor_telefono.replace(/[^\d+]/g, '');
  const mat = (m: string) => vacio(m.toUpperCase().replace(/[\s-]/g, ''));
  const { error } = await s.supabase.from('envios').update({
    transportista_id: a.transportista_id, estado_asignacion: 'confirmada',
    importe_transportista: a.importe_transportista,
    matricula_camion: mat(a.matricula_camion), matricula_remolque: mat(a.matricula_remolque),
    conductor_nombre: vacio(a.conductor_nombre), conductor_telefono: tel.replace('+', '').length >= 6 ? tel : null,
    transportista_nima: t.nima ?? null,
  }).eq('id', envio);
  return error ? { ok: false, error: traducir(error.message) } : { ok: true };
}

export async function quitarTransportista(envio: string): Promise<Res> {
  const s = await soloDynamo();
  if (!s) return { ok: false, error: 'Solo Dynamo asigna transportistas.' };
  const { error } = await s.supabase.from('envios').update({
    transportista_id: null, estado_asignacion: 'sin_asignar', importe_transportista: null,
    matricula_camion: null, matricula_remolque: null, conductor_nombre: null, conductor_telefono: null,
    vehiculo_camion_id: null, vehiculo_remolque_id: null, conductor_id: null, transportista_nima: null,
  }).eq('id', envio);
  return error ? { ok: false, error: traducir(error.message) } : { ok: true };
}

export async function cambiarEstado(envio: string, estado: string, fechaCargaReal: string | null): Promise<Res> {
  const s = await soloDynamo();
  if (!s) return { ok: false, error: 'Solo Dynamo cambia el estado de un envío.' };
  if (!(ESTADOS_FASE as readonly string[]).includes(estado)) return { ok: false, error: 'Ese estado no vale.' };
  const { data: e } = await s.supabase.from('envios').select('estado, transportista_id, es_manual').eq('id', envio).single();
  if (!e) return { ok: false, error: 'Ese envío no existe.' };
  if (e.estado === 'cancelado') return { ok: false, error: 'El envío está cancelado: deshaz antes la cancelación.' };
  if (estado !== 'programado' && !e.transportista_id && !e.es_manual) {
    return { ok: false, error: 'Asigna antes el transportista: sin camión el envío no puede ir hacia la carga.' };
  }
  const cambios: Record<string, unknown> = { estado };
  if (fechaCargaReal) cambios.fecha_carga_real = fechaCargaReal;
  const { error } = await s.supabase.from('envios').update(cambios).eq('id', envio);
  return error ? { ok: false, error: traducir(error.message) } : { ok: true };
}

export async function cancelarEnvio(envio: string, motivo: string): Promise<Res> {
  const s = await soloDynamo();
  if (!s) return { ok: false, error: 'Solo Dynamo cancela envíos desde la ficha.' };
  const { data, error } = await s.supabase.rpc('cancelar_envio', { p_envio: envio, p_motivo: motivo || null });
  if (error) return { ok: false, error: traducir(error.message) };
  const r = data as { penalizacion: boolean; importe: number | null };
  return { ok: true, aviso: r.penalizacion ? `Cancelado fuera de plazo con camión asignado: se ha generado la penalización de cancelación${r.importe != null ? ` (${Number(r.importe).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} € sin IVA)` : ''}, pendiente de confirmar.` : 'Envío cancelado, sin coste para el cliente.' };
}

export async function deshacerCancelacion(envio: string): Promise<Res> {
  const s = await soloDynamo();
  if (!s) return { ok: false, error: 'Solo Dynamo deshace cancelaciones.' };
  const { error } = await s.supabase.rpc('deshacer_cancelacion', { p_envio: envio });
  return error ? { ok: false, error: traducir(error.message) } : { ok: true };
}

export type DatosEnvio = {
  referencia_cliente: string; fecha_carga_desde: string; fecha_carga_hasta: string; fecha_entrega_estimada: string;
  descripcion_mercancia: string; metros_lineales: number | null; toneladas: number | null;
  paletizado: boolean; carga_lateral: boolean; carga_trasera: boolean; carga_superior: boolean;
  plataforma_elevadora: boolean; nima_requerido: boolean; adr: boolean;
  importe_cliente: number | null; importe_transportista: number | null;
  precio_acordado_operador: number | null;   // solo envíos manuales (con su propio transportista)
  discrecion_comercial: boolean; anotaciones_cliente: string;
  paradas: { id: string; referencia: string; anotaciones: string }[];
};

export async function modificarEnvio(envio: string, d: DatosEnvio, precioAntes: number | null): Promise<Res> {
  const s = await soloDynamo();
  if (!s) return { ok: false, error: 'Solo Dynamo modifica envíos desde la ficha.' };
  const nums = [d.metros_lineales, d.toneladas, d.importe_cliente, d.importe_transportista, d.precio_acordado_operador];
  if (nums.some((n) => n != null && (!Number.isFinite(n) || n < 0))) return { ok: false, error: 'Hay un número que no es válido.' };
  if (d.fecha_carga_desde && d.fecha_carga_hasta && d.fecha_carga_hasta < d.fecha_carga_desde) {
    return { ok: false, error: 'La fecha de carga «hasta» no puede ser anterior a la «desde».' };
  }
  const cambios: Record<string, unknown> = {
    referencia_cliente: vacio(d.referencia_cliente),
    fecha_carga_desde: d.fecha_carga_desde || null, fecha_carga_hasta: d.fecha_carga_hasta || null,
    fecha_entrega_estimada: d.fecha_entrega_estimada || null,
    descripcion_mercancia: vacio(d.descripcion_mercancia), metros_lineales: d.metros_lineales, toneladas: d.toneladas,
    paletizado: d.paletizado, carga_lateral: d.carga_lateral, carga_trasera: d.carga_trasera, carga_superior: d.carga_superior,
    plataforma_elevadora: d.plataforma_elevadora, nima_requerido: d.nima_requerido, adr: d.adr,
    importe_cliente: d.importe_cliente, importe_transportista: d.importe_transportista,
    discrecion_comercial: d.discrecion_comercial, anotaciones_cliente: vacio(d.anotaciones_cliente),
  };
  const { data: actual } = await s.supabase.from('envios').select('es_manual').eq('id', envio).single();
  if (actual?.es_manual) {
    // Envío manual: Dynamo no pone precios, solo se guarda el acordado con su operador.
    delete cambios.importe_cliente; delete cambios.importe_transportista;
    cambios.precio_acordado_operador = d.precio_acordado_operador;
  } else if (d.importe_cliente !== precioAntes) {
    // Si Dynamo cambia el precio del cliente, queda fijado a mano (el tarifador no lo pisará).
    cambios.precio_fijado_a_mano = d.importe_cliente != null;
  }
  const { error } = await s.supabase.from('envios').update(cambios).eq('id', envio);
  if (error) return { ok: false, error: traducir(error.message) };
  for (const p of d.paradas) {
    const r = await s.supabase.from('envio_paradas').update({ referencia: vacio(p.referencia), anotaciones: vacio(p.anotaciones) })
      .eq('id', p.id).eq('envio_id', envio);
    if (r.error) return { ok: false, error: traducir(r.error.message) };
  }
  return { ok: true };
}

export type NuevaOferta = { transportista_id: string | null; canal: string; precio: number; banda_pct: number; pronto_pago: boolean };

// Ofrecer la carga: crea la oferta (con su enlace) y devuelve el token del enlace.
export async function ofrecerCarga(envio: string, o: NuevaOferta): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
  const s = await soloDynamo();
  if (!s) return { ok: false, error: 'Solo Dynamo ofrece cargas.' };
  if (!Number.isFinite(o.precio) || o.precio <= 0) return { ok: false, error: 'Pon el precio que se ofrece al transportista.' };
  if (![0, 5, 10, 30].includes(o.banda_pct)) return { ok: false, error: 'La negociación solo puede ser 0, 5, 10 o 30 %.' };
  if (!o.transportista_id && !o.canal.startsWith('bolsa_')) return { ok: false, error: 'Sin transportista concreto, la oferta es de bolsa.' };
  const { data, error } = await s.supabase.rpc('ofertar_envio', {
    p_envio: envio, p_transportista: o.transportista_id, p_canal: o.canal, p_precio: o.precio,
    p_banda_pct: o.banda_pct, p_pronto_pago: o.pronto_pago,
  });
  if (error) return { ok: false, error: traducir(error.message) };
  const { data: of } = await s.supabase.from('envio_ofertas').select('token').eq('id', data as string).single();
  return of ? { ok: true, token: of.token as string } : { ok: false, error: 'La oferta se ha creado, pero no se encuentra su enlace.' };
}

export async function revocarOferta(oferta: string): Promise<Res> {
  const s = await soloDynamo();
  if (!s) return { ok: false, error: 'Solo Dynamo gestiona ofertas.' };
  const { error } = await s.supabase.from('envio_ofertas').update({ estado: 'revocada' }).eq('id', oferta).eq('estado', 'activa');
  return error ? { ok: false, error: traducir(error.message) } : { ok: true };
}

export async function resolverContraoferta(reserva: string, aprobar: boolean): Promise<Res> {
  const s = await soloDynamo();
  if (!s) return { ok: false, error: 'Solo Dynamo resuelve contraofertas.' };
  const { data, error } = await s.supabase.rpc('resolver_contraoferta', { p_reserva: reserva, p_aprobar: aprobar });
  if (error) return { ok: false, error: traducir(error.message) };
  const r = (data as { resultado: string }).resultado;
  if (r === 'no_hay_contraoferta_pendiente') return { ok: false, error: 'Esa contraoferta ya no está pendiente.' };
  return { ok: true, aviso: aprobar ? 'Contraoferta aprobada: el transportista queda asignado a su precio.' : 'Contraoferta rechazada: la carga vuelve a estar ofertada.' };
}

// CMR digital: el enlace para que firmen cargador, transportista y destinatario. Uno vivo
// por envío; si ya hay uno, se devuelve ese (así se puede volver a mandar sin invalidarlo).
export async function enlaceCmr(envio: string): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
  const s = await soloDynamo();
  if (!s) return { ok: false, error: 'Solo Dynamo genera el CMR digital.' };
  const vivo = await s.supabase.from('cmr_enlaces').select('token').eq('envio_id', envio).eq('revocado', false).gt('caduca_en', new Date().toISOString()).maybeSingle();
  if (vivo.data) return { ok: true, token: vivo.data.token as string };
  // Uno caducado sin retirar ocuparía el hueco del enlace vivo: se retira antes.
  await s.supabase.from('cmr_enlaces').update({ revocado: true }).eq('envio_id', envio).eq('revocado', false);
  const { data, error } = await s.supabase.from('cmr_enlaces').insert({ envio_id: envio }).select('token').single();
  return error || !data ? { ok: false, error: traducir(error?.message ?? 'No se ha podido crear el enlace.') } : { ok: true, token: data.token as string };
}

// Retirar el enlace: deja de abrirse. Las firmas ya hechas se quedan (no se borran nunca).
export async function retirarEnlaceCmr(enlace: string): Promise<Res> {
  const s = await soloDynamo();
  if (!s) return { ok: false, error: 'Solo Dynamo gestiona el CMR digital.' };
  const { error } = await s.supabase.from('cmr_enlaces').update({ revocado: true }).eq('id', enlace);
  return error ? { ok: false, error: traducir(error.message) } : { ok: true };
}

// Valoración del transportista (1-5) al entregar. Solo Dynamo; la media la rehace la base de datos.
export async function valorarTransportista(envio: string, nota: number | null, comentario: string): Promise<Res> {
  const s = await soloDynamo();
  if (!s) return { ok: false, error: 'Solo Dynamo valora a los transportistas.' };
  if (nota != null && (!Number.isInteger(nota) || nota < 1 || nota > 5)) return { ok: false, error: 'La nota va de 1 a 5.' };
  const { error } = await s.supabase.from('envios').update({ valoracion_transportista: nota, valoracion_comentario: vacio(comentario) }).eq('id', envio);
  return error ? { ok: false, error: traducir(error.message) } : { ok: true, aviso: nota ? 'Valoración guardada.' : 'Valoración quitada.' };
}

// «Guardar copia en documentos»: la orden de carga o el CMR tal y como salen AHORA, como
// documento del envío (queda con su huella sha256, quién y cuándo). Para tener constancia
// de lo que se mandó, aunque el envío cambie después. Solo Dynamo.
export async function archivarPdf(envioId: string, documento: 'orden-de-carga' | 'cmr'): Promise<{ ok: boolean; error?: string; aviso?: string }> {
  const s = await sesion();
  if (!s?.perfil || s.perfil.estado !== 'activa' || !esGestor(s.perfil.rol)) return { ok: false, error: 'Solo el equipo de Dynamo guarda copias.' };
  const r = await pdfDeEnvioDynamo(s.supabase, envioId, documento, s.perfil.id);
  if ('error' in r) return { ok: false, error: r.error };
  const fecha = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '').replace(/^(\d{8})(\d{4})$/, '$1-$2');
  const nombre = r.nombre.replace(/\.pdf$/, `-${fecha}.pdf`);
  const ruta = `envios/${envioId}/${randomUUID()}/${nombre}`;
  const { error: eSubida } = await s.supabase.storage.from('documentos').upload(ruta, r.bytes, { contentType: 'application/pdf', upsert: false });
  if (eSubida) return { ok: false, error: `No se ha podido guardar el archivo: ${eSubida.message}` };
  const sha = createHash('sha256').update(r.bytes).digest('hex');
  const { error } = await s.supabase.from('documentos').insert({
    envio_id: envioId, tipo: documento === 'cmr' ? 'cmr' : 'orden_transporte', storage_bucket: 'documentos', storage_ruta: ruta,
    nombre_archivo: nombre, tipo_mime: 'application/pdf', tamano_bytes: r.bytes.length, sha256: sha, visible_cliente: false,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, aviso: `Copia guardada en los documentos del envío: ${nombre}.` };
}
