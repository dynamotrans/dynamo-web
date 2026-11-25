'use server';

import { sesion, esDynamo } from '@/lib/sesion';
import { comprobarEntrada } from '@/lib/entradas/comprobar';
import { holdedListo, leerHolded } from '@/lib/servidor/holded';
import { cobrosDeHolded, facturasDeHolded, formaDeCobro, formaDeHolded, ultimoCobro } from '@/lib/holdedFacturas';
import { contactosDeHolded } from '@/lib/servidor/holdedContactos';
import { supabaseServicio } from '@/lib/supabase/servicio';
import type { FacturaFila } from '@/components/panel/FacturasDynamo';

// Administración → Facturas (vista de Dynamo): las facturas EMITIDAS, leídas del programa de
// facturación en el momento. SOLO LECTURA (regla del usuario, 2026-11-24): aquí no se crea ni
// se cambia nada allí. Primer paso de la conexión: las 200 últimas ya aprobadas (una consulta).
// Las recibidas, la copia en nuestra base de datos y la vista del cliente van después.
export type FacturasEmitidas =
  | { ok: true; facturas: FacturaFila[]; hayMas: boolean }
  | { ok: false; conectado: boolean; error: string };

export async function facturasEmitidas(): Promise<FacturasEmitidas> {
  comprobarEntrada("app/panel/(app)/administracion/acciones#facturasEmitidas", []);
  const s = await sesion();
  if (!s?.perfil || s.perfil.estado !== 'activa' || !esDynamo(s.perfil.rol)) return { ok: false, conectado: false, error: 'Solo el equipo de Dynamo.' };
  if (!holdedListo()) return { ok: false, conectado: false, error: 'La facturación no está conectada en este entorno.' };
  const r = await leerHolded('/invoices', { limit: 200, sort: '-date', approval_status: 'approved' });
  if (!r.ok) return { ok: false, conectado: true, error: r.error };
  // Afinando con datos reales: se apunta QUÉ campos llegan y cómo vienen los importes de una factura.
  console.log('[Holded] forma de la factura', JSON.stringify(formaDeHolded(r.datos)));
  const hoy = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' });
  const { facturas, hayMas } = facturasDeHolded(r.datos, hoy);
  // Dos cosas que la lista no trae y se piden aparte, a la vez (usuario, 2026-11-25):
  //  · el CIF de cada empresa (el de su contacto; se pregunta una vez y se recuerda);
  //  · cuándo se cobró cada factura pagada, para ver cuánto tarda en pagar cada cliente.
  const sv = supabaseServicio();
  const pagadas = facturas.filter((f) => f.estado === 'pagada');
  const [contactos, cobros] = await Promise.all([
    sv ? contactosDeHolded(sv, facturas.map((f) => f.contacto_id), 40) : Promise.resolve(new Map<string, { cif: string | null; nombre: string | null }>()),
    pagadas.length ? cobrosDesde(pagadas.reduce((m, f) => (f.fecha < m ? f.fecha : m), hoy)) : Promise.resolve(new Map<string, string>()),
  ]);
  // Cada fila abre su PDF por nuestra propia ruta (que también es solo para Dynamo).
  return { ok: true, hayMas, facturas: facturas.map((f) => ({ ...f, pdf_url: `/api/facturas/${f.id}/pdf`,
    cif: (f.contacto_id && contactos.get(f.contacto_id)?.cif) || null,
    pagada_el: f.estado === 'pagada' ? cobros.get(f.id) ?? null : null })) };
}

// Los cobros de facturas desde una fecha: de cada factura, el día de su último cobro. Si la
// facturación no contesta, se sigue sin esas fechas (la factura sale «Pagada» a secas).
async function cobrosDesde(desde: string): Promise<Map<string, string>> {
  const todos: { documento: string; fecha: string }[] = [];
  let cursor: string | undefined;
  for (let i = 0; i < 6; i++) {
    const r = await leerHolded('/payments', { type: 'collection', document_type: 'invoice', start_date: desde, limit: 200, cursor });
    if (!r.ok) { console.error('[Holded] cobros', r.error); break; }
    if (i === 0) console.log('[Holded] forma del cobro', JSON.stringify(formaDeCobro(r.datos)));
    const p = cobrosDeHolded(r.datos);
    todos.push(...p.cobros);
    if (!p.hayMas || !p.cursor) break;
    cursor = p.cursor;
  }
  return ultimoCobro(todos);
}
