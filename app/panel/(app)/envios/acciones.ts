'use server';

import { mensajeError } from '@/lib/mensajeError';
import { sesion, esGestor } from '@/lib/sesion';
import { randomUUID, createHash } from 'node:crypto';
import { pdfDeEnvioDynamo } from '@/lib/pdf/generar';
import { vistaCruda } from '@/lib/vista';
import { euros } from '@/lib/formato';
import { flotaDe, type FlotaTransportista, type TransportistaOpcion } from '@/lib/fichaEnvio';
import type { TablaUpdate } from '@/lib/supabase/tipos';
import type { SB } from '@/lib/supabase/cliente';
import { soloGestor } from '@/lib/guardia';
import { comprobarEntrada } from '@/lib/entradas/comprobar';

type Res = { ok: true; aviso?: string } | { ok: false; error: string };
const vacio = (s: string | null | undefined) => (s ?? '').trim() || null;

function traducir(msg: string): string {
  if (/permission denied|42501|row-level security/i.test(msg)) return 'No tienes permiso para hacer esto.';
  if (/conductor_telefono|telefono/i.test(msg) && /check/i.test(msg)) return 'El teléfono del conductor no es válido.';
  return mensajeError(msg);   // los de las reglas de la base de datos ya vienen en castellano
}
const soloDynamo = soloGestor;

export type Asignacion = {
  transportista_id: string; importe_transportista: number | null;
  matricula_camion: string; matricula_remolque: string; conductor_nombre: string; conductor_telefono: string;
  fecha_carga_prevista?: string | null;   // día en que carga (obligatorio si el envío tiene ventana)
  fecha_entrega_estimada?: string | null;  // día de entrega, SIEMPRE estimado (la pantalla lo exige)
  motivo?: string;                        // motivo del cambio para el DeCA (si ya está emitido)
};

export async function asignarTransportista(envio: string, a: Asignacion): Promise<Res> {
  comprobarEntrada("app/panel/(app)/envios/acciones#asignarTransportista", [envio, a]);
  const s = await soloDynamo();
  if (!s) return { ok: false, error: 'Solo Dynamo asigna transportistas.' };
  if (!a.transportista_id) return { ok: false, error: 'Elige el transportista.' };
  if (!a.fecha_entrega_estimada) return { ok: false, error: 'Elige el día de entrega (estimado).' };
  if (a.importe_transportista != null && !Number.isFinite(a.importe_transportista)) return { ok: false, error: 'El precio del transportista no es un número válido.' };
  // Las reglas (suspendido, NIMA, matrícula en mayúsculas, teléfono) las pone la base de datos.
  const { data, error } = await s.supabase.rpc('asignar_transportista', {
    p_envio: envio, p_transportista: a.transportista_id, p_importe_transportista: a.importe_transportista,
    p_matricula_camion: a.matricula_camion, p_matricula_remolque: a.matricula_remolque,
    p_conductor_nombre: a.conductor_nombre, p_conductor_telefono: a.conductor_telefono,
    p_fecha_carga_prevista: a.fecha_carga_prevista || null, p_fecha_entrega_estimada: a.fecha_entrega_estimada,
  });
  if (error) return { ok: false, error: traducir(error.message) };
  const r = (data as { ok: boolean; resultado: string });
  if (r.ok) {
    await anotarMotivo(s.supabase, envio, a.motivo);
    // Email de ORDEN DE CARGA al transportista (usuario, 2026-11-12): con el PDF
    // adjunto y los enlaces de descarga. Nunca rompe la asignación.
    const { avisoOrdenCarga } = await import('@/lib/servidor/avisosEnvio');
    await avisoOrdenCarga(s.supabase, s.user.id, envio).catch(() => {});
    await copiaDeca(s.supabase, envio);
    return { ok: true };
  }
  return { ok: false, error: ({ transportista_suspendido: 'Ese transportista está suspendido: no se le pueden dar envíos.', transportista_no_existe: 'Ese transportista no existe.',
    importe_no_valido: 'El precio del transportista no es un número válido.', no_existe: 'Ese envío no existe.',
    falta_precio: 'Pon el precio del transportista (mayor que 0): sin precio no se puede asignar.',
    falta_fecha_prevista: 'Elige el día en que carga: el envío tiene varios días de recogida.', fecha_fuera_de_ventana: 'El día de carga tiene que estar dentro de los días de recogida.',
    entrega_antes_de_cargar: 'El día de entrega (estimado) no puede ser anterior al día en que carga.' } as Record<string, string>)[r.resultado] ?? 'No se ha podido asignar.' };
}

// Día de entrega ESTIMADO si el envío cargara ese día: lo calcula el motor del
// seguimiento (tacógrafo, velocidad y minutos por parada de Parámetros, km entre
// paradas y apertura de los sitios). La pantalla de asignación lo preselecciona y
// se puede pisar a mano (usuario, 2026-11-09).
export async function sugerirEntrega(envio: string, dia: string): Promise<string | null> {
  comprobarEntrada("app/panel/(app)/envios/acciones#sugerirEntrega", [envio, dia]);
  const s = await soloDynamo();
  if (!s) return null;
  const { data, error } = await s.supabase.rpc('entrega_estimada_sugerida', { p_envio: envio, p_dia: dia });
  return error ? null : (data as string | null);
}

export async function quitarTransportista(envio: string): Promise<Res> {
  comprobarEntrada("app/panel/(app)/envios/acciones#quitarTransportista", [envio]);
  const s = await soloDynamo();
  if (!s) return { ok: false, error: 'Solo Dynamo asigna transportistas.' };
  // La base de datos limpia también camión, conductor, NIMA y precio del transportista.
  const { error } = await s.supabase.rpc('quitar_transportista', { p_envio: envio });
  if (error) return { ok: false, error: traducir(error.message) };
  await copiaDeca(s.supabase, envio);
  return { ok: true };
}

// Seguimiento (usuario, 2026-11-06): marcar a mano en qué etapa está el envío y desde qué
// hora; el automático sigue desde ahí con los mismos plazos. Una hora futura atrasa.
export async function marcarEtapa(envio: string, paso: number, hora: string | null): Promise<Res> {
  comprobarEntrada("app/panel/(app)/envios/acciones#marcarEtapa", [envio, paso, hora]);
  const s = await soloDynamo();
  if (!s) return { ok: false, error: 'Solo Dynamo cambia el estado de un envío.' };
  if (!Number.isInteger(paso) || paso < 0) return { ok: false, error: 'Esa etapa no vale.' };
  if (hora && Number.isNaN(Date.parse(hora))) return { ok: false, error: 'La hora no es válida.' };
  const { data, error } = await s.supabase.rpc('marcar_etapa_envio', { p_envio: envio, p_paso: paso, p_hora: hora || null });
  if (error) return { ok: false, error: traducir(error.message) };
  const r = (data as { ok: boolean; resultado: string });
  if (r.ok) return { ok: true };
  return { ok: false, error: ({ cancelado: 'El envío está cancelado: deshaz antes la cancelación.', no_existe: 'Ese envío no existe.', borrador: 'El envío aún no está confirmado.',
    sin_transportista: 'Asigna antes el transportista: sin camión el envío no puede ir hacia la carga.', etapa_no_valida: 'Esa etapa no vale.',
    hora_no_valida: 'La hora tiene que estar entre hace 30 días y dentro de 14.' } as Record<string, string>)[r.resultado] ?? 'No se ha podido cambiar.' };
}

