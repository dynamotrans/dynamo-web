'use server';

import { textoBusqueda } from '@/lib/formato';
import { sesion, esGestor, esDynamo } from '@/lib/sesion';
import { misEnviosLigerosPorId } from '@/lib/enviosLigeros';
import { vistaDe, filtrarVista } from '@/lib/vista';
import { comprobarEntrada } from '@/lib/entradas/comprobar';

// BUSCADOR GLOBAL del panel (usuario, 2026-11-12): una sola búsqueda desde cualquier
// pantalla (caja del dashboard o Cmd/Ctrl+K). Cada uno busca en LO SUYO (usuario,
// 2026-11-16):
//   · Cliente: sus envíos, sus sitios, sus incidencias y sus penalizaciones.
//   · Transportista: sus envíos, sus incidencias y sus penalizaciones.
//   · Dynamo: todo eso de todos, más clientes y transportistas.
// Una cuenta real de cliente o transportista NO lee la tabla de envíos ni la de
// penalizaciones: tiene sus funciones (las mismas de sus pantallas), y por ahí se busca.
// Antes se leía la tabla y a un cliente no le salía ni un envío.
export type BusquedaGlobal = {
  envios: { id: string; ref: string; ruta: string; estado: string }[];
  sitios: { id: string; nombre: string; direccion: string }[];
  clientes: { id: string; nombre: string; cif: string }[];
  transportistas: { id: string; nombre: string; cif: string }[];
  incidencias: { id: string; codigo: string; titulo: string }[];
  penalizaciones: { id: string; codigo: string; detalle: string }[];
};
const VACIA: BusquedaGlobal = { envios: [], sitios: [], clientes: [], transportistas: [], incidencias: [], penalizaciones: [] };

type SB = NonNullable<Awaited<ReturnType<typeof sesion>>>['supabase'];

// Quién busca y con qué alcance. La VISTA manda (usuario, 2026-11-13): con «Ver como»
// un cliente o un transportista, solo lo de ESA empresa (filtrarVista, como la lista de
// Envíos) y sin clientes ni transportistas. Una cuenta real de cliente o transportista
// ya está limitada a lo suyo por la base de datos, se mire como se mire.
async function alcance() {
  const s = await sesion();
  if (!s?.perfil) return null;
  const vista = await vistaDe(s.supabase, s.perfil.rol);
  const real = !esDynamo(s.perfil.rol);   // cuenta de cliente o de transportista
  return {
    sb: s.supabase, vista, real,
    esT: s.perfil.rol === 'transportista',
    gestor: esGestor(s.perfil.rol) && vista.tipo === 'admin',
    // Los sitios son la agenda de los clientes: en la vista (o cuenta) de transportista no hay.
    conSitios: vista.tipo !== 'transportista' && s.perfil.rol !== 'transportista',
    clienteSitios: vista.tipo === 'cliente' ? vista.id : null,
  };
}
type Alcance = NonNullable<Awaited<ReturnType<typeof alcance>>>;

async function detalleSitios(sb: SB, ids: string[]): Promise<BusquedaGlobal['sitios']> {
  if (!ids.length) return [];
  const { data } = await sb.from('sitios').select('id, nombre_empresa, direccion, codigo_postal, poblacion').in('id', ids);
  return ids.map((id) => {
    const f = (data ?? []).find((x) => x.id === id);
    return f ? { id: f.id, nombre: f.nombre_empresa, direccion: [f.direccion, f.codigo_postal, f.poblacion].filter(Boolean).join(', ') } : null;
  }).filter(Boolean) as BusquedaGlobal['sitios'];
}

const aEnvios = (filas: { id: string; referencia_gx: string | null; poblacion_origen: string | null; poblacion_destino: string | null; estado: string }[] | null): BusquedaGlobal['envios'] =>
  (filas ?? []).map((e) => ({ id: e.id, ref: e.referencia_gx ?? '', ruta: [e.poblacion_origen, e.poblacion_destino].filter(Boolean).join(' → '), estado: e.estado }));

// Las palabras de la búsqueda, sin tildes y como patrones «contiene».
const sinTildes = (t: string) => t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const palabrasDe = (q: string) => sinTildes(q).split(/\s+/).filter(Boolean).slice(0, 6);
const patron = (w: string) => `%${w.replace(/%/g, '\\%').replace(/_/g, '\\_')}%`;

