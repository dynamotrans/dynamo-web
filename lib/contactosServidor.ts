import type { SupabaseClient } from '@supabase/supabase-js';
import type { ContactoDatos } from './contactos';

type Dueno = { cliente_id: string } | { transportista_id: string } | { lugar_id: string };
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Comprueba la lista antes de guardar nada (para no dejar la ficha a medias).
export function validarContactos(lista: ContactoDatos[]): string | null {
  for (const [i, c] of lista.entries()) {
    const quien = c.nombre.trim() || `el contacto ${i + 1}`;
    const tel = c.telefono.replace(/[^\d+]/g, '');
    if (!tel && !c.email.trim()) return `Pon un teléfono o un email para ${quien}.`;
    if (tel && tel.replace('+', '').length < 6) return `El teléfono de ${quien} no es válido.`;
    if (c.email.trim() && !EMAIL.test(c.email.trim())) return `El email de ${quien} no es válido.`;
  }
  return null;
}
// Quita las filas vacías del todo (las que se añadieron y no se rellenaron).
export const sinVacios = (l: ContactoDatos[]) => l.filter((c) => c.nombre.trim() || c.telefono.trim() || c.email.trim() || c.cargo.trim());

// Deja en la base de datos exactamente la lista de la ficha: borra los que se quitaron,
// actualiza los que siguen y añade los nuevos. El PRIMERO de cada función es el
// principal (es el que salen en las tablas y el que usan los avisos por defecto).
export async function guardarContactos(sb: SupabaseClient, dueno: Dueno, lista: ContactoDatos[]): Promise<string | null> {
  const [col, valor] = Object.entries(dueno)[0];
  const { data: actuales, error: e0 } = await sb.from('contactos').select('id').eq(col, valor);
  if (e0) return e0.message;
  const quedan = new Set(lista.map((c) => c.id).filter(Boolean));
  const fuera = (actuales ?? []).map((c) => c.id as string).filter((id) => !quedan.has(id));
  if (fuera.length) { const r = await sb.from('contactos').delete().in('id', fuera); if (r.error) return r.error.message; }
  // Primero nadie es principal (el índice único no deja dos a la vez al reordenar).
  if (quedan.size) { const r = await sb.from('contactos').update({ es_principal: false }).in('id', [...quedan]); if (r.error) return r.error.message; }

  const vistos = new Set<string>();
  for (const c of lista) {
    const es_principal = !vistos.has(c.funcion); vistos.add(c.funcion);
    const tel = c.telefono.replace(/[^\d+]/g, '');
    const fila: Record<string, unknown> = { ...dueno, nombre: c.nombre.trim() || null, cargo: c.cargo.trim() || null, funcion: c.funcion,
      telefono: tel || null, email: c.email.trim().toLowerCase() || null, recibe_avisos: c.recibe_avisos, es_principal };
    const r = c.id ? await sb.from('contactos').update(fila).eq('id', c.id) : await sb.from('contactos').insert(fila);
    if (r.error) return r.error.message;
  }
  return null;
}