export async function pausarSeguimiento(envio: string, pausar: boolean): Promise<Res> {
  comprobarEntrada("app/panel/(app)/envios/acciones#pausarSeguimiento", [envio, pausar]);
  const s = await soloDynamo();
  if (!s) return { ok: false, error: 'Solo Dynamo cambia el estado de un envío.' };
  const { data, error } = await s.supabase.rpc('pausar_seguimiento_envio', { p_envio: envio, p_pausar: pausar });
  if (error) return { ok: false, error: traducir(error.message) };
  return (data as { ok: boolean }).ok ? { ok: true } : { ok: false, error: 'Ese envío no existe.' };
}

export async function cancelarEnvio(envio: string, motivo: string): Promise<Res> {
  comprobarEntrada("app/panel/(app)/envios/acciones#cancelarEnvio", [envio, motivo]);
  const s = await soloDynamo();
  if (!s) return { ok: false, error: 'Solo Dynamo cancela envíos desde la ficha.' };
  // Desde la vista del cliente («Ver como») es como si llamara él: cuenta como cancelación suya.
  const enNombre = (await vistaCruda()).tipo === 'cliente';
  const { data, error } = await s.supabase.rpc('cancelar_envio', { p_envio: envio, p_motivo: motivo || null, p_en_nombre_cliente: enNombre });
  if (error) return { ok: false, error: traducir(error.message) };
  const r = data as { penalizacion: boolean; importe: number | null };
  return { ok: true, aviso: r.penalizacion ? `Cancelado fuera de plazo con camión asignado: se ha generado la penalización de cancelación${r.importe != null ? ` (${euros(Number(r.importe))} sin IVA)` : ''}, pendiente de confirmar.` : 'Envío cancelado, sin coste para el cliente.' };
}

// Responder una propuesta de cambios EN NOMBRE del transportista (usuario, 2026-11-10:
// tras llamarle y negociar por teléfono). El rechazo desasigna el envío automáticamente.
export async function responderCambioEnNombre(cambio: string, acepta: boolean, motivo?: string): Promise<{ ok: true; aviso?: string } | { ok: false; error: string }> {
  comprobarEntrada("app/panel/(app)/envios/acciones#responderCambioEnNombre", [cambio, acepta, motivo]);
  const s = await sesion();
  if (!s?.perfil || s.perfil.estado !== 'activa' || !esGestor(s.perfil.rol)) return { ok: false, error: 'Solo el equipo de Dynamo responde en nombre del transportista.' };
  const { data, error } = await s.supabase.rpc('responder_cambio_transportista', { p_cambio: cambio, p_acepta: acepta, p_motivo: motivo ?? null, p_en_nombre: true });
  if (error) return { ok: false, error: traducir(error.message) };
  const r = (data as { ok: boolean; resultado: string }) ?? { ok: false, resultado: '' };
  if (!r.ok) return { ok: false, error: r.resultado === 'ya_respondido' ? 'Estos cambios ya estaban respondidos.' : 'No se ha podido guardar la respuesta.' };
  await copiaDeca(s.supabase, (await s.supabase.from('envio_cambios_transportista').select('envio_id').eq('id', cambio).maybeSingle()).data?.envio_id);
  return { ok: true, aviso: acepta ? 'Cambios aceptados en nombre del transportista.' : 'Rechazo registrado: el envío queda sin transportista.' };
}

export async function deshacerCancelacion(envio: string): Promise<Res> {
  comprobarEntrada("app/panel/(app)/envios/acciones#deshacerCancelacion", [envio]);
  const s = await soloDynamo();
  if (!s) return { ok: false, error: 'Solo Dynamo deshace cancelaciones.' };
  const { error } = await s.supabase.rpc('deshacer_cancelacion', { p_envio: envio });
  return error ? { ok: false, error: traducir(error.message) } : { ok: true };
}

export type DatosEnvio = {
  referencia_cliente: string; fecha_carga_desde: string; fecha_carga_hasta: string; fecha_entrega_estimada: string;
  descripcion_mercancia: string; metros_lineales: number | null; toneladas: number | null;
  paletizado: boolean; carga_lateral: boolean; carga_trasera: boolean; carga_techo: boolean;
  requiere_plataforma_elevadora: boolean; requiere_nima: boolean; adr: boolean;
  importe_cliente: number | null; importe_transportista: number | null; negociacion_pct?: number | null;
  precio_acordado_operador: number | null;   // solo envíos manuales (con su propio transportista)
  discrecion_comercial: boolean; anotaciones_cliente: string;
  paradas: { id: string; referencia: string; anotaciones: string }[];
};

// Camión y conductor del envío MANUAL (usuario, 2026-11-14): el dueño (o Dynamo) los
// pone o cambia en cualquier momento salvo cancelado; la orden de transporte y el CMR
// que se generen después los recogen (si se olvidaron al crear, se completan aquí).
export async function ponerCamionManual(envio: string, d: { matricula_camion: string; matricula_remolque: string; conductor_nombre: string; conductor_telefono: string }): Promise<Res> {
  comprobarEntrada("app/panel/(app)/envios/acciones#ponerCamionManual", [envio, d]);
  const s = await sesion();
  if (!s?.perfil || s.perfil.estado !== 'activa') return { ok: false, error: 'Tu cuenta no está activa.' };
  const { data, error } = await s.supabase.rpc('poner_camion_mi_envio_manual', {
    p_envio: envio, p_matricula_camion: d.matricula_camion, p_matricula_remolque: d.matricula_remolque,
    p_conductor_nombre: d.conductor_nombre, p_conductor_telefono: d.conductor_telefono,
  });
  if (error) return { ok: false, error: traducir(error.message) };
  const r = (data ?? {}) as { resultado?: string };
  if (r.resultado === 'cancelado') return { ok: false, error: 'El envío está cancelado: ya no se cambia su camión.' };
  if (r.resultado === 'matricula_no_valida') return { ok: false, error: 'La matrícula es demasiado larga: revísala.' };
  if (r.resultado === 'conductor_no_valido') return { ok: false, error: 'El nombre o el teléfono del conductor no son válidos.' };
  if (r.resultado !== 'ok') return { ok: false, error: 'No se ha podido guardar.' };
  return { ok: true };
}

export async function modificarEnvio(envio: string, d: DatosEnvio, precioAntes: number | null, motivo?: string): Promise<Res> {
  comprobarEntrada("app/panel/(app)/envios/acciones#modificarEnvio", [envio, d, precioAntes, motivo]);
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
    paletizado: d.paletizado, carga_lateral: d.carga_lateral, carga_trasera: d.carga_trasera, carga_techo: d.carga_techo,
    requiere_plataforma_elevadora: d.requiere_plataforma_elevadora, requiere_nima: d.requiere_nima, adr: d.adr,
    importe_cliente: d.importe_cliente, importe_transportista: d.importe_transportista,
    ...(d.negociacion_pct !== undefined ? { negociacion_pct: [0, 5, 10, 30].includes(d.negociacion_pct as number) ? d.negociacion_pct : null } : {}),
    discrecion_comercial: d.discrecion_comercial, anotaciones_cliente: vacio(d.anotaciones_cliente),
  };
  const { data: actual } = await s.supabase.from('envios').select('es_manual').eq('id', envio).single();
  if (actual?.es_manual) {
    // Envío manual: Dynamo no pone precios, solo se guarda el acordado con su operador.
    delete cambios.importe_cliente; delete cambios.importe_transportista; delete cambios.negociacion_pct;
    cambios.precio_acordado_operador = d.precio_acordado_operador;
  } else if (d.importe_cliente !== precioAntes) {
    // Si Dynamo cambia el precio del cliente, queda fijado a mano (el tarifador no lo pisará).
    cambios.precio_fijado_a_mano = d.importe_cliente != null;
  }
  const { error } = await s.supabase.from('envios').update(cambios as TablaUpdate<'envios'>).eq('id', envio);
  if (error) return { ok: false, error: traducir(error.message) };
  for (const p of d.paradas) {
    const r = await s.supabase.from('envio_paradas').update({ referencia: vacio(p.referencia), anotaciones: vacio(p.anotaciones) })
      .eq('id', p.id).eq('envio_id', envio);
    if (r.error) return { ok: false, error: traducir(r.error.message) };
  }
  await anotarMotivo(s.supabase, envio, motivo);
  await copiaDeca(s.supabase, envio);
  return { ok: true };
}