// ENVÍOS. Cuenta de cliente o transportista: los ids con el buscador de su pantalla de
// Envíos y los datos con su función (solo lo suyo, sin datos de la otra parte). Dynamo:
// una sola consulta a la tabla (todas las palabras, sin tildes, sobre texto_busqueda).
async function enviosDe(a: Alcance, q: string | null, limite: number): Promise<BusquedaGlobal['envios']> {
  if (a.real) {
    const { data } = q
      ? await a.sb.rpc('buscar_envios_pagina', { p_q: q, p_pagina: 1, p_por_pagina: limite })
      : await a.sb.rpc('envios_pagina', { p_pestana: 'todas', p_pagina: 1, p_por_pagina: limite });
    const ids = ((data ?? []) as { id: string }[]).map((x) => x.id);
    const filas = await misEnviosLigerosPorId(a.sb, ids, a.esT);
    return filas.map((e) => ({ id: e.id, ref: e.referencia_gx ?? '', ruta: [e.origen, e.destino].filter(Boolean).join(' → '), estado: e.estado }));
  }
  let qe = filtrarVista(a.sb.from('envios').select('id, referencia_gx, poblacion_origen, poblacion_destino, estado'), a.vista);
  for (const w of q ? palabrasDe(q) : []) qe = qe.ilike('texto_busqueda', patron(w));
  const { data } = await qe.order('creado_en', { ascending: false }).limit(limite);
  return aEnvios(data);
}

