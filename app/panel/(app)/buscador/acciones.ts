'use server';

import { sesion, esGestor } from '@/lib/sesion';
import { comprobarEntrada } from '@/lib/entradas/comprobar';

// BUSCADOR GLOBAL del panel (usuario, 2026-11-12): una sola búsqueda desde cualquier
// pantalla (caja del dashboard o Cmd/Ctrl+K) que junta envíos, clientes y
// transportistas. Reutiliza los buscadores de la base de datos que ya existen:
// buscar_envios va por RLS (cada rol ve solo lo suyo); clientes y transportistas,
// solo para el equipo de Dynamo (sus funciones ya lo exigen con ve_todo()).
export type BusquedaGlobal = {
  envios: { id: string; ref: string; ruta: string; estado: string }[];
  clientes: { id: string; nombre: string; cif: string }[];
  transportistas: { id: string; nombre: string; cif: string }[];
};
const VACIA: BusquedaGlobal = { envios: [], clientes: [], transportistas: [] };

export async function busquedaGlobal(q: string): Promise<BusquedaGlobal> {
  comprobarEntrada("app/panel/(app)/buscador/acciones#busquedaGlobal", [q]);
  const s = await sesion();
  if (!s?.perfil) return VACIA;
  q = (q ?? '').trim().slice(0, 120);
  if (q.length < 2) return VACIA;
  const sb = s.supabase;
  const gestor = esGestor(s.perfil.rol);
  const [ids, cli, tra] = await Promise.all([
    sb.rpc('buscar_envios', { p_q: q, p_limite: 6 }),
    gestor ? sb.rpc('buscar_clientes', { p_q: q, p_limite: 4 }) : Promise.resolve({ data: null }),
    gestor ? sb.rpc('buscar_transportistas', { p_q: q, p_limite: 4 }) : Promise.resolve({ data: null }),
  ]);
  const idList = ((ids.data ?? []) as string[]).slice(0, 6);
  let envios: BusquedaGlobal['envios'] = [];
  if (idList.length) {
    const { data } = await sb.from('envios').select('id, referencia_gx, poblacion_origen, poblacion_destino, estado').in('id', idList);
    const por = new Map((data ?? []).map((e) => [e.id, e]));
    envios = idList.flatMap((id) => {
      const e = por.get(id);
      return e ? [{ id: e.id, ref: e.referencia_gx ?? '', ruta: [e.poblacion_origen, e.poblacion_destino].filter(Boolean).join(' → '), estado: e.estado }] : [];
    });
  }
  type Fila = { id: string; nombre: string; cif: string };
  return {
    envios,
    clientes: ((cli.data ?? []) as Fila[]).map((c) => ({ id: c.id, nombre: c.nombre, cif: c.cif })),
    transportistas: ((tra.data ?? []) as Fila[]).map((t) => ({ id: t.id, nombre: t.nombre, cif: t.cif })),
  };
}
