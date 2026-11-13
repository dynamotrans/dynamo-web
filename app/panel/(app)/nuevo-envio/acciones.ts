'use server';

import { normalizaTel } from '@/lib/paises';

import { mensajeError } from '@/lib/mensajeError';
import { sesion, esGestor } from '@/lib/sesion';
import { vistaCruda } from '@/lib/vista';
import { modificarEnvio, type DatosEnvio } from '@/app/panel/(app)/envios/acciones';
import { comprobarEntrada } from '@/lib/entradas/comprobar';
import type { SB } from '@/lib/supabase/cliente';
import type { Tabla, TablaUpdate } from '@/lib/supabase/tipos';
import type { SitioOpcion, SitioEditable, EdicionSitio } from '@/components/panel/nuevoEnvio/comun';
import { HORARIO_VERANO_POR_DEFECTO, MMDD, VERANO_GENERICO, gruposDe, type FilaHorario } from '@/lib/horarios';

export type ParadaNueva = {
  tipo: 'carga' | 'descarga';
  sitio_id?: string | null;
  nombre_empresa?: string; direccion?: string; codigo_postal?: string; poblacion?: string;
  provincia?: string; pais_codigo_iso?: string; tipo_sitio?: string; horarios?: string;
  guardar_en_agenda?: boolean;
  contacto_nombre?: string; contacto_telefono?: string; contacto_email?: string;   // del sitio nuevo que se guarda en la agenda
  horario_tramos?: { dia: number; abre: string; cierra: string }[];   // su horario, si no es el de por defecto
  referencia?: string; anotaciones?: string;
};

// Persona y teléfono del sitio nuevo guardado en la agenda: como contacto PRINCIPAL del
// sitio (el que sale en la orden de carga y en el CMR). Se busca el sitio que acaba de
// crear la base de datos por la posición de la parada en la ruta.
// Y su horario, si se cambió (si no, la base de datos le pone el de por defecto). Va
// después de crear el envío, que es cuando existe el sitio.
async function contactosDeSitiosNuevos(sb: SB, envioId: string, paradas: ParadaNueva[], esCliente = false) {
  const nuevos = paradas.map((p, i) => ({ p, i })).filter(({ p }) => p.guardar_en_agenda && !p.sitio_id);
  const conContacto = nuevos.filter(({ p }) => (p.contacto_telefono || '').replace(/[^\d]/g, '').length >= 6 || (p.contacto_email || '').trim());
  const conHorario = nuevos.filter(({ p }) => p.horario_tramos?.length);
  if (!conContacto.length && !conHorario.length) return;
  // Dynamo lee las paradas; el cliente no puede (solo con mis_envios(), que las trae).
  let filas: { orden: number; sitio_id: string | null }[] = [];
  if (esCliente) {
    const { data } = await sb.rpc('mis_envios').eq('id', envioId).maybeSingle();
    filas = ((data?.paradas ?? []) as { orden: number; sitio_id: string | null }[]).sort((a, b) => a.orden - b.orden);
  } else {
    const { data } = await sb.from('envio_paradas').select('orden, sitio_id').eq('envio_id', envioId).order('orden');
    filas = (data ?? []) as { orden: number; sitio_id: string | null }[];
  }
  for (const { p, i } of conContacto) {
    const sitio = filas[i]?.sitio_id;
    if (!sitio) continue;
    const tel = normalizaTel(p.contacto_telefono);
    await sb.from('contactos').insert({ sitio_id: sitio, nombre: (p.contacto_nombre ?? '').trim() || null, telefono: tel || null, email: (p.contacto_email ?? '').trim().toLowerCase() || null, es_principal: true });
  }
  for (const { p, i } of conHorario) {
    const sitio = filas[i]?.sitio_id;
    if (sitio) await sb.rpc('guardar_horario', { p_sitio: sitio, p_tramos: p.horario_tramos! });
  }
}
export type EnvioNuevo = {
  cliente_id: string; referencia_cliente?: string;
  fecha_carga_desde: string; fecha_carga_hasta: string;
  descripcion_mercancia?: string; toneladas: number; metros_lineales: number;
  paletizado: boolean; carga_lateral: boolean; carga_trasera: boolean; carga_techo: boolean;
  requiere_plataforma_elevadora: boolean; requiere_nima: boolean; adr: boolean;
  importe_cliente: number; importe_transportista?: number | null;
  discrecion_comercial: boolean; anotaciones_cliente?: string;
  negociacion_pct?: number | null;   // banda de negociación por defecto al ofertar (0/5/10/30)
};

// Mensajes de la base de datos → frase entendible. Lo que no se reconoce se enseña tal
// cual (son nuestros propios mensajes, ya en castellano).
function traducir(msg: string): string {
  if (/duplicate key|ux_clientes_cif|unique/i.test(msg)) return 'Ya existe un cliente con ese CIF/NIF.';
  if (/permission denied|42501|row-level security/i.test(msg)) return 'No tienes permiso para hacer esto.';
  return mensajeError(msg);   // los de las reglas de la base de datos ya vienen en castellano
}

