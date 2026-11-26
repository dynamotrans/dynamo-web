// Lo que llega del programa de facturación (Holded, API v2: «List invoices», «Get an invoice»,
// «List payments») pasado a las filas de NUESTRA copia de facturas emitidas. Sin red y sin
// claves: solo cuentas, para poder probarlo.
// Campos según su documentación (2026-11): importes como texto decimal, fechas AAAA-MM-DD,
// `status`: pending · partial · completed · cancelled · failed.
// OJO, IMPORTES CON COMA: la documentación los pinta con punto («121.00»), pero la cuenta real
// de Dynamo los manda CON COMA DECIMAL («240,00», «1,00»; visto el 2026-11-26). Leídos tal cual
// salían todos a 0. `importeDe` entiende las dos formas y los separadores de miles.
export type FacturaHolded = {
  id?: unknown; document_number?: unknown; contact_name?: unknown; description?: unknown;
  date?: unknown; due_date?: unknown; subtotal?: unknown; discount?: unknown; total?: unknown; tax?: unknown;
  status?: unknown; payments_pending?: unknown; lines?: unknown; contact_id?: unknown;
};

/** Un importe de la facturación → número, o null si no es un número. Entiende «240,00»,
    «1.210,50», «1,210.50», «121.00», «1210» y números ya hechos. Con coma Y punto, el decimal
    es el último; solo comas o solo puntos: uno es el decimal, varios son de miles. */
export function importeDe(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string') return null;
  let t = v.replace(/[\s\u00a0€]/g, '');
  if (!t || !/^[+-]?[\d.,]+$/.test(t) || !/\d/.test(t)) return null;
  const coma = t.lastIndexOf(','), punto = t.lastIndexOf('.');
  if (coma >= 0 && punto >= 0) t = coma > punto ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
  else if (coma >= 0) t = t.indexOf(',') === coma ? t.replace(',', '.') : t.replace(/,/g, '');
  else if (punto >= 0 && t.indexOf('.') !== punto) t = t.replace(/\./g, '');
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}
const num = (v: unknown): number => importeDe(v) ?? 0;
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
    const precio = importeDe(l.price), unidades = l.units == null || l.units === '' ? 1 : importeDe(l.units);
    if (precio == null || unidades == null) continue;
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

/** La cuenta contable de la factura: la de sus líneas (si llevan varias, las distintas, hasta tres). */
export function cuentaDeLineas(lines: unknown): string | null {
  if (!Array.isArray(lines)) return null;
  const vistas: string[] = [];
  for (const l of lines as { account?: unknown }[]) {
    const a = l && typeof l === 'object' ? l.account : null;
    const t = typeof a === 'number' ? String(a) : typeof a === 'string' ? a.trim() : '';
    if (t && t.length <= 40 && !vistas.includes(t)) vistas.push(t);
  }
  return vistas.length ? vistas.slice(0, 3).join(' · ') + (vistas.length > 3 ? ' …' : '') : null;
}

// ---- La fila de la COPIA de facturas emitidas (tabla facturas_emitidas) -------------------
// Sirve igual para una fila de «List invoices» que para «Get an invoice» (que además trae sus
// cobros en `payments_detail` y si ha vuelto a borrador en `draft`).
// EL IMPORTE PENDIENTE ES EL QUE DICE LA FACTURACIÓN (`payments_pending`): para la deuda manda
// el importe, no el estado (usuario, 2026-11-25). Si no viene, se deduce: todo si no hay nada
// cobrado, nada si está pagada.
export type FacturaCopia = { id: string; numero: string | null; contacto_id: string | null; contacto_nombre: string | null;
  emision: string; vence: string | null; base: number; iva: number; retencion: number; total: number; pendiente: number;
  estado: 'pendiente' | 'parcial' | 'pagada' | 'anulada' | 'otro'; pagada_el: string | null; cuenta: string | null };

export function copiaDeHolded(f: FacturaHolded & { draft?: unknown; payments_detail?: unknown }): FacturaCopia | null {
  const id = texto(f.id), emision = dia(f.date);
  if (!id || !emision) return null;
  const st = typeof f.status === 'string' ? f.status : '';
  const estado: FacturaCopia['estado'] = f.draft === true || st === 'cancelled' ? 'anulada'
    : st === 'pending' ? 'pendiente' : st === 'partial' ? 'parcial' : st === 'completed' ? 'pagada' : 'otro';
  const base = baseDeHolded(f), iva = c2(num(f.tax)), total = c2(num(f.total));
  const dif = c2(base + iva - total);
  const viene = f.payments_pending !== undefined && f.payments_pending !== null && f.payments_pending !== '';
  const pendiente = estado === 'anulada' ? 0 : viene ? c2(num(f.payments_pending)) : estado === 'pendiente' ? total : 0;
  // El día en que quedó pagada: el de su último cobro, si la respuesta trae los cobros.
  let pagada_el: string | null = null;
  if (estado === 'pagada' && Array.isArray(f.payments_detail)) {
    for (const p of f.payments_detail as { date?: unknown }[]) { const d = p && typeof p === 'object' ? dia(p.date) : null; if (d && (!pagada_el || d > pagada_el)) pagada_el = d; }
  }
  return { id, numero: texto(f.document_number), contacto_id: texto(f.contact_id)?.toLowerCase() ?? null, contacto_nombre: texto(f.contact_name),
    emision, vence: dia(f.due_date), base, iva, retencion: dif > 0.005 ? dif : 0, total, pendiente, estado, pagada_el, cuenta: cuentaDeLineas(f.lines) };
}

