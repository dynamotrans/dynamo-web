import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/tipos';
import { leerHolded } from '@/lib/servidor/holded';
import { cifDeContacto } from '@/lib/holdedFacturas';

// EL CIF DE CADA CONTACTO DE LA FACTURACIÓN. La factura trae el contacto pero no su CIF: se
// pregunta una vez por contacto y se recuerda (tabla holded_contactos), para no gastar una
// consulta por factura cada vez. Se vuelve a mirar cada pocos días por si lo han corregido.
// SOLO LECTURA de la facturación.
const CONTACTO_VALE_DIAS = 7;

export type ContactoHolded = { cif: string | null; nombre: string | null };

/** Devuelve lo que se sabe de cada contacto. Pregunta como mucho `porVez` contactos nuevos o
    caducados; los que no dé tiempo quedan para la lectura siguiente (no salen en el resultado). */
export async function contactosDeHolded(sv: SupabaseClient<Database>, idsCrudos: (string | null | undefined)[], porVez = 40): Promise<Map<string, ContactoHolded>> {
  const ids = [...new Set(idsCrudos.filter((x): x is string => !!x && /^[0-9a-f]{24}$/i.test(x)).map((x) => x.toLowerCase()))];
  const sabido = new Map<string, ContactoHolded>();
  const frescos = new Set<string>();
  const limite = Date.now() - CONTACTO_VALE_DIAS * 86_400_000;
  for (let i = 0; i < ids.length; i += 300) {
    const { data } = await sv.from('holded_contactos').select('contacto_id, cif, nombre, visto_en').in('contacto_id', ids.slice(i, i + 300));
    for (const c of data ?? []) { sabido.set(c.contacto_id, { cif: c.cif, nombre: c.nombre }); if (Date.parse(c.visto_en) > limite) frescos.add(c.contacto_id); }
  }
  // Primero los que no se conocen; después, los que toca volver a mirar.
  const porMirar = [...ids.filter((x) => !sabido.has(x)), ...ids.filter((x) => sabido.has(x) && !frescos.has(x))].slice(0, Math.max(0, porVez));
  const vistos: { contacto_id: string; cif: string | null; nombre: string | null; visto_en: string }[] = [];
  for (let i = 0; i < porMirar.length; i += 4) {
    await Promise.all(porMirar.slice(i, i + 4).map(async (id) => {
      const r = await leerHolded(`/contacts/${id}`);
      if (!r.ok) return;                                    // se queda como estaba; se reintenta en la lectura siguiente
      const c = cifDeContacto(r.datos);
      const fila = { cif: c.cif?.slice(0, 40) ?? null, nombre: c.nombre?.slice(0, 200) ?? null };
      sabido.set(id, fila);
      vistos.push({ contacto_id: id, ...fila, visto_en: new Date().toISOString() });
    }));
  }
  if (vistos.length) {
    const { error } = await sv.from('holded_contactos').upsert(vistos, { onConflict: 'contacto_id' });
    if (error) console.error('[Holded] guardar contactos', error.message);
  }
  return sabido;
}