export async function crearEnvio(envio: EnvioNuevo, paradas: ParadaNueva[]):
  Promise<{ ok: true; referencia_gx: string } | { ok: false; error: string }> {
  comprobarEntrada("app/panel/(app)/nuevo-envio/acciones#crearEnvio", [envio, paradas]);
  const s = await sesion();
  if (!s?.perfil || s.perfil.estado !== 'activa' || !esGestor(s.perfil.rol)) {
    return { ok: false, error: 'Solo el equipo de Dynamo puede crear envíos por ahora.' };
  }
  // Comprobaciones básicas aquí también (la base de datos vuelve a comprobarlo todo).
  if (!envio.cliente_id) return { ok: false, error: 'Elige el cliente.' };
  if (!(envio.importe_cliente > 0)) return { ok: false, error: 'Pon el precio del cliente (base sin IVA).' };
  if (paradas.length < 2) return { ok: false, error: 'Falta la recogida o la entrega.' };

  const { negociacion_pct, ...resto } = envio;
  if (negociacion_pct != null && ![0, 5, 10, 30].includes(negociacion_pct)) return { ok: false, error: 'La negociación del precio no es válida.' };
  const { data, error } = await s.supabase.rpc('crear_envio', { p_datos: resto, p_paradas: paradas });
  if (error) return { ok: false, error: traducir(error.message) };
  const fila = (Array.isArray(data) ? data[0] : data) as { id: string; referencia_gx: string } | undefined;
  if (fila?.id && negociacion_pct != null) {
    await s.supabase.from('envios').update({ negociacion_pct }).eq('id', fila.id);
  }
  if (fila?.id) await contactosDeSitiosNuevos(s.supabase, fila.id, paradas);
  return { ok: true, referencia_gx: fila?.referencia_gx ?? '' };
}

// Alta rápida de cliente desde el envío (la ficha completa llegará con la pantalla de
// Clientes). La base de datos impide CIF repetidos (regla 10).
export async function crearClienteRapido(razon_social: string, cif: string, pais_codigo_iso: string):
  Promise<{ ok: true; cliente: { id: string; nombre: string; cif: string; iva: number | null } } | { ok: false; error: string }> {
  comprobarEntrada("app/panel/(app)/nuevo-envio/acciones#crearClienteRapido", [razon_social, cif, pais_codigo_iso]);
  const s = await sesion();
  if (!s?.perfil || s.perfil.estado !== 'activa' || !esGestor(s.perfil.rol)) {
    return { ok: false, error: 'Solo el equipo de Dynamo puede dar de alta clientes.' };
  }
  const rs = razon_social.trim(), c = cif.trim().toUpperCase();
  if (!rs || !c) return { ok: false, error: 'Escribe la razón social y el CIF/NIF.' };
  const { data, error } = await s.supabase.from('clientes')
    .insert({ razon_social: rs, cif: c, pais_codigo_iso: pais_codigo_iso || 'ES' })
    .select('id, nombre_visible, cif, iva_pct').single();
  if (error) return { ok: false, error: traducir(error.message) };
  return { ok: true, cliente: { id: data.id, nombre: data.nombre_visible ?? rs, cif: data.cif, iva: data.iva_pct } };
}

// Cambiar la ruta de un envío ya creado (antes de cargar). Las paradas con `id` se
// mantienen; las demás se crean; las que no vienen se quitan. Lo comprueba la base de datos.
export async function cambiarRuta(envio: string, paradas: (ParadaNueva & { id?: string })[]): Promise<{ ok: true } | { ok: false; error: string }> {
  comprobarEntrada("app/panel/(app)/nuevo-envio/acciones#cambiarRuta", [envio, paradas]);
  const s = await sesion();
  if (!s?.perfil || s.perfil.estado !== 'activa' || !esGestor(s.perfil.rol)) return { ok: false, error: 'Solo el equipo de Dynamo puede cambiar la ruta.' };
  if (paradas.length < 2) return { ok: false, error: 'Falta la recogida o la entrega.' };
  const { error } = await s.supabase.rpc('cambiar_ruta_envio', { p_envio: envio, p_paradas: paradas.map((p) => (p.id ? { id: p.id } : p)) });
  if (error) return { ok: false, error: traducir(error.message) };
  await contactosDeSitiosNuevos(s.supabase, envio, paradas);
  return { ok: true };
}