// Copia archivada del DeCA tras un cambio (conservación legal de un año; cada versión nueva
// se envía además sola al transportista): se guarda
// después de responder y solo si el documento ya está emitido y esa versión no estaba.
async function copiaDeca(sb: SB, envio: string | null | undefined) {
  if (!envio) return;
  const { programarCopiaDeca } = await import('@/lib/servidor/archivoDeca');
  await programarCopiaDeca({ envioId: envio, sbDynamo: sb });
}

// MOTIVO DEL CAMBIO para el panel de modificaciones del DeCA (Resolución 5-jun-2026,
// apdo. quinto.1: «los nuevos datos … así como el motivo del cambio»). Se anota justo
// después del cambio y el PDF lo empareja con él. Vacío: el PDF pone uno genérico.
async function anotarMotivo(sb: SB, envio: string, motivo?: string) {
  const m = (motivo ?? '').trim();
  if (m.length < 3) return;
  await sb.rpc('anotar_motivo_deca', { p_envio: envio, p_motivo: m.slice(0, 300) });
}

export type NuevaOferta = { transportista_id: string | null; canal: string; precio: number; banda_pct: number; pronto_pago: boolean };

// Ofrecer la carga: crea la oferta (con su enlace) y devuelve el token del enlace.
export async function ofrecerCarga(envio: string, o: NuevaOferta): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
  comprobarEntrada("app/panel/(app)/envios/acciones#ofrecerCarga", [envio, o]);
  const s = await soloDynamo();
  if (!s) return { ok: false, error: 'Solo Dynamo ofrece envíos.' };
  if (!Number.isFinite(o.precio) || o.precio <= 0) return { ok: false, error: 'Pon el precio que se ofrece al transportista.' };
  if (![0, 5, 10, 30].includes(o.banda_pct)) return { ok: false, error: 'La negociación solo puede ser 0, 5, 10 o 30 %.' };
  const { data, error } = await s.supabase.rpc('ofertar_envio', {
    p_envio: envio, p_transportista: o.transportista_id, p_canal: o.canal, p_precio: o.precio,
    p_banda_pct: o.banda_pct, p_pronto_pago: o.pronto_pago,
  });
  if (error) return { ok: false, error: traducir(error.message) };
  const { data: of } = await s.supabase.from('envio_ofertas').select('token').eq('id', data as string).single();
  return of ? { ok: true, token: of.token as string } : { ok: false, error: 'La oferta se ha creado, pero no se encuentra su enlace.' };
}

// Oferta ESCALONADA por email, gobernada por la fecha de carga (usuario, 2026-11-15):
// duerme hasta N días antes de la carga, manda por tramos de cadencia (más seguido cuanto
// menos falte, de 5:30 a 23:30, los 365 días), recuerda a diario a los contactados y corta X horas
// antes de la hora de carga (la indicada aquí, o las 8:00). Dentro del corte no se lanza
// salvo forzarla a sabiendas (1 hora de margen).
export async function iniciarDifusion(envio: string, o: { precio: number; banda_pct: number; pronto_pago: boolean; hora_carga?: string | null; forzar?: boolean }): Promise<{ ok: true; empieza: string | null; corte: string | null } | { ok: false; error: string; dentroCorte?: boolean }> {
  comprobarEntrada("app/panel/(app)/envios/acciones#iniciarDifusion", [envio, o]);
  const s = await soloDynamo();
  if (!s) return { ok: false, error: 'Solo Dynamo lanza ofertas escalonadas.' };
  if (!Number.isFinite(o.precio) || o.precio <= 0) return { ok: false, error: 'Pon el precio que se ofrece a los transportistas.' };
  if (![0, 5, 10, 30].includes(o.banda_pct)) return { ok: false, error: 'La negociación solo puede ser 0, 5, 10 o 30 %.' };
  const hora = (o.hora_carga ?? '').trim();
  if (hora && !/^([01]\d|2[0-3]):[0-5]\d$/.test(hora)) return { ok: false, error: 'La hora de carga tiene que ser HH:MM (por ejemplo 08:00).' };
  const { data, error } = await s.supabase.rpc('iniciar_difusion', {
    p_envio: envio, p_precio: o.precio, p_banda_pct: o.banda_pct, p_pronto_pago: o.pronto_pago,
    p_hora_carga: hora || undefined, p_forzar: o.forzar === true,
  });
  if (error) return { ok: false, error: traducir(error.message) };
  const d = data as { resultado?: string; empieza?: string | null; corte?: string | null; carga_prevista?: string; horas_corte?: number } | null;
  const r = d?.resultado;
  if (r === 'dentro_del_corte') {
    return { ok: false, dentroCorte: true, error: `El plazo de la oferta ya ha pasado (el sitio de carga cerraba el ${d?.carga_prevista ?? '—'}): esto ya es de teléfono. Puedes lanzarla igualmente con 1 hora de margen.` };
  }
  if (r !== 'ok') {
    const msg: Record<string, string> = {
      no_existe: 'Ese envío no existe.',
      no_programado: 'El envío no está programado: no se puede ofrecer.',
      ya_asignado: 'El envío ya tiene transportista.',
      precio_no_valido: 'Pon el precio que se ofrece a los transportistas.',
      ya_activa: 'Este envío ya tiene una oferta escalonada en marcha.',
      manual: 'Es un envío con transportista propio del cliente: Dynamo no lo oferta.',
    };
    return { ok: false, error: msg[r ?? ''] ?? 'No se ha podido lanzar la oferta escalonada.' };
  }
  return { ok: true, empieza: d?.empieza ?? null, corte: d?.corte ?? null };
}

export async function pararDifusion(envio: string): Promise<{ ok: true } | { ok: false; error: string }> {
  comprobarEntrada("app/panel/(app)/envios/acciones#pararDifusion", [envio]);
  const s = await soloDynamo();
  if (!s) return { ok: false, error: 'Solo Dynamo para ofertas escalonadas.' };
  const { data, error } = await s.supabase.rpc('parar_difusion', { p_envio: envio });
  if (error) return { ok: false, error: traducir(error.message) };
  const r = (data as { resultado?: string } | null)?.resultado;
  if (r !== 'ok') return { ok: false, error: 'Este envío no tiene ninguna oferta escalonada en marcha.' };
  return { ok: true };
}

