import { leerTodo } from './leerTodo';
// Notas internas de Dynamo (tabla notas_internas, solo las lee Dynamo). En las fichas la
// columna «anotaciones» va siempre vacía: aquí se leen y se vuelven a poner en cada fila,
// para que las pantallas de Dynamo las enseñen y las editen como siempre. Al guardar la
// ficha con su campo de notas, la base de datos las mueve sola a notas_internas.
type Sb = { from: (t: string) => any };
export type Notas = Map<string, { anotaciones?: string; anotaciones_incidencias?: string }>;

export async function notasInternas(supabase: Sb, tabla: 'usuarios' | 'clientes' | 'transportistas' | 'vehiculos' | 'conductores' | 'almacenamientos'): Promise<Notas> {
  const { data } = await leerTodo(supabase.from('notas_internas').select('registro_id, campo, texto').eq('tabla', tabla), 50000);
  const m: Notas = new Map();
  ((data ?? []) as { registro_id: string; campo: 'anotaciones' | 'anotaciones_incidencias'; texto: string }[]).forEach((n) => {
    m.set(n.registro_id, { ...(m.get(n.registro_id) ?? {}), [n.campo]: n.texto });
  });
  return m;
}