// MODIFICAR un envío entero desde el asistente (ficha → «Modificar», solo Dynamo): los
// campos, el precio y, SOLO si se tocó, la ruta (paradas null = la ruta no cambió y no
// se toca: las paradas conservan referencias y notas). Si no se cambia nada que afecte
// al precio, el precio se queda tal cual (viene prefijado y el tarifador no lo pisa).
export async function guardarEdicionEnvio(envio: string,
  d: Omit<DatosEnvio, 'paradas' | 'fecha_entrega_estimada' | 'precio_acordado_operador'>,
  paradas: (ParadaNueva & { id?: string })[] | null): Promise<{ ok: true } | { ok: false; error: string }> {
  comprobarEntrada("app/panel/(app)/nuevo-envio/acciones#guardarEdicionEnvio", [envio, d, paradas]);
  const s = await sesion();
  if (!s?.perfil || s.perfil.estado !== 'activa' || !esGestor(s.perfil.rol)) return { ok: false, error: 'Solo el equipo de Dynamo modifica envíos.' };
  const { data: cur } = await s.supabase.from('envios').select('es_manual, fecha_entrega_estimada, importe_cliente, transportista_id, importe_transportista, fecha_carga_desde, fecha_carga_hasta, metros_lineales, toneladas').eq('id', envio).maybeSingle();
  if (!cur) return { ok: false, error: 'Ese envío no existe.' };
  if (cur.es_manual) return { ok: false, error: 'Un envío con transportista propio del cliente se modifica desde su ficha.' };
  if (paradas) {
    const r = await cambiarRuta(envio, paradas);
    if (!r.ok) return r;
  }
  const r2 = await modificarEnvio(envio, { ...d, fecha_entrega_estimada: cur.fecha_entrega_estimada ?? '', precio_acordado_operador: null, paradas: [] },
    cur.importe_cliente != null ? Number(cur.importe_cliente) : null);
  if (!r2.ok) return r2;
  // El precio acaba de revisarse en esta misma pantalla: fuera el aviso de «precio por revisar».
  await s.supabase.from('envios').update({ requiere_revision_precio: false }).eq('id', envio);
  // CON TRANSPORTISTA ASIGNADO (usuario, 2026-11-10): el cambio se aplica YA y se le manda
  // la propuesta con el antes → ahora de SU precio y el detalle; él acepta o rechaza (o
  // Dynamo responde en su nombre). El rechazo desasigna el envío automáticamente.
  if (cur.transportista_id) {
    const fBon = (x: string | null | undefined) => (x ? x.split('-').reverse().join('/') : '');
    const eurT = (n: number | null) => (n == null ? '—' : `${n.toFixed(2).replace('.', ',')} €`);
    const ptA = cur.importe_transportista != null ? Number(cur.importe_transportista) : null;
    const ptN = d.importe_transportista ?? null;
    const partes: string[] = [];
    if (ptA !== ptN) partes.push(`Tu precio: ${eurT(ptA)} → ${eurT(ptN)}`);
    if ((cur.fecha_carga_desde ?? '') !== d.fecha_carga_desde || (cur.fecha_carga_hasta ?? '') !== d.fecha_carga_hasta) {
      partes.push(`Fecha de carga: ${fBon(d.fecha_carga_desde)}${d.fecha_carga_hasta && d.fecha_carga_hasta !== d.fecha_carga_desde ? ` al ${fBon(d.fecha_carga_hasta)}` : ''}`);
    }
    if (paradas) partes.push('La ruta ha cambiado (mírala en la ficha)');
    if (Number(cur.metros_lineales ?? 0) !== d.metros_lineales || Number(cur.toneladas ?? 0) !== d.toneladas) {
      partes.push(`Mercancía: ${String(d.metros_lineales).replace('.', ',')} m · ${String(d.toneladas).replace('.', ',')} Tn`);
    }
    if (partes.length) {
      const pr = await s.supabase.rpc('proponer_cambio_transportista', { p_envio: envio, p_precio_antes: ptA, p_precio_ahora: ptN, p_detalle: partes.join(' · ') });
      if (pr.error) return { ok: false, error: traducir(pr.error.message) };
    }
  }
  return { ok: true };
}

// El CLIENTE crea su envío YA CON EL PRECIO del tarifador automático (desde el 2026-11-08
// no hay solicitudes de precio). Nace programado; el previo pago decide crédito o pago.
// La base de datos fuerza que sea de SU empresa y con SUS sitios.
export async function crearEnvioCliente(envio: Omit<EnvioNuevo, 'cliente_id' | 'importe_transportista'>, paradas: ParadaNueva[]):
  Promise<{ ok: true; referencia_gx: string } | { ok: false; error: string }> {
  comprobarEntrada("app/panel/(app)/nuevo-envio/acciones#crearEnvioCliente", [envio, paradas]);
  const s = await sesion();
  if (!s?.perfil || s.perfil.estado !== 'activa' || s.perfil.rol !== 'cliente') return { ok: false, error: 'Tu cuenta no puede crear envíos todavía.' };
  if (paradas.length < 2) return { ok: false, error: 'Falta la recogida o la entrega.' };
  if (!envio.importe_cliente || !(envio.importe_cliente > 0)) return { ok: false, error: 'El precio aún se está calculando: espera un momento y vuelve a pulsar.' };
  const { data, error } = await s.supabase.rpc('crear_envio_cliente', { p_datos: envio, p_paradas: paradas });
  if (error) return { ok: false, error: traducir(error.message) };
  const fila = (Array.isArray(data) ? data[0] : data) as { id?: string; referencia_gx: string } | undefined;
  if (fila?.id) await contactosDeSitiosNuevos(s.supabase, fila.id, paradas, true);
  return { ok: true, referencia_gx: fila?.referencia_gx ?? '' };
}

