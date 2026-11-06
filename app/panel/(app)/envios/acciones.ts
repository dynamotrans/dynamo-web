'use server';

import { mensajeError } from '@/lib/mensajeError';
import { sesion, esGestor } from '@/lib/sesion';
import { randomUUID, createHash } from 'node:crypto';
import { pdfDeEnvioDynamo } from '@/lib/pdf/generar';
import { vistaCruda } from '@/lib/vista';
import { euros } from '@/lib/formato';
import { flotaDe, type FlotaTransportista, type TransportistaOpcion } from '@/lib/fichaEnvio';
import type { TablaUpdate } from '@/lib/supabase/tipos';
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
};

export async function asignarTransportista(envio: string, a: Asignacion): Promise<Res> {
  comprobarEntrada("app/panel/(app)/envios/acciones#asignarTransportista", [envio, a]);
  const s = await soloDynamo();
  if (!s) return { ok: false, error: 'Solo Dynamo asigna transportistas.' };
  if (!a.transportista_id) return { ok: false, error: 'Elige el transportista.' };
  if (a.importe_transportista != null && !Number.isFinite(a.importe_transportista)) return { ok: false, error: 'El precio del transportista no es un número válido.' };
  // Las reglas (suspendido, NIMA, matrícula en mayúsculas, teléfono) las pone la base de datos.
  const { data, error } = await s.supabase.rpc('asignar_transportista', {
    p_envio: envio, p_transportista: a.transportista_id, p_importe_transportista: a.importe_transportista,
    p_matricula_camion: a.matricula_camion, p_matricula_remolque: a.matricula_remolque,
    p_conductor_nombre: a.conductor_nombre, p_conductor_telefono: a.conductor_telefono,
    p_fecha_carga_prevista: a.fecha_carga_prevista || null,
  });
  if (error) return { ok: false, error: traducir(error.message) };
  const r = (data as { ok: boolean; resultado: string });
  if (r.ok) return { ok: true };
  return { ok: false, error: ({ transportista_suspendido: 'Ese transportista está suspendido: no se le pueden dar envíos.', transportista_no_existe: 'Ese transportista no existe.',
    importe_no_valido: 'El precio del transportista no es un número válido.', no_existe: 'Ese envío no existe.',
    falta_fecha_prevista: 'Elige el día en que carga: el envío tiene varios días de recogida.', fecha_fuera_de_ventana: 'El día de carga tiene que estar dentro de los días de recogida.' } as Record<string, string>)[r.resultado] ?? 'No se ha podido asignar.' };
}

export async function quitarTransportista(envio: string): Promise<Res> {
  comprobarEntrada("app/panel/(app)/envios/acciones#quitarTransportista", [envio]);
  const s = await soloDynamo();
  if (!s) return { ok: false, error: 'Solo Dynamo asigna transportistas.' };
  // La base de datos limpia también camión, conductor, NIMA y precio del transportista.
  const { error } = await s.supabase.rpc('quitar_transportista', { p_envio: envio });
  return error ? { ok: false, error: traducir(error.message) } : { ok: true };
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

export async function modificarEnvio(envio: string, d: DatosEnvio, precioAntes: number | null): Promise<Res> {
  comprobarEntrada("app/panel/(app)/envios/acciones#modificarEnvio", [envio, d, precioAntes]);
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
  return { ok: true };
}

export type NuevaOferta = { transportista_id: string | null; canal: string; precio: number; banda_pct: number; pronto_pago: boolean };

// Ofrecer la carga: crea la oferta (con su enlace) y devuelve el token del enlace.
export async function ofrecerCarga(envio: string, o: NuevaOferta): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
  comprobarEntrada("app/panel/(app)/envios/acciones#ofrecerCarga", [envio, o]);
  const s = await soloDynamo();
  if (!s) return { ok: false, error: 'Solo Dynamo ofrece envíos.' };
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

// Retirar el enlace: deja de abrirse. Las firmas ya hechas se quedan (no se borran nunca).
export async function retirarEnlaceCmr(enlace: string): Promise<Res> {
  comprobarEntrada("app/panel/(app)/envios/acciones#retirarEnlaceCmr", [enlace]);
  const s = await soloDynamo();
  if (!s) return { ok: false, error: 'Solo Dynamo gestiona el CMR digital.' };
  const { error } = await s.supabase.from('cmr_enlaces').update({ revocado: true }).eq('id', enlace);
  return error ? { ok: false, error: traducir(error.message) } : { ok: true };
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
  const fecha = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '').replace(/^(\d{8})(\d{4})$/, '$1-$2');
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
export async function marcarPagoEnvio(envio: string, accion: 'transferencia' | 'exento' | 'requerir' | 'deshacer' | 'tarjeta', motivo?: string): Promise<Res> {
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
    transferencia: 'Pago por transferencia registrado: el envío pasa a pendiente de asignar.',
    exento: 'Envío pasado sin pago previo (cobro a vencimiento): ya se puede ofertar y asignar.',
    requerir: 'El envío queda pendiente de pago: no se ofertará hasta que se pague.',
    deshacer: 'Deshecho: el envío vuelve a estar pendiente de pago.',
    tarjeta: 'Cobro con tarjeta aplicado: el envío queda pagado. Si el importe no cuadra, regulariza la diferencia en la factura o en Stripe.',
  }[accion] };
}

// Contraoferta del CLIENTE: Dynamo la aprueba (el envío queda confirmado a ese precio) o
// la rechaza (vuelve a nuestro precio, con la validez renovada).
export async function resolverContraofertaCliente(envio: string, aprobar: boolean): Promise<Res> {
  comprobarEntrada("app/panel/(app)/envios/acciones#resolverContraofertaCliente", [envio, aprobar]);
  const s = await soloDynamo();
  if (!s) return { ok: false, error: 'Solo Dynamo resuelve las contraofertas.' };
  const { data, error } = await s.supabase.rpc('resolver_contraoferta_cliente', { p_envio: envio, p_acepta: aprobar });
  if (error) return { ok: false, error: traducir(error.message) };
  const r = (data as { resultado: string }).resultado;
  if (r === 'no_pendiente') return { ok: false, error: 'Esa contraoferta ya no está pendiente.' };
  if (r === 'fecha_pasada') return { ok: false, error: 'La fecha de recogida ya ha pasado: no se puede confirmar.' };
  return { ok: true, aviso: aprobar ? 'Contraoferta aprobada: el envío queda programado a su precio.' : 'Contraoferta rechazada: el cliente vuelve a ver nuestro precio para aceptarlo o cancelar.' };
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
