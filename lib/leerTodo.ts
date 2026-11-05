// La API de Supabase devuelve como mucho 1.000 filas por consulta (Settings → API → Max
// rows; si se baja de 1.000, subir también PAG aquí). Para las listas que pueden pasar de
// eso: se lee por tandas de 1.000 hasta el final (o hasta `tope`). La consulta se pasa SIN
// ejecutar (sin await); se le añade un orden por `id` para que las tandas no se pisen.
const PAG = 1000;
export async function leerTodo<T = any>(q: any, tope = 50000, ordenId = true): Promise<{ data: T[]; error: { message: string } | null }> {
  if (ordenId) q = q.order('id');
  const out: T[] = [];
  for (let i = 0; i < tope; i += PAG) {
    const r = await q.range(i, Math.min(i + PAG, tope) - 1);
    if (r.error) return { data: out, error: r.error };
    const d = (r.data ?? []) as T[];
    out.push(...d);
    if (d.length < PAG) break;
  }
  return { data: out, error: null };
}
