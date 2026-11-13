'use server';

import { sesion, esGestor } from '@/lib/sesion';
import { vistaDe, filtrarVista } from '@/lib/vista';
import { comprobarEntrada } from '@/lib/entradas/comprobar';

// BUSCADOR GLOBAL del panel (usuario, 2026-11-12): una sola búsqueda desde cualquier
// pantalla (caja del dashboard o Cmd/Ctrl+K) que junta envíos, sitios, clientes y
// transportistas. Reutiliza los buscadores de la base de datos que ya existen:
// buscar_envios y sitios_pagina van por RLS (cada rol ve solo lo suyo); clientes y
// transportistas, solo para el equipo de Dynamo (sus funciones ya lo exigen con ve_todo()).
export type BusquedaGlobal = {
  envios: { id: string; ref: string; ruta: string; estado: string }[];
  sitios: { id: string; nombre: string; direccion: string }[];
  clientes: { id: string; nombre: string; cif: string }[];
  transportistas: { id: string; nombre: string; cif: string }[];
};
const VACIA: BusquedaGlobal = { envios: [], sitios: [], clientes: [], transportistas: [] };

type SB = NonNullable<Awaited<ReturnType<typeof sesion>>>['supabase'];

// Quién busca y con qué alcance. La VISTA manda (usuario, 2026-11-13): con «Ver como»
// un cliente o un transportista, solo lo de ESA empresa (filtrarVista, como la lista de
// Envíos) y sin clientes ni transportistas. Una cuenta real de cliente o transportista
// ya está limitada a lo suyo por RLS en la base de datos, se mire como se mire.
async function alcance() {
  const s = await sesion();
  if (!s?.perfil) return null;
  const vista = await vistaDe(s.supabase, s.perfil.rol);
  return {
    sb: s.supabase, vista,
    gestor: esGestor(s.perfil.rol) && vista.tipo === 'admin',
    // Los sitios son la agenda de los clientes: en la vista (o cuenta) de transportista no hay.
    conSitios: vista.tipo !== 'transportista' && s.perfil.rol !== 'transportista',
    clienteSitios: vista.tipo === 'cliente' ? vista.id : null,
  };
}

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

export async function busquedaGlobal(q: string): Promise<BusquedaGlobal> {
  comprobarEntrada("app/panel/(app)/buscador/acciones#busquedaGlobal", [q]);
  const a = await alcance();
  if (!a) return VACIA;
  q = (q ?? '').trim().slice(0, 120);
  if (q.length < 2) return VACIA;
  const { sb, vista, gestor } = a;
  // Envíos en UNA sola consulta (antes eran dos viajes: ids por RPC y luego los datos,
  // y se notaba lento — usuario, 2026-11-12): mismas reglas que buscar_envios (todas
  // las palabras, sin tildes, sobre texto_busqueda, por RLS) pero trayendo ya lo que
  // se pinta, más recientes primero.
  const palabras = q.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .split(/\s+/).filter(Boolean).slice(0, 6)
    .map((w) => `%${w.replace(/%/g, '\\%').replace(/_/g, '\\_')}%`);
  let qe = filtrarVista(sb.from('envios').select('id, referencia_gx, poblacion_origen, poblacion_destino, estado'), vista);
  for (const w of palabras) qe = qe.ilike('texto_busqueda', w);
  const [env, sit, cli, tra] = await Promise.all([
    qe.order('creado_en', { ascending: false }).limit(6),
    // Sitios con el mismo buscador de la pantalla de Sitios (sitios_pagina: RLS y, con
    // «Ver como» cliente, solo los de ese cliente).
    a.conSitios ? sb.rpc('sitios_pagina', { p_q: q, p_cliente: a.clienteSitios, p_pagina: 1, p_por_pagina: 3 }) : Promise.resolve({ data: null }),
    gestor ? sb.rpc('buscar_clientes', { p_q: q, p_limite: 4 }) : Promise.resolve({ data: null }),
    gestor ? sb.rpc('buscar_transportistas', { p_q: q, p_limite: 4 }) : Promise.resolve({ data: null }),
  ]);
  type Fila = { id: string; nombre: string; cif: string };
  return {
    envios: aEnvios(env.data),
    sitios: await detalleSitios(sb, ((sit.data ?? []) as { id: string }[]).map((x) => x.id)),
    clientes: ((cli.data ?? []) as Fila[]).map((c) => ({ id: c.id, nombre: c.nombre, cif: c.cif })),
    transportistas: ((tra.data ?? []) as Fila[]).map((t) => ({ id: t.id, nombre: t.nombre, cif: t.cif })),
  };
}

// MUESTRA al pulsar la caja, antes de escribir (usuario, 2026-11-13): lo último de cada
// grupo, para ver de un vistazo qué encuentra el buscador y abrir lo reciente en un
// toque. Admin: 2 envíos, 2 sitios, 2 clientes y 2 transportistas; cliente: 2 envíos y
// 2 sitios; transportista: sus 2 últimos envíos. Mismos permisos que la búsqueda.
export async function muestraGlobal(): Promise<BusquedaGlobal> {
  comprobarEntrada("app/panel/(app)/buscador/acciones#muestraGlobal", []);
  const a = await alcance();
  if (!a) return VACIA;
  const { sb, vista, gestor } = a;
  let qs = a.conSitios ? sb.from('sitios').select('id').order('creado_en', { ascending: false }).limit(2) : null;
  if (qs && a.clienteSitios) qs = qs.eq('cliente_id', a.clienteSitios);
  const [env, sit, cli, tra] = await Promise.all([
    filtrarVista(sb.from('envios').select('id, referencia_gx, poblacion_origen, poblacion_destino, estado'), vista)
      .order('creado_en', { ascending: false }).limit(2),
    qs ?? Promise.resolve({ data: null }),
    gestor ? sb.from('clientes').select('id, nombre_visible, cif').order('creado_en', { ascending: false }).limit(2) : Promise.resolve({ data: null }),
    gestor ? sb.from('transportistas').select('id, nombre_visible, cif').order('creado_en', { ascending: false }).limit(2) : Promise.resolve({ data: null }),
  ]);
  type FilaNv = { id: string; nombre_visible: string | null; cif: string };
  return {
    envios: aEnvios(env.data),
    sitios: await detalleSitios(sb, ((sit.data ?? []) as { id: string }[]).map((x) => x.id)),
    clientes: ((cli.data ?? []) as FilaNv[]).map((c) => ({ id: c.id, nombre: c.nombre_visible ?? '', cif: c.cif })),
    transportistas: ((tra.data ?? []) as FilaNv[]).map((t) => ({ id: t.id, nombre: t.nombre_visible ?? '', cif: t.cif })),
  };
}