// Envío con un operador PROPIO del cliente (manual, Dynamo no interviene): lo crea el
// cliente, o un gestor de Dynamo con «Ver como» ese cliente (la vista decide p_cliente).
export async function crearEnvioManual(envio: Omit<EnvioNuevo, 'cliente_id' | 'importe_cliente' | 'importe_transportista'> & { operador_id: string; precio_acordado_operador: number | null }, paradas: ParadaNueva[]):
  Promise<{ ok: true; referencia_gx: string } | { ok: false; error: string }> {
  comprobarEntrada("app/panel/(app)/nuevo-envio/acciones#crearEnvioManual", [envio, paradas]);
  const s = await sesion();
  const dynamo = esGestor(s?.perfil?.rol);
  if (!s?.perfil || s.perfil.estado !== 'activa' || (s.perfil.rol !== 'cliente' && !dynamo)) return { ok: false, error: 'Tu cuenta no puede crear envíos todavía.' };
  const v = dynamo ? await vistaCruda() : { tipo: 'admin' as const };
  if (dynamo && v.tipo !== 'cliente') return { ok: false, error: 'Para registrar un envío con el transportista propio de un cliente, ponte antes en su vista («Ver como»).' };
  if (!envio.operador_id) return { ok: false, error: 'Elige tu operador de transporte.' };
  if (paradas.length < 2) return { ok: false, error: 'Falta la recogida o la entrega.' };
  const { data, error } = await s.supabase.rpc('crear_envio_manual', { p_datos: envio, p_paradas: paradas, p_cliente: v.tipo === 'cliente' ? v.id : null });
  if (error) return { ok: false, error: traducir(error.message) };
  const fila = (Array.isArray(data) ? data[0] : data) as { id?: string; referencia_gx: string } | undefined;
  if (fila?.id) await contactosDeSitiosNuevos(s.supabase, fila.id, paradas, true);
  return { ok: true, referencia_gx: fila?.referencia_gx ?? '' };
}

// Días de la semana en que abre cada sitio, en su horario general y en el de verano (para
// avisar si la recogida cae en día cerrado y del horario de verano), y las fechas genéricas
// del verano de los almacenes (Parámetros). Solo los sitios que el usuario puede ver: lo
// filtra la seguridad por filas.
export type HorarioSitioAviso = { general: number[]; verano: { activo: boolean; desde: string | null; hasta: string | null; dias: number[]; resumen: string | null } };
// Sitios de UN cliente para el asistente de Dynamo (se piden al elegirlo: con 7.000 sitios
// ---- Últimos precios reales de esta ruta (tabla «Precios internos» del tarifador) ----
// Para la tabla del mockup: el último envío de ESTE cliente en esta misma ruta y el último
// de CUALQUIER cliente (venta/compra/fecha). La ruta casa por CP+país del primer punto de
// carga y del último de descarga. Solo Dynamo: la compra no la ve nunca un cliente.
export type UltimoPrecioRuta = { venta: number | null; compra: number | null; fecha: string | null; ref: string | null };
export async function ultimosPreciosRuta(cliente: string | null, cpO: string, paisO: string, cpD: string, paisD: string):
  Promise<{ mismo: UltimoPrecioRuta; todos: UltimoPrecioRuta }> {
  comprobarEntrada("app/panel/(app)/nuevo-envio/acciones#ultimosPreciosRuta", [cliente, cpO, paisO, cpD, paisD]);
  const nada: UltimoPrecioRuta = { venta: null, compra: null, fecha: null, ref: null };
  const s = await sesion();
  if (!s?.perfil || s.perfil.estado !== 'activa' || !esGestor(s.perfil.rol)) return { mismo: nada, todos: nada };
  const buscar = async (soloCliente: boolean): Promise<UltimoPrecioRuta> => {
    let q = s.supabase.from('envios')
      .select('importe_cliente, importe_transportista, fecha_efectiva, referencia_gx, origen:envio_paradas!inner(envio_id), destino:envio_paradas!inner(envio_id)')
      .eq('origen.tipo', 'carga').eq('origen.orden', 1).eq('origen.codigo_postal', cpO).eq('origen.pais_codigo_iso', paisO)
      .eq('destino.tipo', 'descarga').eq('destino.codigo_postal', cpD).eq('destino.pais_codigo_iso', paisD)
      .eq('es_manual', false).in('estado', ['programado', 'hacia_la_carga', 'cargando', 'en_ruta', 'entregado'])
      .not('importe_cliente', 'is', null)
      .order('fecha_efectiva', { ascending: false }).limit(1);
    if (soloCliente && cliente) q = q.eq('cliente_id', cliente);
    if (soloCliente && !cliente) return nada;
    const { data } = await q;
    const e = data?.[0];
    return e ? { venta: e.importe_cliente, compra: e.importe_transportista, fecha: e.fecha_efectiva, ref: e.referencia_gx } : nada;
  };
  const [mismo, todos] = await Promise.all([buscar(true), buscar(false)]);
  return { mismo, todos };
}