// Para el diálogo de compartir la ORDEN DE CARGA (usuario, 2026-11-10): el contacto del
// transportista asignado (email y teléfono, el de tráfico o el principal), su idioma por
// país y la clave de las variantes con precio (su id: solo lo tiene quien recibe el enlace).
export async function datosOrden(envio: string): Promise<{ ok: true; email: string | null; telefono: string | null; idioma: string; clave: string; claveCliente: string | null; bolsa: string | null; codigoBolsa: string | null; clienteEmail: string | null; clienteTelefono: string | null } | { ok: false; error: string }> {
  comprobarEntrada("app/panel/(app)/envios/acciones#datosOrden", [envio]);
  const s = await soloDynamo();
  if (!s) return { ok: false, error: 'Solo Dynamo comparte la orden de carga.' };
  const { data: e } = await s.supabase.from('envios').select('transportista_id, cliente_id, transportistas(pais_codigo_iso, bolsa, codigo_bolsa)')
    .eq('id', envio).maybeSingle<{ transportista_id: string | null; cliente_id: string | null; transportistas: { pais_codigo_iso: string | null; bolsa: string | null; codigo_bolsa: string | null } | null }>();
  if (!e?.transportista_id) return { ok: false, error: 'Este envío no tiene transportista asignado.' };
  const { data: c } = await s.supabase.from('contactos').select('nombre, email, telefono, funcion, es_principal')
    .eq('transportista_id', e.transportista_id)
    .order('es_principal', { ascending: false }).limit(10);
  const cto = (c ?? []).sort((a, b) => Number(b.funcion === 'trafico') - Number(a.funcion === 'trafico'))[0] ?? null;
  // El contacto del CLIENTE, para la sección «Para el cliente» del diálogo de compartir
  // (usuario, 2026-11-13): su principal, con email o teléfono.
  const { data: cc } = e.cliente_id
    ? await s.supabase.from('contactos').select('email, telefono, es_principal').eq('cliente_id', e.cliente_id)
        .order('es_principal', { ascending: false }).limit(10)
    : { data: null };
  const ccli = (cc ?? []).find((x) => x.email || x.telefono) ?? null;
  const { idiomaDePais } = await import('@/lib/pdf/ordenTextos');
  return { ok: true, email: cto?.email ?? null, telefono: cto?.telefono ?? null,
    idioma: idiomaDePais(e.transportistas?.pais_codigo_iso), clave: e.transportista_id,
    claveCliente: e.cliente_id,   // la clave de la COPIA CLIENTE del enlace público (2026-11-14)
    bolsa: e.transportistas?.bolsa ?? null, codigoBolsa: e.transportistas?.codigo_bolsa ?? null,
    clienteEmail: ccli?.email ?? null, clienteTelefono: ccli?.telefono ?? null };
}

// Enviar la orden (o el resumen del cliente) POR EMAIL DESDE LA PLATAFORMA, con el PDF
// adjunto de verdad (usuario, 2026-11-13: «mailto no puede autoadjuntar»). Va por
// Postmark con el registro de siempre; al transportista se adjunta LA orden de carga
// (documento completo — una sola orden, usuario 2026-11-14) y al cliente SU copia (con
// su precio + IVA y sin los datos ni el precio del transportista, usuario 2026-11-14).
export async function emailOrdenPlataforma(envio: string, para: 'transportista' | 'cliente', mensaje: string):
  Promise<{ ok: true; para: string } | { ok: false; error: string }> {
  comprobarEntrada("app/panel/(app)/envios/acciones#emailOrdenPlataforma", [envio, para, mensaje]);
  const s = await soloDynamo();
  if (!s) return { ok: false, error: 'Solo Dynamo comparte la orden de carga.' };
  if (!/^[0-9a-f-]{36}$/i.test(envio) || !['transportista', 'cliente'].includes(para)) return { ok: false, error: 'Petición no válida.' };
  const r = await datosOrden(envio);
  if (!r.ok) return r;
  const dest = para === 'transportista' ? r.email : r.clienteEmail;
  if (!dest) return { ok: false, error: para === 'transportista' ? 'El transportista no tiene email en su ficha.' : 'El cliente no tiene email en sus contactos.' };
  const { data: e } = await s.supabase.from('envios').select('referencia_gx').eq('id', envio).maybeSingle();
  const ref = e?.referencia_gx ?? '';
  const [{ enviarEmailOperativo }, { origen }] = await Promise.all([import('@/lib/servidor/emailOperativo'), import('@/lib/origen')]);
  const { pdfsOrdenDynamo } = await import('@/lib/pdf/generar');
  const pd = await pdfsOrdenDynamo(s.supabase, envio, s.user.id, [para === 'transportista' ? 'economica' : 'cliente'], await origen());
  if ('error' in pd) return { ok: false, error: pd.error };
  const adjuntos = pd.pdfs.map((x) => ({ nombre: x.nombre, base64: Buffer.from(x.bytes).toString('base64'), tipo: 'application/pdf' }));
  // El mensaje de la pantalla, línea a línea; cada dirección web, un botón con el nombre de
  // la acción (usuario, 2026-11-19: botones, no enlaces).
  const { htmlDeMensaje } = await import('@/lib/emailBoton');
  const html = htmlDeMensaje(mensaje.slice(0, 4000));
  const res = await enviarEmailOperativo({
    clave: `orden_manual:${envio}:${para}:${Date.now()}`, tipo: 'orden_carga', envioId: envio, para: dest,
    asunto: para === 'transportista' ? `Orden de carga #${ref} · Dynamo` : `Tu envío #${ref} · Dynamo`,
    html, adjuntos,
  });
  return res.estado === 'enviado' ? { ok: true, para: dest } : { ok: false, error: res.error ?? 'No se ha podido enviar.' };
}

// EL DeCA AL TRANSPORTISTA, A MANO (usuario, 2026-11-15): el botón «DeCA» de la ficha. El
// mismo email que sale solo al emitirse o cambiar el documento —el PDF del DeCA adjunto
// y su dirección pública—, para reenviarlo cuando haga falta. Solo con el DeCA emitido
// (transportista y matrículas).
export async function emailDecaPlataforma(envio: string): Promise<{ ok: true; para: string } | { ok: false; error: string }> {
  comprobarEntrada("app/panel/(app)/envios/acciones#emailDecaPlataforma", [envio]);
  const s = await soloDynamo();
  if (!s) return { ok: false, error: 'Solo Dynamo envía el DeCA.' };
  if (!/^[0-9a-f-]{36}$/i.test(envio)) return { ok: false, error: 'Petición no válida.' };
  const { data: enl } = await s.supabase.from('cmr_enlaces').select('token').eq('envio_id', envio).eq('revocado', false)
    .order('creado_en', { ascending: false }).limit(1).maybeSingle();
  if (!enl?.token) return { ok: false, error: 'El enlace del envío está retirado: créalo de nuevo desde el botón del CMR.' };
  const [{ supabasePublico }, { cargarDatosCmrPorToken, decaConMatriculas }, { pdfDecaDeDatos }, { origen }, { avisoDecaTransportista }] = await Promise.all([
    import('@/lib/supabase/publico'), import('@/lib/pdf/datos'), import('@/lib/pdf/generar'), import('@/lib/origen'), import('@/lib/servidor/avisosEnvio')]);
  const sbp = supabasePublico();
  if (!sbp) return { ok: false, error: 'La plataforma no está conectada.' };
  const r = await cargarDatosCmrPorToken(sbp, enl.token);
  if (!r.datos || !r.datos.porteador) return { ok: false, error: 'Este envío no tiene transportista asignado: todavía no hay DeCA.' };
  if (!decaConMatriculas(r.datos)) return { ok: false, error: 'El DeCA no se envía sin matrículas: ponle antes las del camión (tractora y, en un tráiler, semirremolque).' };
  const web = await origen();
  const pdf = await pdfDecaDeDatos(r.datos, r.decaCreado, enl.token, web);
  const res = await avisoDecaTransportista({ envioId: envio, token: enl.token, origen: web, version: 'manual', primera: true, pdf,
    clave: `deca_manual:${envio}:${Date.now()}` });
  if (res.estado !== 'enviado') return { ok: false, error: res.sinEmail ? 'El transportista no tiene email en su ficha.' : res.error ?? 'No se ha podido enviar.' };
  return { ok: true, para: res.para ?? '' };
}