/** Una página de «List invoices» pasada a filas de la copia: las filas, si hay más y por dónde seguir. */
export function copiasDeHolded(cuerpo: unknown): { facturas: FacturaCopia[]; hayMas: boolean; cursor: string | null; leidas: number } {
  const c = (cuerpo && typeof cuerpo === 'object' ? cuerpo : {}) as { items?: unknown; has_more?: unknown; cursor?: unknown };
  const items = Array.isArray(c.items) ? c.items as FacturaHolded[] : [];
  const cursor = typeof c.cursor === 'string' && c.cursor ? c.cursor : null;
  return { facturas: items.map((f) => copiaDeHolded(f ?? {})).filter((f): f is FacturaCopia => !!f), hayMas: c.has_more === true && !!cursor, cursor, leidas: items.length };
}

/** El CIF de un contacto de la facturación: su `code` y, si no lo tiene, su número de IVA. */
export function cifDeContacto(contacto: unknown): { cif: string | null; nombre: string | null } {
  const c = (contacto && typeof contacto === 'object' ? contacto : {}) as { code?: unknown; vat_number?: unknown; name?: unknown };
  return { cif: texto(c.code) ?? texto(c.vat_number), nombre: texto(c.name) };
}

// Solo para afinar (pregunta del usuario, 2026-11-25: «¿se puede saber si un pedido está
// facturado y en qué factura va?»). La documentación dice que cada documento trae DE QUÉ
// documento salió (`from`) y los pedidos, QUÉ documentos salieron de ellos (`to`), pero no
// aclara si una factura hecha con varios pedidos los trae todos. De un documento real se
// apunta solo eso: su estado y el TIPO de los documentos enlazados (sin números ni nombres).
export function formaDeEnlaces(doc: unknown): Record<string, unknown> {
  const d = (doc && typeof doc === 'object' ? doc : {}) as Record<string, unknown>;
  const tipo = (o: unknown) => (o && typeof o === 'object' ? String((o as { doc_type?: unknown }).doc_type ?? '(sin tipo)') : typeof o);
  const enlace = (v: unknown) => (v === undefined ? '(no viene)' : v === null ? null : Array.isArray(v) ? v.slice(0, 30).map(tipo) : tipo(v));
  return { estado: d.status ?? '(no viene)', de: enlace(d.from), a: enlace(d.to), lineas: Array.isArray(d.lines) ? d.lines.length : null,
    claves_enlace: Object.keys(d).filter((k) => /^(from|to)$|order|invoice|document|related|source|linked/i.test(k) && k !== 'document_number') };
}

// ---- Cobros: cuándo se pagó cada factura («List payments and collections») ---------------
// De cada cobro interesa a qué documento corresponde y su fecha. Con varios cobros para una
// misma factura (pagos a plazos), la fecha que vale es la del ÚLTIMO (lo decide la base de
// datos al apuntarlos): cuando quedó pagada.
export function cobrosDeHolded(cuerpo: unknown): { cobros: { documento: string; fecha: string }[]; hayMas: boolean; cursor: string | null } {
  const c = (cuerpo && typeof cuerpo === 'object' ? cuerpo : {}) as { items?: unknown; has_more?: unknown; cursor?: unknown };
  const items = Array.isArray(c.items) ? c.items as { document_id?: unknown; document_type?: unknown; date?: unknown }[] : [];
  const cursor = typeof c.cursor === 'string' && c.cursor ? c.cursor : null;
  const cobros: { documento: string; fecha: string }[] = [];
  for (const p of items) {
    const documento = p && typeof p === 'object' ? texto(p.document_id) : null, fecha = p && typeof p === 'object' ? dia(p.date) : null;
    if (documento && fecha && (p.document_type == null || p.document_type === 'invoice')) cobros.push({ documento, fecha });
  }
  return { cobros, hayMas: c.has_more === true && !!cursor, cursor };
}