// ---- Kilómetros de la ruta para el precio SUGERIDO (borrador) ----------------------
// Por cada tramo: caché de km reales (entre sitios → entre códigos postales) y, si no hay,
// línea recta × 1,25 con las coordenadas de los sitios; sin nada, 300 km por tramo (el
// mismo por-defecto que el seguimiento). Solo orienta: el precio bueno lo confirma Dynamo.
export type PuntoKm = { sitio_id: string | null; cp: string | null; pais: string | null; lat: number | null; lon: number | null };
// El email del cliente para el botón «Enviar por email a:» de la proforma (usuario,
// 2026-11-13): el del contacto principal con email o, si no tiene, el primero que tenga
// alguno. Solo Dynamo; sin email, la pantalla esconde el botón.
export async function emailDeCliente(p_cliente: string): Promise<string | null> {
  comprobarEntrada("app/panel/(app)/nuevo-envio/acciones#emailDeCliente", [p_cliente]);
  const s = await sesion();
  if (!s?.perfil || !esGestor(s.perfil.rol)) return null;
  const { data } = await s.supabase.from('contactos').select('email, es_principal')
    .eq('cliente_id', p_cliente).not('email', 'is', null)
    .order('es_principal', { ascending: false }).order('creado_en', { ascending: true }).limit(1);
  return data?.[0]?.email ?? null;
}

// Los clientes MÁS ACTIVOS (envíos de los últimos 30 días), para enseñarlos nada más
// abrir el buscador de cliente de Nuevo envío (usuario, 2026-11-13): suelen repetirse
// y así no hay que teclear. Solo Dynamo.
export async function clientesActivos(): Promise<{ id: string; nombre: string; cif: string; principal_id: string | null; iva_pct: number; nima_por_defecto: boolean }[]> {
  comprobarEntrada("app/panel/(app)/nuevo-envio/acciones#clientesActivos", []);
  const s = await sesion();
  if (!s?.perfil || !esGestor(s.perfil.rol)) return [];
  const desde = new Date(Date.now() - 30 * 86400000).toISOString();
  const { data: env } = await s.supabase.from('envios').select('cliente_id').gte('creado_en', desde).not('cliente_id', 'is', null).limit(3000);
  const cuenta = new Map<string, number>();
  for (const e of env ?? []) cuenta.set(e.cliente_id!, (cuenta.get(e.cliente_id!) ?? 0) + 1);
  const ids = [...cuenta.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([id]) => id);
  if (!ids.length) return [];
  const { data: cli } = await s.supabase.from('clientes').select('id, nombre_visible, cif, sitio_principal_id, iva_pct, nima_por_defecto').in('id', ids);
  const por = new Map((cli ?? []).map((c) => [c.id, c]));
  return ids.flatMap((id) => {
    const c = por.get(id);
    return c ? [{ id: c.id, nombre: c.nombre_visible ?? '', cif: c.cif, principal_id: c.sitio_principal_id, iva_pct: Number(c.iva_pct ?? 21), nima_por_defecto: !!c.nima_por_defecto }] : [];
  });
}

export async function kmRuta(puntos: PuntoKm[]): Promise<{ km: number; estimado: boolean }> {
  comprobarEntrada("app/panel/(app)/nuevo-envio/acciones#kmRuta", [puntos]);
  const s = await sesion();
  if (!s?.perfil || puntos.length < 2) return { km: 0, estimado: true };
  const sb = s.supabase;
  const ids = puntos.map((p) => p.sitio_id).filter(Boolean) as string[];
  const coords = new Map<string, { lat: number | null; lon: number | null }>();
  if (ids.length) {
    const { data } = await sb.from('sitios').select('id, lat, lon').in('id', ids);
    (data ?? []).forEach((x) => coords.set(x.id, { lat: x.lat, lon: x.lon }));
  }
  let km = 0, estimado = false;
  for (let i = 1; i < puntos.length; i++) {
    const a = puntos[i - 1], b = puntos[i];
    let tramo: number | null = null;
    if (a.sitio_id && b.sitio_id) {
      const r = await sb.rpc('km_sitios', { p_origen: a.sitio_id, p_destino: b.sitio_id, p_max_edad: '100 years' });
      tramo = r.data ?? null;
    }
    if (tramo == null && a.cp && b.cp && a.pais && b.pais) {
      const r = await sb.rpc('km_cp', { p_pais_codigo_iso_origen: a.pais, p_codigo_postal_origen: a.cp,
        p_pais_codigo_iso_destino: b.pais, p_codigo_postal_destino: b.cp, p_max_edad: '100 years' });
      tramo = r.data ?? null;
    }
    if (tramo == null) {
      const ca = a.sitio_id ? coords.get(a.sitio_id) : { lat: a.lat, lon: a.lon };
      const cb = b.sitio_id ? coords.get(b.sitio_id) : { lat: b.lat, lon: b.lon };
      if (ca?.lat != null && ca.lon != null && cb?.lat != null && cb.lon != null) {
        const rad = (x: number) => (x * Math.PI) / 180;
        const h = Math.sin(rad(cb.lat - ca.lat) / 2) ** 2 + Math.cos(rad(ca.lat)) * Math.cos(rad(cb.lat)) * Math.sin(rad(cb.lon - ca.lon) / 2) ** 2;
        tramo = Math.round(2 * 6371 * Math.asin(Math.sqrt(h)) * 1.25);
      }
    }
    if (tramo == null) { tramo = 300; estimado = true; }
    km += Number(tramo);
  }
  return { km: Math.round(km), estimado };
}