// HISTORIAL DE ENVÍOS de cada documento que se comparte desde la ficha (usuario, 2026-11-15:
// primero el DeCA, luego «para eCMR igual… para orden de carga igual», en sus dos pestañas):
// cada vez que ha salido hacia alguien, con su fecha y hora y la vía — los emails de la
// plataforma (automáticos y manuales, con su destinatario y si salieron) y lo compartido a
// mano (WhatsApp, email propio, SMS, enlace copiado). Lo más reciente, arriba.
export type DocHistorial = 'deca' | 'cmr' | 'orden_transportista' | 'orden_cliente';
export type EnvioHist = { id: string; cuando: string; modo: 'auto' | 'manual'; via: string; para: string | null; que: string | null;
  estado: 'enviado' | 'pendiente' | 'error' | 'compartido'; detalle: string | null; autor: string | null };
const DOCS_HIST = ['deca', 'cmr', 'orden_transportista', 'orden_cliente'];
// Qué emails del registro son de cada documento (por su tipo y su clave).
function esEmailDe(doc: string, x: { tipo: string; clave: string; asunto: string }): boolean {
  if (doc === 'deca') return x.tipo === 'deca';
  // CMR: avisos y copias de firma, el CMR completo y los avisos a los sitios que llevan su enlace.
  if (doc === 'cmr') return x.tipo === 'firma_cmr' || x.tipo === 'cmr_completo' || (x.tipo === 'aviso_parada' && /\bCMR\b/.test(x.asunto));
  if (x.tipo !== 'orden_carga') return false;
  const cli = x.clave.startsWith('orden_carga_cliente:') || /^orden_manual:[^:]+:cliente:/.test(x.clave);
  return doc === 'orden_cliente' ? cli : !cli;
}
export async function historialEnvios(envio: string, documento: string): Promise<EnvioHist[]> {
  comprobarEntrada("app/panel/(app)/envios/acciones#historialEnvios", [envio, documento]);
  const s = await soloDynamo();
  if (!s || !/^[0-9a-f-]{36}$/i.test(envio) || !DOCS_HIST.includes(documento)) return [];
  const [em, co] = await Promise.all([
    s.supabase.from('emails_enviados').select('id, clave, tipo, asunto, destinatario, estado, error, creado_en, enviado_en')
      .eq('envio_id', envio).in('tipo', ['deca', 'firma_cmr', 'cmr_completo', 'aviso_parada', 'orden_carga'])
      .order('creado_en', { ascending: false }).limit(300),
    s.supabase.from('envio_compartidos').select('id, via, creado_en, creado_por')
      .eq('envio_id', envio).eq('documento', documento).order('creado_en', { ascending: false }).limit(100),
  ]);
  const ids = [...new Set((co.data ?? []).map((x) => x.creado_por).filter(Boolean))] as string[];
  const nombres = new Map<string, string>();
  if (ids.length) {
    const { data: us } = await s.supabase.from('usuarios').select('id, nombre, email').in('id', ids);
    (us ?? []).forEach((u) => nombres.set(u.id, u.nombre || u.email));
  }
  const filas: EnvioHist[] = [
    ...(em.data ?? []).filter((x) => esEmailDe(documento, x)).map((x) => ({
      id: `e-${x.id}`, cuando: x.enviado_en ?? x.creado_en,
      modo: /^(deca_manual|orden_manual):/.test(x.clave) ? 'manual' as const : 'auto' as const,
      via: 'email', para: x.destinatario && x.destinatario !== '—' ? x.destinatario : null,
      // En el CMR hay varios emails distintos (aviso de firma, copia, completo, aviso al sitio): se dice cuál.
      que: documento === 'cmr' ? x.asunto : null,
      estado: (x.estado === 'enviado' ? 'enviado' : x.estado === 'pendiente' ? 'pendiente' : 'error') as EnvioHist['estado'],
      detalle: x.estado === 'error' ? x.error : null, autor: null })),
    ...(co.data ?? []).map((x) => ({
      id: `c-${x.id}`, cuando: x.creado_en, modo: 'manual' as const, via: x.via, para: null, que: null,
      estado: 'compartido' as const, detalle: null, autor: x.creado_por ? nombres.get(x.creado_por) ?? null : null })),
  ];
  return filas.sort((a, b) => (a.cuando < b.cuando ? 1 : -1));
}

// Apunta que un documento del envío se ha compartido a mano por una vía (WhatsApp, SMS…).
export async function anotarCompartido(envio: string, documento: string, via: string): Promise<void> {
  comprobarEntrada("app/panel/(app)/envios/acciones#anotarCompartido", [envio, documento, via]);
  const s = await soloDynamo();
  if (!s || !/^[0-9a-f-]{36}$/i.test(envio) || !DOCS_HIST.includes(documento) || !['whatsapp', 'email', 'sms', 'copiar', 'otros'].includes(via)) return;
  await s.supabase.rpc('anotar_compartido_envio', { p_envio: envio, p_documento: documento, p_via: via });
}

export async function revocarOferta(oferta: string): Promise<Res> {
  comprobarEntrada("app/panel/(app)/envios/acciones#revocarOferta", [oferta]);
  const s = await soloDynamo();
  if (!s) return { ok: false, error: 'Solo Dynamo gestiona ofertas.' };
  const { error } = await s.supabase.rpc('revocar_oferta', { p_oferta: oferta });
  return error ? { ok: false, error: traducir(error.message) } : { ok: true };
}

export async function resolverContraoferta(reserva: string, aprobar: boolean): Promise<Res> {
  comprobarEntrada("app/panel/(app)/envios/acciones#resolverContraoferta", [reserva, aprobar]);
  const s = await soloDynamo();
  if (!s) return { ok: false, error: 'Solo Dynamo resuelve contraofertas.' };
  const { data, error } = await s.supabase.rpc('resolver_contraoferta', { p_reserva: reserva, p_acepta: aprobar });
  if (error) return { ok: false, error: traducir(error.message) };
  const r = (data as { resultado: string }).resultado;
  if (r === 'no_hay_contraoferta_pendiente') return { ok: false, error: 'Esa contraoferta ya no está pendiente.' };
  if (aprobar && r === 'aceptada') {
    // Email de ORDEN DE CARGA al transportista, igual que en una asignación a mano
    // (usuario, 2026-11-15): aprobar la contraoferta (o el alta online) asigna el envío.
    const envioId = (await s.supabase.from('envio_reservas').select('envio_id').eq('id', reserva).maybeSingle()).data?.envio_id;
    if (envioId) {
      const { avisoOrdenCarga } = await import('@/lib/servidor/avisosEnvio');
      await avisoOrdenCarga(s.supabase, s.user.id, envioId).catch(() => {});
      await copiaDeca(s.supabase, envioId);
    }
  }
  return { ok: true, aviso: aprobar ? 'Contraoferta aprobada: el transportista queda asignado a su precio.' : 'Contraoferta rechazada: el envío vuelve a estar ofertado.' };
}

