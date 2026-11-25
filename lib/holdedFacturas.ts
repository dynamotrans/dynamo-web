// Lo que llega del programa de facturación (Holded, API v2, «List invoices») pasado a la fila
// que pinta Administración → Facturas. Sin red y sin claves: solo cuentas, para poder probarlo.
// Campos según su documentación (2026-11): importes como texto decimal («121.00»), fechas
// AAAA-MM-DD, `status`: pending · partial · completed · cancelled · failed.
import type { FacturaFila } from '@/components/panel/FacturasDynamo';

export type FacturaHolded = {
  id?: unknown; document_number?: unknown; contact_name?: unknown; description?: unknown;
  date?: unknown; due_date?: unknown; subtotal?: unknown; discount?: unknown; total?: unknown; tax?: unknown;
  status?: unknown; payments_pending?: unknown; lines?: unknown;
};

const num = (v: unknown): number => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const texto = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
const dia = (v: unknown): string | null => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null);
const c2 = (n: number) => Math.round(n * 100) / 100;

// LA BASE (sin IVA). Con datos reales (2026-11-25) el `subtotal` de la lista llegaba a 0 y la
// pantalla sumaba «Ingresos (base): 0,00 €». Por eso se saca de donde se pueda, por este orden:
//  1. subtotal − descuento, si el subtotal viene;
//  2. la suma de las líneas (precio × unidades, menos su descuento en %);
//  3. total − IVA (lo que queda si no hay retención).
function baseDeLineas(lines: unknown): number | null {
  if (!Array.isArray(lines) || !lines.length) return null;
  let suma = 0, alguna = false;
  for (const l of lines as { price?: unknown; units?: unknown; discount?: unknown }[]) {
    if (!l || typeof l !== 'object') continue;
    const precio = Number(l.price), unidades = l.units == null || l.units === '' ? 1 : Number(l.units);
    if (!Number.isFinite(precio) || !Number.isFinite(unidades)) continue;
    const dto = Math.min(100, Math.max(0, num(l.discount)));
    suma += precio * unidades * (1 - dto / 100); alguna = true;
  }
  return alguna ? c2(suma) : null;
}
export function baseDeHolded(f: FacturaHolded): number {
  const sub = num(f.subtotal);
  if (sub !== 0) return c2(sub - num(f.discount));
  const lineas = baseDeLineas(f.lines);
  if (lineas != null && lineas !== 0) return lineas;
  return c2(num(f.total) - num(f.tax));
}

/** El envío al que corresponde la factura, si su concepto lo dice («GX66921 - Transporte…»). */
export function gxDeTexto(...textos: unknown[]): string | null {
  for (const t of textos) { const m = typeof t === 'string' ? /\bGX\d{3,12}\b/i.exec(t) : null; if (m) return m[0].toUpperCase(); }
  return null;
}

/** `hoy` en AAAA-MM-DD: una factura sin cobrar del todo cuyo vencimiento ya pasó está «vencida». */
export function facturaDeHolded(f: FacturaHolded, hoy: string): FacturaFila | null {
  const id = texto(f.id), fecha = dia(f.date);
  if (!id || !fecha) return null;
  const base = baseDeHolded(f), iva = c2(num(f.tax)), total = c2(num(f.total));
  // Lo retenido (IRPF) no viene aparte: es lo que falta entre base + IVA y el total.
  const dif = c2(base + iva - total);
  const vence = dia(f.due_date);
  const st = typeof f.status === 'string' ? f.status : '';
  const estado: FacturaFila['estado'] = st === 'completed' ? 'pagada'
    : st === 'pending' || st === 'partial' ? (vence && vence < hoy ? 'vencida' : 'pendiente') : null;
  return { id, tipo: 'emitida', fecha, numero: texto(f.document_number), concepto: texto(f.description), empresa: texto(f.contact_name),
    cif: null, base, iva, retencion: dif > 0.005 ? dif : 0, total, estado, vence, gx: gxDeTexto(f.description) };
}