// de 3.000 clientes la pantalla mandaba 2,6 MB al abrirse).
export async function sitiosDelCliente(cliente: string): Promise<SitioOpcion[]> {
  comprobarEntrada("app/panel/(app)/nuevo-envio/acciones#sitiosDelCliente", [cliente]);
  const s = await sesion();
  if (!s?.perfil || !esGestor(s.perfil.rol) || !/^[0-9a-f-]{36}$/i.test(cliente)) return [];
  const { data } = await s.supabase.from('sitios')
    .select('id, cliente_id, nombre_empresa, tipo, direccion, codigo_postal, poblacion, provincia, pais_codigo_iso, horarios, es_almacen_dynamo, disponible')
    .eq('borrado', false).eq('cliente_id', cliente).order('nombre_empresa').limit(2000);
  return (data ?? []) as SitioOpcion[];
}

export async function diasAbiertosDe(ids: string[]): Promise<{ sitios: Record<string, HorarioSitioAviso>; generico: { desde: string; hasta: string } }> {
  comprobarEntrada("app/panel/(app)/nuevo-envio/acciones#diasAbiertosDe", [ids]);
  const s = await sesion();
  const limpios = [...new Set(ids)].filter((x) => /^[0-9a-f-]{36}$/i.test(x)).slice(0, 20);
  const generico = { desde: '05-25', hasta: '09-15' };
  if (!s?.perfil) return { sitios: {}, generico };
  const [{ data: pv }, h, l] = await Promise.all([
    s.supabase.rpc('verano_sitios_fechas'),
    limpios.length ? s.supabase.from('sitio_horarios').select('sitio_id, temporada, dia_semana').in('sitio_id', limpios) : Promise.resolve({ data: [] as Pick<Tabla<'sitio_horarios'>, 'sitio_id' | 'temporada' | 'dia_semana'>[] }),
    limpios.length ? s.supabase.from('sitios').select('id, verano_activo, verano_desde, verano_hasta, horarios_verano').in('id', limpios)
      : Promise.resolve({ data: [] as Pick<Tabla<'sitios'>, 'id' | 'verano_activo' | 'verano_desde' | 'verano_hasta' | 'horarios_verano'>[] }),
  ]);
  // Las fechas genéricas, con una función: Parámetros solo lo lee Dynamo.
  const g = pv as { desde?: string; hasta?: string } | null;
  if (g?.desde) generico.desde = g.desde;
  if (g?.hasta) generico.hasta = g.hasta;
  const sitios: Record<string, HorarioSitioAviso> = {};
  (l.data ?? []).forEach((x) => { sitios[x.id] = { general: [], verano: { activo: !!x.verano_activo, desde: x.verano_desde, hasta: x.verano_hasta, dias: [], resumen: x.horarios_verano } }; });
  (h.data ?? []).forEach((r) => {
    const x = sitios[r.sitio_id]; if (!x) return;
    const lista = r.temporada === 'verano' ? x.verano.dias : x.general;
    if (!lista.includes(r.dia_semana)) lista.push(r.dia_semana);
  });
  return { sitios, generico };
}

// ¿Se hace esta ruta? La misma comprobación que al confirmar (países en los que
// trabajamos y excepciones), pero antes, para avisar en cuanto se pone la ruta. Devuelve
// los motivos de lo que no se puede (vacío = se puede).
export async function comprobarCobertura(paradas: { orden: number; tipo: 'carga' | 'descarga'; pais: string; codigo_postal: string; nombre: string }[],
  tipoCarga: 'completa' | 'grupaje' | null): Promise<{ punto: string; efecto: string; mensaje: string }[]> {
  comprobarEntrada("app/panel/(app)/nuevo-envio/acciones#comprobarCobertura", [paradas, tipoCarga]);
  const s = await sesion();
  if (!s?.perfil) return [];
  const { data } = await s.supabase.rpc('comprobar_cobertura', { p_paradas: paradas.slice(0, 20), p_tipo_carga: tipoCarga });
  return (data ?? []).map((x) => ({ punto: x.punto, efecto: x.efecto, mensaje: x.mensaje }));
}