// CMR digital: el enlace para que firmen cargador, transportista y destinatario. Uno vivo
// por envío; si ya hay uno, se devuelve ese (así se puede volver a mandar sin invalidarlo).
export async function enlaceCmr(envio: string): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
  comprobarEntrada("app/panel/(app)/envios/acciones#enlaceCmr", [envio]);
  const s = await soloDynamo();
  if (!s) return { ok: false, error: 'Solo Dynamo genera el CMR digital.' };
  const { data: est } = await s.supabase.from('envios').select('estado').eq('id', envio).maybeSingle();
  if (!est) return { ok: false, error: 'Ese envío no existe.' };
  if (est.estado === 'cancelado' || est.estado === 'borrador') return { ok: false, error: est.estado === 'cancelado' ? 'El envío está cancelado: no lleva CMR.' : 'Una solicitud sin confirmar no lleva CMR.' };
  const vivo = await s.supabase.from('cmr_enlaces').select('token').eq('envio_id', envio).eq('revocado', false).gt('caduca_en', new Date().toISOString()).maybeSingle();
  if (vivo.data) return { ok: true, token: vivo.data.token as string };
  // Uno caducado sin retirar ocuparía el hueco del enlace vivo: se retira antes.
  await s.supabase.from('cmr_enlaces').update({ revocado: true }).eq('envio_id', envio).eq('revocado', false);
  const { data, error } = await s.supabase.from('cmr_enlaces').insert({ envio_id: envio }).select('token').single();
  return error || !data ? { ok: false, error: traducir(error?.message ?? 'No se ha podido crear el enlace.') } : { ok: true, token: data.token as string };
}

// FIRMA EN PAPEL que completa el CMR digital («CMR bis», usuario 2026-11-16). Quien no
// quiere o no puede firmar en el móvil firma un CMR en papel con la MISMA referencia;
// Dynamo sube la foto de ese papel a los documentos del envío y lo registra aquí. La
// casilla queda cubierta («firmado en papel, anexo») y, si era la última, sale el email
// del CMR firmado por todas las partes. Solo Dynamo; la base de datos lo vuelve a exigir.
// «Firmó en papel» con casillas (usuario, 2026-11-19): las partes marcadas, de una vez, con
// la misma foto. Quién firmó no se teclea: consta en el papel anexo.
export async function firmasEnPapel(envio: string, paradas: string[], transportista: boolean, documento_id: string): Promise<Res> {
  comprobarEntrada("app/panel/(app)/envios/acciones#firmasEnPapel", [envio, paradas, transportista, documento_id]);
  const s = await soloDynamo();
  if (!s) return { ok: false, error: 'Solo Dynamo registra una firma en papel.' };
  const { data, error } = await s.supabase.rpc('registrar_firmas_papel', {
    p_envio: envio, p_paradas: paradas, p_transportista: transportista, p_documento_id: documento_id });
  if (error) return { ok: false, error: traducir(error.message) };
  const j = data as { resultado?: string; firmas?: number } | null;
  if (j?.resultado !== 'ok') return { ok: false, error: ({
    nada_elegido: 'Marca al menos una casilla.',
    ya_firmada: 'Esas casillas ya están firmadas.',
    falta_documento: 'Falta la foto del CMR en papel: súbela antes de registrar la firma.',
    parada_no_valida: 'Alguna de las paradas no es de este envío.',
    sin_matriculas: 'El envío aún no tiene la matrícula del camión: ponla antes de registrar firmas.',
    gestion_directa: 'En un envío de gestión directa las firmas las lleva el cliente.',
    no_existe: 'Ese envío no existe.',
  } as Record<string, string>)[j?.resultado ?? ''] ?? 'No se ha podido registrar la firma en papel.' };
  // Los mismos avisos que una firma digital (a Dynamo, y el CMR completo si era la última).
  const { data: enl } = await s.supabase.from('cmr_enlaces').select('token').eq('envio_id', envio).eq('revocado', false)
    .gt('caduca_en', new Date().toISOString()).maybeSingle();
  if (enl?.token) {
    const { avisosFirmaCmr } = await import('@/lib/servidor/avisosEnvio');
    await avisosFirmaCmr(enl.token as string).catch(() => {});
  }
  const n = Number(j.firmas ?? 0);
  return { ok: true, aviso: `${n === 1 ? 'Firma en papel registrada' : `${n} firmas en papel registradas`}: el CMR bis queda anexo y completa el CMR digital.` };
}

// Valoración del transportista (1-5) al entregar. Solo Dynamo; la media la rehace la base de datos.
export async function valorarTransportista(envio: string, nota: number | null, comentario: string): Promise<Res> {
  comprobarEntrada("app/panel/(app)/envios/acciones#valorarTransportista", [envio, nota, comentario]);
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
  comprobarEntrada("app/panel/(app)/envios/acciones#archivarPdf", [envioId, documento]);
  const s = await sesion();
  if (!s?.perfil || s.perfil.estado !== 'activa' || !esGestor(s.perfil.rol)) return { ok: false, error: 'Solo el equipo de Dynamo guarda copias.' };
  const r = await pdfDeEnvioDynamo(s.supabase, envioId, documento, s.perfil.id);
  if ('error' in r) return { ok: false, error: r.error };
  // Sello del nombre en HORA DE MADRID: con el ISO (UTC), a partir de las 23:00/00:00 el
  // nombre llevaba el día y la hora ANTERIORES («…-20261108-2305» siendo las 00:05 del 9).
  const partes = new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
  const parte = (t: Intl.DateTimeFormatPartTypes) => partes.find((x) => x.type === t)?.value ?? '';
  const fecha = `${parte('year')}${parte('month')}${parte('day')}-${parte('hour')}${parte('minute')}`;
  const nombre = r.nombre.replace(/\.pdf$/, `-${fecha}.pdf`);
  const ruta = `envios/${envioId}/${randomUUID()}/${nombre}`;
  const { error: eSubida } = await s.supabase.storage.from('documentos').upload(ruta, r.bytes, { contentType: 'application/pdf', upsert: false });
  if (eSubida) return { ok: false, error: `No se ha podido guardar el archivo: ${eSubida.message}` };
  const sha = createHash('sha256').update(r.bytes).digest('hex');
  const { error } = await s.supabase.from('documentos').insert({
    envio_id: envioId, tipo: documento === 'cmr' ? 'cmr' : 'orden_carga', storage_bucket: 'documentos', storage_ruta: ruta,
    nombre_archivo: nombre, tipo_mime: 'application/pdf', tamano_bytes: r.bytes.length, sha256: sha, visible_cliente: false,
  });
  if (error) return { ok: false, error: mensajeError(error.message) };
  return { ok: true, aviso: `Copia guardada en los documentos del envío: ${nombre}.` };
}

// Asignar transportista: la flota activa del elegido (matrículas y conductores para sugerir).
// Buscador de transportistas de «Asignar» y «Ofrecer»: los 12 que mejor casan con lo
// escrito (nombre, CIF, código de bolsa, teléfono, matrícula…), más el ya asignado
// (`incluir`) para que salga aunque no case. Antes viajaban a la ficha TODOS los
// transportistas (2 MB con 20.000).
export async function buscarTransportistas(q: string, incluir: string | null = null): Promise<TransportistaOpcion[]> {
  comprobarEntrada("app/panel/(app)/envios/acciones#buscarTransportistas", [q, incluir]);
  const s = await soloDynamo();
  if (!s) return [];
  const { data } = await s.supabase.rpc('buscar_transportistas', { p_q: (q ?? '').slice(0, 200), p_limite: 12, p_incluir: incluir && /^[0-9a-f-]{36}$/i.test(incluir) ? incluir : null });
  return (data ?? []).map((x) => ({ id: x.id, nombre: x.nombre, cif: x.cif, estado: x.estado, nima: x.nima, telefono: x.telefono, email: x.email }));
}

