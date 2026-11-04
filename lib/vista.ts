// «Ver como» (lado servidor): qué vista ha elegido el usuario de Dynamo y cómo se filtran
// las consultas. OJO: esto solo FILTRA lo que se enseña; los permisos siguen siendo los del
// usuario de Dynamo (lo impone la base de datos con RLS). Un cliente o un transportista no
// tienen vista: para ellos siempre es la suya.
import { cache } from 'react';
import { cookies } from 'next/headers';
import { esDynamo } from './roles';
import { VISTA_ADMIN, type Vista } from './vistaTipo';
import type { supabaseServidor } from './supabase/server';

export const COOKIE_VISTA = 'dyn_vista';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Lee la cookie: «cliente:<uuid>» o «transportista:<uuid>»; cualquier otra cosa = admin. */
export async function vistaCruda(): Promise<{ tipo: 'admin' } | { tipo: 'cliente' | 'transportista'; id: string }> {
  const v = (await cookies()).get(COOKIE_VISTA)?.value ?? '';
  const [tipo, id] = v.split(':');
  if ((tipo === 'cliente' || tipo === 'transportista') && UUID.test(id ?? '')) return { tipo, id };
  return { tipo: 'admin' };
}

type Sb = NonNullable<Awaited<ReturnType<typeof supabaseServidor>>>;
/** La vista del usuario, con el nombre de la empresa elegida (una lectura por petición). */
export const vistaDe = cache(async (supabase: Sb, rol: string | null | undefined): Promise<Vista> => {
  if (!esDynamo(rol)) return VISTA_ADMIN;
  const v = await vistaCruda();
  if (v.tipo === 'admin') return VISTA_ADMIN;
  const { data } = v.tipo === 'cliente'
    ? await supabase.from('clientes').select('nombre_visible').eq('id', v.id).maybeSingle()
    : await supabase.from('transportistas').select('nombre_visible').eq('id', v.id).maybeSingle();
  const nombre = (data as { nombre_visible?: string } | null)?.nombre_visible;
  return nombre ? { tipo: v.tipo, id: v.id, nombre } : VISTA_ADMIN;   // borrada o sin acceso → admin
});

/**
 * Aplica la vista a una consulta: en la vista de un cliente, solo lo suyo; en la de un
 * transportista, solo lo suyo. Las columnas se pueden cambiar (p. ej. «envios.cliente_id»
 * para filtrar por el envío embebido). Si la tabla no tiene columna para esa vista
 * (null), no devuelve nada en esa vista.
 */
export function filtrarVista<Q>(q: Q, v: Vista, col: { cliente?: string | null; transportista?: string | null } = {}): Q {
  if (v.tipo === 'admin') return q;
  const c = v.tipo === 'cliente' ? (col.cliente === undefined ? 'cliente_id' : col.cliente) : (col.transportista === undefined ? 'transportista_id' : col.transportista);
  const qq = q as unknown as { eq: (c: string, v: string) => Q; is: (c: string, v: null) => Q };
  return c ? qq.eq(c, v.id) : qq.eq('id', '00000000-0000-0000-0000-000000000000');
}
