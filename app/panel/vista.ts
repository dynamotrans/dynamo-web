'use server';

// Cambiar la vista («Ver como») del equipo de Dynamo. Solo guarda la elección en una
// cookie: no da ningún permiso nuevo (la base de datos sigue mandando).
import { cookies } from 'next/headers';
import { sesion, esDynamo } from '@/lib/sesion';
import { COOKIE_VISTA } from '@/lib/vista';
import { leerTodo } from '@/lib/leerTodo';
import type { OpcionVista } from '@/lib/vistaTipo';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export async function cambiarVista(tipo: 'admin' | 'cliente' | 'transportista', id?: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const s = await sesion();
  if (!s?.perfil || s.perfil.estado !== 'activa' || !esDynamo(s.perfil.rol)) return { ok: false, error: 'Solo el equipo de Dynamo puede cambiar de vista.' };
  const almacen = await cookies();
  if (tipo === 'admin') { almacen.delete({ name: COOKIE_VISTA, path: '/' }); return { ok: true }; }
  if ((tipo !== 'cliente' && tipo !== 'transportista') || !UUID.test(id ?? '')) return { ok: false, error: 'Elige un cliente o un transportista.' };
  const { data } = await s.supabase.from(tipo === 'cliente' ? 'clientes' : 'transportistas').select('id').eq('id', id!).maybeSingle();
  if (!data) return { ok: false, error: 'No se encuentra.' };
  almacen.set(COOKIE_VISTA, `${tipo}:${id}`, { path: '/', httpOnly: true, sameSite: 'lax', secure: true, maxAge: 60 * 60 * 24 * 30 });
  return { ok: true };
}

// Clientes o transportistas para elegir en «Ver como». Se piden al abrir el selector (antes
// viajaban con CADA pantalla del panel de Dynamo, hasta 10.000 de cada).
export async function opcionesVista(tipo: 'cliente' | 'transportista'): Promise<OpcionVista[]> {
  const s = await sesion();
  if (!s?.perfil || s.perfil.estado !== 'activa' || !esDynamo(s.perfil.rol)) return [];
  const { data } = await leerTodo(s.supabase.from(tipo === 'cliente' ? 'clientes' : 'transportistas').select('id, nombre_visible').order('nombre_visible'), 10000);
  return ((data ?? []) as { id: string; nombre_visible: string | null }[]).map((x) => ({ id: x.id, nombre: x.nombre_visible ?? '—' }));
}