export async function flotaTransportista(transportista: string): Promise<FlotaTransportista> {
  comprobarEntrada("app/panel/(app)/envios/acciones#flotaTransportista", [transportista]);
  const s = await soloDynamo();
  if (!s || !/^[0-9a-f-]{36}$/i.test(transportista)) return { vehiculos: [], conductores: [] };
  return flotaDe(s.supabase, transportista);
}

// Asignar transportista: sus COMPOSICIONES recientes (usuario, 2026-11-15) — con qué
// remolque y conductor salió cada camión la última vez, la más reciente primero, para
// sugerir por PARES y autorrellenar el bloque entero al elegir una.
export type UsoFlota = { camion: string | null; remolque: string | null; conductor: string | null; telefono: string | null; cuando: string | null };
// Las últimas COMPOSICIONES con las que ha viajado un transportista (tractora, remolque,
// conductor y su teléfono), de la más reciente a la más antigua y sin repetir. Valen las que
// traen CUALQUIERA de los cuatro datos (usuario, 2026-11-18): al asignar se puede buscar por
// cualquiera de ellos y se rellenan los demás con lo de ese último envío.
export async function usosFlota(transportista: string): Promise<UsoFlota[]> {
  comprobarEntrada("app/panel/(app)/envios/acciones#usosFlota", [transportista]);
  const s = await soloDynamo();
  if (!s || !/^[0-9a-f-]{36}$/i.test(transportista)) return [];
  const { data } = await s.supabase.from('envios')
    .select('matricula_camion, matricula_remolque, conductor_nombre, conductor_telefono, fecha_carga_prevista, creado_en')
    .eq('transportista_id', transportista)
    .or('matricula_camion.not.is.null,matricula_remolque.not.is.null,conductor_nombre.not.is.null,conductor_telefono.not.is.null')
    .order('creado_en', { ascending: false }).limit(120);
  const limpio = (x: string | null) => { const v = (x ?? '').trim(); return v || null; };
  const vistos = new Set<string>();
  const res: UsoFlota[] = [];
  for (const x of data ?? []) {
    const u = { camion: limpio(x.matricula_camion), remolque: limpio(x.matricula_remolque), conductor: limpio(x.conductor_nombre), telefono: limpio(x.conductor_telefono) };
    if (!u.camion && !u.remolque && !u.conductor && !u.telefono) continue;
    const k = [u.camion, u.remolque, u.conductor, u.telefono].map((v) => (v ?? '').replace(/\s+/g, '').toUpperCase()).join('|');
    if (vistos.has(k)) continue;
    vistos.add(k);
    res.push({ ...u, cuando: x.fecha_carga_prevista ?? (x.creado_en ? String(x.creado_en).slice(0, 10) : null) });
    if (res.length >= 40) break;
  }
  return res;
}

// Asignar transportista: los datos conocidos de su flota (chófer de ese camión de otras
// veces, o el teléfono de ese chófer). Vacío si no hay: nunca los del chófer anterior.
export async function sugerirFlota(transportista: string, d: { matricula?: string; conductor?: string }): Promise<{ conductor: string | null; telefono: string | null } | null> {
  comprobarEntrada("app/panel/(app)/envios/acciones#sugerirFlota", [transportista, d]);
  const s = await soloDynamo();
  if (!s || !transportista) return null;
  const { data, error } = await s.supabase.rpc('flota_sugerencia', { p_transportista: transportista, p_matricula: d.matricula ?? null, p_conductor_nombre: d.conductor ?? null });
  if (error) return null;
  const f = data as { conductor?: string | null; telefono?: string | null } | null;
  return { conductor: f?.conductor ?? null, telefono: f?.telefono ?? null };
}

// Revisión del precio de un envío con precio provisional (hoy a mano; con el tarifador, sola).
export async function revisarPrecioEnvio(envio: string, precio: number): Promise<Res> {
  comprobarEntrada("app/panel/(app)/envios/acciones#revisarPrecioEnvio", [envio, precio]);
  const s = await soloDynamo();
  if (!s) return { ok: false, error: 'Solo Dynamo revisa el precio.' };
  const { data, error } = await s.supabase.rpc('revisar_precio_envio', { p_envio: envio, p_nuevo: precio });
  if (error) return { ok: false, error: traducir(error.message) };
  const r = (data as { resultado: string }).resultado;
  const TXT: Record<string, string> = {
    mantenido: 'Variación pequeña: se queda el precio que tenía. Precio definitivo, ya se puede ofertar.',
    bajado: 'Precio bajado y aplicado. Se le ha avisado al cliente. Ya se puede ofertar.',
    subida: 'Subida enviada al cliente: la acepta o cancela sin coste. Se oferta cuando conteste.',
  };
  if (!TXT[r]) return { ok: false, error: { no_existe: 'Ese envío no existe.', no_provisional: 'Este envío ya no tiene el precio provisional.', precio_no_valido: 'Pon un precio válido.' }[r] ?? r };
  return { ok: true, aviso: TXT[r] };
}

// Plazo para pagar: Dynamo lo vuelve a contar desde ahora (p. ej. el cliente dice que ya
// ha hecho la transferencia y aún no ha llegado).
export async function ampliarPlazoPago(envio: string): Promise<Res> {
  comprobarEntrada("app/panel/(app)/envios/acciones#ampliarPlazoPago", [envio]);
  const s = await soloDynamo();
  if (!s) return { ok: false, error: 'Solo Dynamo amplía el plazo para pagar.' };
  const { data, error } = await s.supabase.rpc('ampliar_plazo_pago', { p_envio: envio });
  if (error) return { ok: false, error: traducir(error.message) };
  if ((data as { resultado: string }).resultado !== 'ok') return { ok: false, error: 'Ese envío ya no está pendiente de pago.' };
  return { ok: true, aviso: 'Plazo ampliado: el cliente tiene de nuevo el plazo completo para pagar desde ahora.' };
}