// Datos editables de los sitios que se usan en la ruta (para rellenar/corregir en la
// confirmación lo que falte: horario, teléfono de contacto, notas…). Se piden solo de los
// que están ya en la agenda, al llegar al paso 4. Lo que puede leer cada uno lo decide la
// base de datos (RLS): Dynamo ve todo; el cliente, solo sus sitios.
export async function datosEditablesDeSitios(ids: string[]): Promise<Record<string, SitioEditable>> {
  comprobarEntrada("app/panel/(app)/nuevo-envio/acciones#datosEditablesDeSitios", [ids]);
  const s = await sesion();
  const limpios = [...new Set(ids)].filter((x) => /^[0-9a-f-]{36}$/i.test(x)).slice(0, 20);
  if (!s?.perfil || !limpios.length) return {};
  const [sit, con, hor] = await Promise.all([
    s.supabase.from('sitios').select('id, es_almacen_dynamo, tipo, anotaciones, url_google_maps, emails_avisos, mercancia_defecto, verano_activo, verano_desde, verano_hasta').in('id', limpios),
    s.supabase.from('contactos').select('sitio_id, id, nombre, telefono, email, es_principal, creado_en').in('sitio_id', limpios),
    s.supabase.from('sitio_horarios').select('sitio_id, temporada, dia_semana, abre, cierra').in('sitio_id', limpios),
  ]);
  const out: Record<string, SitioEditable> = {};
  (sit.data ?? []).forEach((x) => { out[x.id] = { es_almacen_dynamo: !!x.es_almacen_dynamo, tipo: x.tipo, anotaciones: x.anotaciones, url_google_maps: x.url_google_maps, emails_avisos: x.emails_avisos ?? [], mercancia_defecto: x.mercancia_defecto, contacto: { id: null, nombre: '', telefono: '', email: '' }, contactos: [], horario: [],
    verano: { activo: !!x.verano_activo, desde: x.verano_desde ?? VERANO_GENERICO.desde, hasta: x.verano_hasta ?? VERANO_GENERICO.hasta, horario: [] } }; });
  // Horario general de cada sitio (filas de día → grupos de la ficha).
  const porSitio = new Map<string, FilaHorario[]>(), porSitioVerano = new Map<string, FilaHorario[]>();
  (hor.data ?? []).forEach((r) => {
    const m = r.temporada === 'verano' ? porSitioVerano : porSitio;
    const l = m.get(r.sitio_id) ?? []; l.push({ dia_semana: r.dia_semana, abre: r.abre, cierra: r.cierra }); m.set(r.sitio_id, l);
  });
  porSitioVerano.forEach((filas, sid) => { if (out[sid]) out[sid].verano.horario = gruposDe(filas); });
  Object.values(out).forEach((x) => { if (!x.verano.horario.length) x.verano.horario = HORARIO_VERANO_POR_DEFECTO; });
  porSitio.forEach((filas, sid) => { if (out[sid]) out[sid].horario = gruposDe(filas); });
  // Contacto principal de cada sitio (el marcado principal; si no, el más antiguo).
  const cont = new Map<string, { id: string; nombre: string; telefono: string; email: string; es_principal: boolean; creado_en: string }[]>();
  (con.data ?? []).forEach((c) => { const l = cont.get(c.sitio_id!) ?? []; l.push({ id: c.id, nombre: c.nombre ?? '', telefono: c.telefono ?? '', email: c.email ?? '', es_principal: !!c.es_principal, creado_en: String(c.creado_en) }); cont.set(c.sitio_id!, l); });
  cont.forEach((l, sid) => {
    if (!out[sid]) return;
    const orden = [...l].sort((a, b) => Number(b.es_principal) - Number(a.es_principal) || a.creado_en.localeCompare(b.creado_en));
    const p = orden[0];
    if (p) out[sid].contacto = { id: p.id, nombre: p.nombre, telefono: p.telefono, email: p.email };
    // Todos los contactos con teléfono (principal primero): la tarjeta del paso 4 los lista.
    out[sid].contactos = orden.filter((c) => c.telefono).slice(0, 5).map((c) => ({ id: c.id, nombre: c.nombre, telefono: c.telefono }));
  });
  return out;
}

