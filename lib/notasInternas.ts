import { leerTodo } from './leerTodo';
import type { SB } from './supabase/cliente';
// Notas internas de Dynamo (tabla notas_internas, solo las lee Dynamo). En las fichas la
// columna «anotaciones» va siempre vacía: aquí se leen y se vuelven a poner en cada fila,
// para que las pantallas de Dynamo las enseñen y las editen como siempre. Al guardar la
// ficha con su campo de notas, la base de datos las mueve sola a notas_internas.
// Con `ids`, solo las de esos registros (las listas por páginas): sin él, todas las de la
// tabla (pantallas pequeñas).
export type Notas = Map<string, { anotaciones?: string; anotaciones_incidencias?: string }>;

export async function notasInternas(supabase: SB, tabla: 'usuarios' | 'clientes' | 'transportistas' | 'vehiculos' | 'conductores' | 'almacenamientos', ids?: string[]): Promise<Notas> {
  const m: Notas = new Map();
  if (ids && ids.length === 0) return m;
  const q = supabase.from('notas_internas').select('registro_id, campo, texto').eq('tabla', tabla);
  const { data } = await leerTodo(ids ? q.in('registro_id', ids) : q, 50000);
  ((data ?? []) as { registro_id: string; campo: 'anotaciones' | 'anotaciones_incidencias'; texto: string }[]).forEach((n) => {
    m.set(n.registro_id, { ...(m.get(n.registro_id) ?? {}), [n.campo]: n.texto });
  });
  return m;
}