// Previo pago: Dynamo marca la transferencia, pasa el envío sin pago previo (cobro a
// vencimiento, con motivo), lo exige a un envío concreto o deshace lo marcado.
// La TRANSFERENCIA no entra por aquí: va por registrarTransferenciaEnvio, que pide banco,
// concepto y fecha (usuario, 2026-11-17: que no se marque una proforma de un solo toque).
export async function marcarPagoEnvio(envio: string, accion: 'exento' | 'requerir' | 'deshacer' | 'tarjeta', motivo?: string): Promise<Res> {
  comprobarEntrada("app/panel/(app)/envios/acciones#marcarPagoEnvio", [envio, accion, motivo]);
  const s = await soloDynamo();
  if (!s) return { ok: false, error: 'Solo Dynamo marca el pago de un envío.' };
  const { data, error } = await s.supabase.rpc('marcar_pago_envio', { p_envio: envio, p_accion: accion, p_motivo: motivo ?? null });
  if (error) return { ok: false, error: traducir(error.message) };
  const r = (data as { resultado: string }).resultado;
  const ERR: Record<string, string> = {
    no_existe: 'Ese envío no existe.', envio_manual: 'Es un envío con transportista propio del cliente: no lleva pago previo.',
    no_pendiente: 'Ese envío ya no está pendiente de pago.', falta_motivo: 'Escribe el motivo (p. ej. «CESCE positivo, cobro a 60 días»).',
    ya_tiene_pago: 'Ese envío ya lleva pago previo.', ya_ofertado: 'Ya está ofertado o asignado: primero quita el transportista o retira las ofertas.',
    nada_que_deshacer: 'No hay nada que deshacer.', pagado_con_tarjeta: 'Está pagado con tarjeta: si hay que devolverlo, se hace desde Stripe.',
    envio_no_activo: 'El envío ya no está activo (cancelado o terminado). Si hay que reactivarlo, deshaz antes la cancelación.',
    sin_cobro: 'No hay ningún cobro con tarjeta pendiente de aplicar en este envío.',
  };
  if (r !== 'ok') return { ok: false, error: ERR[r] ?? r };
  return { ok: true, aviso: {
    exento: 'Envío pasado sin pago previo (cobro a vencimiento): ya se puede ofertar y asignar.',
    requerir: 'El envío queda pendiente de pago: no se ofertará hasta que se pague.',
    deshacer: 'Deshecho: el envío vuelve a estar pendiente de pago.',
    tarjeta: 'Cobro con tarjeta aplicado: el envío queda pagado. Si el importe no cuadra, regulariza la diferencia en la factura o en Stripe.',
  }[accion] };
}

// Transferencia recibida: Dynamo da por pagada la proforma anotando el banco en el que ha
// entrado, el concepto y el día de la transferencia. Lo valida y lo guarda la base de datos.
export async function registrarTransferenciaEnvio(envio: string, d: { banco: string; concepto: string; fecha: string }): Promise<Res> {
  comprobarEntrada("app/panel/(app)/envios/acciones#registrarTransferenciaEnvio", [envio, d]);
  const s = await soloDynamo();
  if (!s) return { ok: false, error: 'Solo Dynamo marca el pago de un envío.' };
  const { data, error } = await s.supabase.rpc('registrar_transferencia_envio', { p_envio: envio, p_banco: d.banco, p_concepto: d.concepto, p_fecha: d.fecha });
  if (error) return { ok: false, error: traducir(error.message) };
  const r = (data as { resultado: string }).resultado;
  const ERR: Record<string, string> = {
    falta_banco: 'Elige el banco en el que ha entrado la transferencia.', concepto_largo: 'El concepto es demasiado largo (200 caracteres como mucho).',
    fecha_no_valida: 'La fecha de la transferencia tiene que ser de los últimos 90 días y no posterior a hoy.',
    no_existe: 'Ese envío no existe.', envio_manual: 'Es un envío con transportista propio del cliente: no lleva pago previo.',
    no_pendiente: 'Ese envío ya no está pendiente de pago.',
    envio_no_activo: 'El envío ya no está activo (cancelado o terminado). Si hay que reactivarlo, deshaz antes la cancelación.',
  };
  if (r !== 'ok') return { ok: false, error: ERR[r] ?? r };
  return { ok: true, aviso: 'Pago por transferencia registrado: el envío pasa a pendiente de asignar.' };
}

// «Pago no recibido» (usuario, 2026-11-19): a Dynamo no le consta la transferencia de un
// envío pendiente de pago. El envío queda anulado sin pago y el cliente recibe el aviso.
export async function rechazarPagoEnvio(envio: string, motivo: string): Promise<Res> {
  comprobarEntrada("app/panel/(app)/envios/acciones#rechazarPagoEnvio", [envio, motivo]);
  const s = await soloDynamo();
  if (!s) return { ok: false, error: 'Solo Dynamo rechaza el pago de un envío.' };
  const { data, error } = await s.supabase.rpc('rechazar_pago_transferencia', { p_envio: envio, p_motivo: motivo.trim().slice(0, 200) || undefined });
  if (error) return { ok: false, error: traducir(error.message) };
  const r = (data as { resultado?: string } | null)?.resultado;
  if (r !== 'ok') return { ok: false, error: ({
    no_pendiente: 'Ese envío ya no está pendiente de pago.',
    con_pago_a_cuenta: 'Este envío ya tiene dinero cobrado a cuenta: no se anula de un toque. Cancélalo como cualquier envío.',
    con_transportista: 'Este envío ya tiene transportista: quítalo o cancela el envío.',
    no_existe: 'Ese envío no existe.',
  } as Record<string, string>)[r ?? ''] ?? 'No se ha podido rechazar el pago.' };
  return { ok: true, aviso: 'Pago rechazado: el envío queda anulado sin pago y el cliente ya está avisado.' };
}

// Cambio pedido por el CLIENTE: Dynamo lo acepta (se aplican las fechas pedidas; la ruta y
// el precio se cambian en la ficha) o lo rechaza, con una nota para el cliente.
export async function resolverCambio(envio: string, aceptar: boolean, nota: string): Promise<Res> {
  comprobarEntrada("app/panel/(app)/envios/acciones#resolverCambio", [envio, aceptar, nota]);
  const s = await soloDynamo();
  if (!s) return { ok: false, error: 'Solo Dynamo resuelve los cambios.' };
  const { data, error } = await s.supabase.rpc('resolver_cambio_envio', { p_envio: envio, p_acepta: aceptar, p_nota: nota.trim() || null });
  if (error) return { ok: false, error: traducir(error.message) };
  if ((data as { resultado: string }).resultado !== 'ok') return { ok: false, error: 'Ese cambio ya no está pendiente.' };
  return { ok: true, aviso: aceptar ? 'Cambio aceptado. Si pedía cambiar la ruta o afecta al precio, hazlo con «Cambiar ruta» o «Modificar».' : 'Cambio rechazado: el cliente lo ve con tu nota.' };
}

// «¿Anular el cambio realizado?» del contador de 30 s (usuario, 2026-11-20): el envío vuelve a
// como estaba y los emails de ese cambio no salen. Lo puede hacer Dynamo o quien hizo el cambio
// (la base de datos lo comprueba).
export async function anularCambioEnvio(envio: string): Promise<Res> {
  comprobarEntrada("app/panel/(app)/envios/acciones#anularCambioEnvio", [envio]);
  const s = await sesion();
  if (!s?.perfil || s.perfil.estado !== 'activa') return { ok: false, error: 'Tu sesión ha caducado. Vuelve a entrar.' };
  const { data, error } = await s.supabase.rpc('anular_cambio_envio', { p_envio: envio });
  if (error) return { ok: false, error: traducir(error.message) };
  const r = (data ?? {}) as { resultado?: string; tipo?: string };
  switch (r.resultado) {
    case 'anulado':
      return { ok: true, aviso: r.tipo === 'creado' ? 'Envío anulado sin coste: no se ha avisado a nadie.' : 'Cambio anulado: el envío vuelve a como estaba y no se ha avisado a nadie.' };
    case 'email_anulado': return { ok: true, aviso: 'Email anulado: no ha salido.' };
    case 'ya_salio': return { ok: false, error: 'Ya es tarde: el aviso acaba de salir. Si hace falta, modifica el envío de nuevo.' };
    case 'nada': return { ok: false, error: 'No queda nada por anular en este envío.' };
    default: return { ok: false, error: 'No se ha podido anular el cambio. Modifica el envío a mano si hace falta.' };
  }
}
