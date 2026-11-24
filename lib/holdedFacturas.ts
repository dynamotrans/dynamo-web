// Lo que llega del programa de facturación (Holded, API v2, «List invoices») pasado a la fila
// que pinta Administración → Facturas. Sin red y sin claves: solo cuentas, para poder probarlo.
// Campos según su documentación (2026-11): importes como texto decimal («121.00»), fechas
// AAAA-MM-DD, `status`: pending · partial · completed · cancelled · failed.
import type { FacturaFila } from '@/components/panel/FacturasDynamo';

export type FacturaHolded = {
  id?: unknown; document_number?: unknown; contact_name?: unknown; description?: unknown;
  date?: unknown; due_date?: unknown; subtotal?: unknown; discount?: unknown; total?: unknown; tax?: unknown;
  status?: unknown; payments_pending?: unknown;
};

const num = (v: unknown): number => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const texto = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
const dia = (v: unknown): string | null => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null);
const c2 = (n: number) => Math.round(n * 100) / 100;

/** `hoy` en AAAA-MM-DD: una factura sin cobrar del todo cuyo vencimiento ya pasó está «vencida». */
export function facturaDeHolded(f: FacturaHolded, hoy: string): FacturaFila | null {
  const id = texto(f.id), fecha = dia(f.date);
  if (!id || !fecha) return null;
  const base = c2(num(f.subtotal) - num(f.discount)), iva = c2(num(f.tax)), total = c2(num(f.total));
  // Lo retenido (IRPF) no viene aparte: es lo que falta entre base + IVA y el total.
  const dif = c2(base + iva - total);
  const vence = dia(f.due_date);
  const st = typeof f.status === 'string' ? f.status : '';
  const estado: FacturaFila['estado'] = st === 'completed' ? 'pagada'
    : st === 'pending' || st === 'partial' ? (vence && vence < hoy ? 'vencida' : 'pendiente') : null;
  return { id, tipo: 'emitida', fecha, numero: texto(f.document_number), concepto: texto(f.description), empresa: texto(f.contact_name),
    cif: null, base, iva, retencion: dif > 0.005 ? dif : 0, total, estado, vence };
}

/** Lee la respuesta entera (`items`, `has_more`). Lo que no tenga forma de factura se salta. */
export function facturasDeHolded(cuerpo: unknown, hoy: string): { facturas: FacturaFila[]; hayMas: boolean } {
  const c = (cuerpo && typeof cuerpo === 'object' ? cuerpo : {}) as { items?: unknown; has_more?: unknown };
  const items = Array.isArray(c.items) ? c.items as FacturaHolded[] : [];
  return { facturas: items.map((f) => facturaDeHolded(f ?? {}, hoy)).filter((f): f is FacturaFila => !!f), hayMas: c.has_more === true };
}
