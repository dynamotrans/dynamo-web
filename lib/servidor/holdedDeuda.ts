import 'server-only';
import { supabaseServicio } from '@/lib/supabase/servicio';
import { holdedListo, leerHolded } from '@/lib/servidor/holded';
import { cifDeContacto, pendientesDeHolded, type FacturaPendiente } from '@/lib/holdedFacturas';

// LO QUE DEBE CADA CLIENTE (usuario, 2026-11-24/25: «traer el estado de pagos de las emitidas
// para saber cuánto deben»; «lo mejor es consulta en tiempo real, para evitar errores de
// sincronización»). Se le pide a la facturación TODAS las facturas emitidas con algo pendiente
// de cobro (una a tres consultas) y se guarda esa foto entera, sustituyendo la anterior.
// Nunca se guarda una lectura a medias: si una página falla, la foto anterior se queda.
// SOLO LECTURA de la facturación: aquí solo se escribe en nuestra base de datos.
const PAGINAS_MAX = 25;          // 25 × 200 = 5.000 facturas pendientes: de sobra
const CONTACTOS_POR_VEZ = 40;    // consultas de CIF por lectura (el resto, en la siguiente)
const CONTACTO_VALE_DIAS = 7;    // cada cuánto se vuelve a mirar el CIF de un contacto

export type LecturaDeuda =
  | { ok: true; facturas: number; sinCliente: number; sinCif: number; pendiente: number }
  | { ok: false; conectado: boolean; error: string };

export async function refrescarDeuda(): Promise<LecturaDeuda> {
  const sv = supabaseServicio();
  if (!holdedListo() || !sv) return { ok: false, conectado: false, error: 'La facturación no está conectada en este entorno.' };
  const fallo = async (error: string): Promise<LecturaDeuda> => {
    await sv.rpc('deuda_lectura_fallida', { p_error: error });
    return { ok: false, conectado: true, error };
  };

  // 1. Todas las facturas emitidas, aprobadas, con algo pendiente de cobro.
  const facturas: FacturaPendiente[] = [];
  let cursor: string | undefined;
  for (let i = 0; ; i++) {
    if (i >= PAGINAS_MAX) return fallo('Hay demasiadas facturas pendientes para leerlas de una vez.');
    const r = await leerHolded('/invoices', { status: 'outstanding', approval_status: 'approved', limit: 200, cursor });
    if (!r.ok) return fallo(r.error);
    const p = pendientesDeHolded(r.datos);
    facturas.push(...p.facturas);
    if (!p.hayMas || !p.cursor) break;
    cursor = p.cursor;
  }

  // 2. De qué cliente es cada una: el CIF de su contacto (guardado de otras veces o preguntado ahora).
  const ids = [...new Set(facturas.map((f) => f.contacto_id).filter((x): x is string => !!x && /^[0-9a-f]{24}$/i.test(x)))];
  const cifs = new Map<string, string | null>();
  const frescos = new Set<string>();
  const limite = Date.now() - CONTACTO_VALE_DIAS * 86_400_000;
  for (let i = 0; i < ids.length; i += 300) {
    const { data } = await sv.from('holded_contactos').select('contacto_id, cif, visto_en').in('contacto_id', ids.slice(i, i + 300));
    for (const c of data ?? []) { cifs.set(c.contacto_id, c.cif); if (Date.parse(c.visto_en) > limite) frescos.add(c.contacto_id); }
  }
  // Primero los que no se conocen; después, los que toca volver a mirar.
  const porMirar = [...ids.filter((x) => !cifs.has(x)), ...ids.filter((x) => cifs.has(x) && !frescos.has(x))].slice(0, CONTACTOS_POR_VEZ);
  const vistos: { contacto_id: string; cif: string | null; nombre: string | null; visto_en: string }[] = [];
  for (let i = 0; i < porMirar.length; i += 4) {
    await Promise.all(porMirar.slice(i, i + 4).map(async (id) => {
      const r = await leerHolded(`/contacts/${id}`);
      if (!r.ok) return;                                    // se queda como estaba; se reintenta en la lectura siguiente
      const c = cifDeContacto(r.datos);
      cifs.set(id, c.cif);
      vistos.push({ contacto_id: id.toLowerCase(), cif: c.cif?.slice(0, 40) ?? null, nombre: c.nombre?.slice(0, 200) ?? null, visto_en: new Date().toISOString() });
    }));
  }
  if (vistos.length) {
    const { error } = await sv.from('holded_contactos').upsert(vistos, { onConflict: 'contacto_id' });
    if (error) console.error('[Holded] guardar contactos', error.message);
  }

  // 3. La foto entera, de una vez.
  const foto = facturas.map((f) => ({ ...f, contacto_id: f.contacto_id?.toLowerCase() ?? null, cif: (f.contacto_id && cifs.get(f.contacto_id)) || null }));
  const { data, error } = await sv.rpc('deuda_guardar_foto', { p_facturas: foto });
  if (error) return fallo(`No se ha podido guardar la lectura: ${error.message}`);
  const d = (data ?? {}) as { facturas?: number; sin_cliente?: number; sin_cif?: number; pendiente?: number };
  return { ok: true, facturas: Number(d.facturas ?? 0), sinCliente: Number(d.sin_cliente ?? 0), sinCif: Number(d.sin_cif ?? 0), pendiente: Number(d.pendiente ?? 0) };
}