// INCIDENCIAS: la tabla ya deja a cada uno solo las suyas. Se busca por código, resumen y
// detalle; con varias palabras, deben estar todas.
async function incidenciasDe(a: Alcance, q: string | null, limite: number): Promise<BusquedaGlobal['incidencias']> {
  let qi = filtrarVista(a.sb.from('incidencias').select('id, codigo, titulo'), a.vista);
  for (const w of q ? palabrasDe(q) : []) {
    // Fuera lo que rompería el filtro «o» de la consulta (comas, paréntesis, comillas).
    const p = patron(w.replace(/[,()"\\]/g, ' ').trim());
    if (p === '%%') continue;
    qi = qi.or(`codigo.ilike.${p},titulo.ilike.${p},detalle.ilike.${p}`);
  }
  const { data } = await qi.order('creado_en', { ascending: false }).limit(limite);
  return (data ?? []).map((x) => ({ id: x.id, codigo: x.codigo ?? '', titulo: x.titulo ?? '' }));
}

// PENALIZACIONES. Cuenta de cliente o transportista: su función (son pocas; se filtran
// aquí). Dynamo: la tabla, como su pantalla.
async function penalizacionesDe(a: Alcance, q: string | null, limite: number): Promise<BusquedaGlobal['penalizaciones']> {
  const ws = q ? palabrasDe(q) : [];
  if (a.real) {
    const { data } = a.esT ? await a.sb.rpc('mis_penalizaciones_transportista') : await a.sb.rpc('mis_penalizaciones');
    return ((data ?? []) as { id: string; codigo: string | null; referencia_gx: string | null; tipo: string | null; descripcion: string | null; creado_en: string }[])
      .filter((p) => { const b = sinTildes([p.codigo, p.referencia_gx, p.tipo, p.descripcion].filter(Boolean).join(' ')); return ws.every((w) => b.includes(w)); })
      .sort((x, y) => (x.creado_en < y.creado_en ? 1 : -1)).slice(0, limite)
      .map((p) => ({ id: p.id, codigo: p.codigo ?? '', detalle: [p.tipo, p.referencia_gx ? `#${p.referencia_gx}` : ''].filter(Boolean).join(' · ') }));
  }
  const conVista = a.vista.tipo !== 'admin';
  let qp = filtrarVista(a.sb.from('penalizaciones').select('id, codigo, descripcion, tipos_penalizacion(nombre), ' + (conVista ? 'envios!inner' : 'envios') + '(referencia_gx, cliente_id, transportista_id)'),
    a.vista, { cliente: 'envios.cliente_id', transportista: 'envios.transportista_id' });
  for (const w of ws) {
    const p = patron(w.replace(/[,()"\\]/g, ' ').trim());
    if (p === '%%') continue;
    qp = qp.or(`codigo.ilike.${p},descripcion.ilike.${p}`);
  }
  const { data } = await qp.order('creado_en', { ascending: false }).limit(limite)
    .overrideTypes<{ id: string; codigo: string | null; tipos_penalizacion: { nombre: string | null } | null; envios: { referencia_gx: string | null } | null }[], { merge: false }>();
  return (data ?? []).map((p) => ({ id: p.id, codigo: p.codigo ?? '',
    detalle: [p.tipos_penalizacion?.nombre, p.envios?.referencia_gx ? `#${p.envios.referencia_gx}` : ''].filter(Boolean).join(' · ') }));
}

export async function busquedaGlobal(q: string): Promise<BusquedaGlobal> {
  comprobarEntrada("app/panel/(app)/buscador/acciones#busquedaGlobal", [q]);
  const a = await alcance();
  if (!a) return VACIA;
  q = textoBusqueda((q ?? '').slice(0, 120));
  if (q.length < 2) return VACIA;
  const { sb, gestor } = a;
  const [envios, sit, cli, tra, incidencias, penalizaciones] = await Promise.all([
    enviosDe(a, q, 6).catch(() => []),
    // Sitios con el mismo buscador de la pantalla de Sitios (sitios_pagina: RLS y, con
    // «Ver como» cliente, solo los de ese cliente).
    a.conSitios ? sb.rpc('sitios_pagina', { p_q: q, p_cliente: a.clienteSitios, p_pagina: 1, p_por_pagina: 3 }) : Promise.resolve({ data: null }),
    gestor ? sb.rpc('buscar_clientes', { p_q: q, p_limite: 4 }) : Promise.resolve({ data: null }),
    gestor ? sb.rpc('buscar_transportistas', { p_q: q, p_limite: 4 }) : Promise.resolve({ data: null }),
    incidenciasDe(a, q, 4).catch(() => []),
    penalizacionesDe(a, q, 4).catch(() => []),
  ]);
  type Fila = { id: string; nombre: string; cif: string };
  return {
    envios,
    sitios: await detalleSitios(sb, ((sit.data ?? []) as { id: string }[]).map((x) => x.id)),
    clientes: ((cli.data ?? []) as Fila[]).map((c) => ({ id: c.id, nombre: c.nombre, cif: c.cif })),
    transportistas: ((tra.data ?? []) as Fila[]).map((t) => ({ id: t.id, nombre: t.nombre, cif: t.cif })),
    incidencias, penalizaciones,
  };
}

// MUESTRA al pulsar la caja, antes de escribir (usuario, 2026-11-13 y 2026-11-16): lo
// último de cada grupo — 2 de cada —, para ver de un vistazo qué encuentra el buscador y
// abrir lo reciente en un toque. Cliente: envíos, sitios, incidencias y penalizaciones;
// transportista: envíos, incidencias y penalizaciones; Dynamo: además clientes y
// transportistas. Mismos permisos que la búsqueda.
export async function muestraGlobal(): Promise<BusquedaGlobal> {
  comprobarEntrada("app/panel/(app)/buscador/acciones#muestraGlobal", []);
  const a = await alcance();
  if (!a) return VACIA;
  const { sb, gestor } = a;
  // Mismos filtros que la pantalla de Sitios (sitios_pagina): ni borrados ni almacenes
  // Dynamo. Sin esto, la muestra enseñaba por RLS sitios que la página no lista — un
  // cliente con la agenda a cero veía sugerencias (usuario, 2026-11-14, pantallazo).
  let qs = a.conSitios
    ? sb.from('sitios').select('id').eq('borrado', false).eq('es_almacen_dynamo', false)
        .order('creado_en', { ascending: false }).limit(2)
    : null;
  if (qs && a.clienteSitios) qs = qs.eq('cliente_id', a.clienteSitios);
  const [envios, sit, cli, tra, incidencias, penalizaciones] = await Promise.all([
    enviosDe(a, null, 2).catch(() => []),
    qs ?? Promise.resolve({ data: null }),
    gestor ? sb.from('clientes').select('id, nombre_visible, cif').order('creado_en', { ascending: false }).limit(2) : Promise.resolve({ data: null }),
    gestor ? sb.from('transportistas').select('id, nombre_visible, cif').order('creado_en', { ascending: false }).limit(2) : Promise.resolve({ data: null }),
    incidenciasDe(a, null, 2).catch(() => []),
    penalizacionesDe(a, null, 2).catch(() => []),
  ]);
  type FilaNv = { id: string; nombre_visible: string | null; cif: string };
  return {
    envios,
    sitios: await detalleSitios(sb, ((sit.data ?? []) as { id: string }[]).map((x) => x.id)),
    clientes: ((cli.data ?? []) as FilaNv[]).map((c) => ({ id: c.id, nombre: c.nombre_visible ?? '', cif: c.cif })),
    transportistas: ((tra.data ?? []) as FilaNv[]).map((t) => ({ id: t.id, nombre: t.nombre_visible ?? '', cif: t.cif })),
    incidencias, penalizaciones,
  };
}