/** Lee la respuesta entera (`items`, `has_more`). Lo que no tenga forma de factura se salta. */
export function facturasDeHolded(cuerpo: unknown, hoy: string): { facturas: FacturaFila[]; hayMas: boolean } {
  const c = (cuerpo && typeof cuerpo === 'object' ? cuerpo : {}) as { items?: unknown; has_more?: unknown };
  const items = Array.isArray(c.items) ? c.items as FacturaHolded[] : [];
  return { facturas: items.map((f) => facturaDeHolded(f ?? {}, hoy)).filter((f): f is FacturaFila => !!f), hayMas: c.has_more === true };
}

// ---- Facturas con algo pendiente de cobro (la «foto» de lo que debe cada cliente) ---------
// Una fila de «List invoices» con status=outstanding, lista para guardarla en la foto.
// El CIF no viene en la factura: lo pone después el servidor, mirando el contacto.
export type FacturaPendiente = { id: string; numero: string | null; contacto_id: string | null; contacto_nombre: string | null;
  cif: string | null; emision: string | null; vence: string | null; total: number; pendiente: number };

export function pendienteDeHolded(f: FacturaHolded & { contact_id?: unknown }): FacturaPendiente | null {
  const id = texto(f.id);
  const pendiente = c2(num(f.payments_pending));
  if (!id || !(pendiente > 0)) return null;                 // sin identificador o sin nada que cobrar: no es deuda
  const st = typeof f.status === 'string' ? f.status : '';
  if (st === 'cancelled' || st === 'failed' || st === 'completed') return null;   // por si se cuela alguna que no debe nada
  return { id, numero: texto(f.document_number), contacto_id: texto(f.contact_id), contacto_nombre: texto(f.contact_name), cif: null,
    emision: dia(f.date), vence: dia(f.due_date), total: c2(num(f.total)), pendiente };
}

/** Lee una página de la lista: las facturas con deuda, si hay más páginas y por dónde seguir. */
export function pendientesDeHolded(cuerpo: unknown): { facturas: FacturaPendiente[]; hayMas: boolean; cursor: string | null } {
  const c = (cuerpo && typeof cuerpo === 'object' ? cuerpo : {}) as { items?: unknown; has_more?: unknown; cursor?: unknown };
  const items = Array.isArray(c.items) ? c.items as FacturaHolded[] : [];
  const cursor = typeof c.cursor === 'string' && c.cursor ? c.cursor : null;
  return { facturas: items.map((f) => pendienteDeHolded(f ?? {})).filter((f): f is FacturaPendiente => !!f), hayMas: c.has_more === true && !!cursor, cursor };
}

/** El CIF de un contacto de la facturación: su `code` y, si no lo tiene, su número de IVA. */
export function cifDeContacto(contacto: unknown): { cif: string | null; nombre: string | null } {
  const c = (contacto && typeof contacto === 'object' ? contacto : {}) as { code?: unknown; vat_number?: unknown; name?: unknown };
  return { cif: texto(c.code) ?? texto(c.vat_number), nombre: texto(c.name) };
}

// Solo para afinar la lectura con datos reales: QUÉ campos trae una factura y cómo vienen sus
// importes (sin nombres, conceptos ni contactos). Va al registro del servidor, no a la pantalla.
export function formaDeHolded(cuerpo: unknown): Record<string, unknown> {
  const c = (cuerpo && typeof cuerpo === 'object' ? cuerpo : {}) as { items?: unknown };
  const f = (Array.isArray(c.items) ? c.items[0] : null) as Record<string, unknown> | null;
  if (!f || typeof f !== 'object') return { claves_respuesta: Object.keys(c as object), items: Array.isArray(c.items) ? c.items.length : typeof c.items };
  const linea = Array.isArray(f.lines) && f.lines[0] && typeof f.lines[0] === 'object' ? f.lines[0] as Record<string, unknown> : null;
  const de = (o: Record<string, unknown>, ks: string[]) => Object.fromEntries(ks.map((k) => [k, o[k] === undefined ? '(no viene)' : o[k]]));
  return { claves: Object.keys(f), importes: de(f, ['subtotal', 'discount', 'tax', 'total', 'payments_total', 'payments_pending', 'currency', 'status', 'date', 'due_date']),
    lineas: Array.isArray(f.lines) ? f.lines.length : typeof f.lines, claves_linea: linea ? Object.keys(linea) : null,
    linea: linea ? de(linea, ['price', 'units', 'discount', 'tax', 'retention', 'account']) : null };
}