// Guarda en la ficha del sitio los datos que se corrigieron en la confirmación del envío
// (horario, teléfono/persona de contacto, notas, emails de avisos y, solo Dynamo, el enlace
// de Maps). Los almacenes de Dynamo NO se tocan desde aquí (datos fijos del catálogo). Va
// antes de crear el envío; si algo no es válido, se corta y no se crea nada.
export async function guardarEdicionesSitios(cambios: EdicionSitio[]): Promise<{ ok: true } | { ok: false; error: string }> {
  comprobarEntrada("app/panel/(app)/nuevo-envio/acciones#guardarEdicionesSitios", [cambios]);
  const s = await sesion();
  if (!s?.perfil) return { ok: false, error: 'No tienes permiso para esto.' };
  const gestor = esGestor(s.perfil.rol);
  const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  for (const c of (cambios ?? []).slice(0, 10)) {
    if (!/^[0-9a-f-]{36}$/i.test(c.sitio_id)) continue;
    // No tocar los almacenes de Dynamo (datos fijos; se editan en Almacenes).
    const { data: sit } = await s.supabase.from('sitios').select('id, es_almacen_dynamo').eq('id', c.sitio_id).maybeSingle();
    if (!sit || sit.es_almacen_dynamo) continue;
    const fila: Record<string, unknown> = { anotaciones: (c.anotaciones ?? '').trim() || null };
    // Mercancía por defecto: SOLO si el detalle de mercancía del paso 4 se editó a mano
    // se guarda en la ficha del sitio (vaciarlo lo borra); el prerrelleno del envío no
    // pisa la agenda por sí solo (usuario, 2026-11-10).
    if (c.mercancia_defecto !== undefined) fila.mercancia_defecto = (c.mercancia_defecto ?? '').trim() || null;
    // Emails de avisos: si se ponen, se validan y sustituyen; vacío NO borra los que había.
    const emails = [...new Set((c.emails_avisos ?? []).map((e) => e.trim().toLowerCase()).filter(Boolean))];
    if (emails.length) {
      if (emails.length > 10) return { ok: false, error: `Máximo 10 emails de avisos por sitio (has puesto ${emails.length}).` };
      const malo = emails.find((e) => !EMAIL.test(e));
      if (malo) return { ok: false, error: `«${malo}» no es un email de avisos válido.` };
      fila.emails_avisos = emails;
    }
    if (gestor) fila.url_google_maps = (c.url_google_maps ?? '').trim() || null;
    const up = await s.supabase.from('sitios').update(fila as TablaUpdate<'sitios'>).eq('id', c.sitio_id);
    if (up.error) return { ok: false, error: traducir(up.error.message) };
    // Horario (todo o nada; la base de datos avisa si dos tramos del mismo día se pisan).
    if (c.horario_tramos?.length) {
      const eh = await s.supabase.rpc('guardar_horario', { p_sitio: c.sitio_id, p_tramos: c.horario_tramos });
      if (eh.error) return { ok: false, error: /se pisan/i.test(eh.error.message) ? 'Hay dos tramos del mismo día del horario que se pisan.' : traducir(eh.error.message) };
    }
    // Horario de VERANO (usuario, 2026-11-10): solo llega si se tocó en la tarjeta; mismo
    // guardado que la ficha de Sitios (activo + fechas + tramos; inactivo = sin tramos).
    if (c.verano) {
      if (c.verano.activo && (!MMDD.test(c.verano.desde) || !MMDD.test(c.verano.hasta))) {
        return { ok: false, error: 'Pon las fechas del horario de verano (desde y hasta).' };
      }
      const ev = await s.supabase.rpc('guardar_horario_verano', { p_sitio: c.sitio_id, p_activo: c.verano.activo,
        p_desde: c.verano.desde, p_hasta: c.verano.hasta, p_tramos: c.verano.activo ? c.verano.tramos : [] });
      if (ev.error) return { ok: false, error: /se pisan/i.test(ev.error.message) ? 'Horario de verano: hay dos tramos del mismo día que se pisan.' : traducir(ev.error.message) };
    }
    // Contacto principal: teléfono, persona y email. Si no había, se crea; si había, se actualiza.
    const tel = normalizaTel(c.contacto_telefono);
    const nombre = (c.contacto_nombre ?? '').trim();
    const email = (c.contacto_email ?? '').trim().toLowerCase();
    if (tel || nombre || email) {
      if (tel && tel.replace('+', '').length < 6) return { ok: false, error: 'El teléfono de contacto del sitio no es válido.' };
      if (email && !EMAIL.test(email)) return { ok: false, error: 'El email de contacto del sitio no es válido.' };
      const fc = { nombre: nombre || null, telefono: tel || null, email: email || null };
      const r = c.contacto_id && /^[0-9a-f-]{36}$/i.test(c.contacto_id)
        ? await s.supabase.from('contactos').update(fc).eq('id', c.contacto_id)
        : await s.supabase.from('contactos').insert({ sitio_id: c.sitio_id, ...fc, funcion: 'general', es_principal: true });
      if (r.error) return { ok: false, error: traducir(r.error.message) };
    }
    // Contactos ADICIONALES añadidos desde la tarjeta (usuario, 2026-11-10): se crean en
    // la agenda del sitio, no principales. Los vacíos se ignoran.
    for (const x of (c.contactos_extra ?? []).slice(0, 5)) {
      const xt = normalizaTel(x.telefono); const xn = (x.nombre ?? '').trim(); const xe = (x.email ?? '').trim().toLowerCase();
      if (!xt && !xn && !xe) continue;
      if (xt && xt.replace('+', '').length < 6) return { ok: false, error: 'El teléfono de un contacto adicional del sitio no es válido.' };
      if (xe && !EMAIL.test(xe)) return { ok: false, error: `«${xe}» no es un email válido (contacto adicional del sitio).` };
      const r = await s.supabase.from('contactos').insert({ sitio_id: c.sitio_id,
        nombre: xn || null, telefono: xt || null, email: xe || null, funcion: 'general', es_principal: false });
      if (r.error) return { ok: false, error: traducir(r.error.message) };
    }
  }
  return { ok: true };
}
