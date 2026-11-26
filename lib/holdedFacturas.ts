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
  estado: 'pendiente' | 'parcial' | 'pagada' | 'anulada' | 'otro'; pagada_el: string | null; cuenta: string | null;
  tipo: 'factura' | 'abono'; rectifica: string | null;
  // El concepto (recortado) y las referencias de envío (GX…) que lleva, en él o en sus líneas:
  // con ellas se sabe qué envíos están ya facturados (para el crédito usado de cada cliente).
  concepto: string | null; envios_gx: string[];
  // El pedido de venta del que salió la factura (lo dice su ficha, `from`) y, cuando se ha leído
  // ese pedido, las referencias de envío que lleva (`null` = aún no se ha leído). Con el enlace,
  // un pedido que ya tiene factura no se cuenta además como «sin facturar».
  pedido_origen: string | null; pedido_gx?: string[] | null };

/** Las referencias de envío (GX y de 4 a 12 cifras) que hay en unos textos, sin repetir (hasta 50). */
export function gxDeTextos(...textos: unknown[]): string[] {
  const vistas: string[] = [];
  for (const t of textos) {
    if (typeof t !== 'string') continue;
    for (const m of t.matchAll(/(?<![A-Za-z0-9])GX[\s-]?(\d{4,12})(?!\d)/gi)) {
      const g = `GX${m[1]}`;
      if (!vistas.includes(g) && vistas.length < 50) vistas.push(g);
    }
  }
  return vistas;
}

// LOS ABONOS (facturas rectificativas; en la facturación, «credit notes») tienen la misma forma
// que una factura. En la copia van con `tipo` = abono y TODOS sus importes EN NEGATIVO, vengan
// como vengan (no se sabe si la facturación los manda en positivo o ya en negativo): así un
// abono con saldo pendiente resta de lo que debe el cliente. `rectifica`: la factura que
// corrige, si su ficha lo dice (`from`, solo en «Get a credit note»).
export function copiaDeHolded(f: FacturaHolded & { draft?: unknown; payments_detail?: unknown; from?: unknown }, tipo: 'factura' | 'abono' = 'factura'): FacturaCopia | null {
  const id = texto(f.id), emision = dia(f.date);
  if (!id || !emision) return null;
  const st = typeof f.status === 'string' ? f.status : '';
  const estado: FacturaCopia['estado'] = f.draft === true || st === 'cancelled' ? 'anulada'
    : st === 'pending' ? 'pendiente' : st === 'partial' ? 'parcial' : st === 'completed' ? 'pagada' : 'otro';
  const neg = (n: number) => (tipo === 'abono' && n !== 0 ? -Math.abs(n) : n);
  const base = neg(baseDeHolded(f)), iva = neg(c2(num(f.tax))), total = neg(c2(num(f.total)));
  const dif = c2(Math.abs(base + iva) - Math.abs(total));
  const viene = f.payments_pending !== undefined && f.payments_pending !== null && f.payments_pending !== '';
  const pendiente = estado === 'anulada' ? 0 : viene ? neg(c2(num(f.payments_pending))) : estado === 'pendiente' ? total : 0;
  // El día en que quedó pagada: el de su último cobro, si la respuesta trae los cobros.
  let pagada_el: string | null = null;
  if (estado === 'pagada' && Array.isArray(f.payments_detail)) {
    for (const p of f.payments_detail as { date?: unknown }[]) { const d = p && typeof p === 'object' ? dia(p.date) : null; if (d && (!pagada_el || d > pagada_el)) pagada_el = d; }
  }
  // La factura que corrige un abono: el documento del que salió, si es una factura.
  let rectifica: string | null = null;
  if (tipo === 'abono' && f.from && typeof f.from === 'object') {
    const o = f.from as { id?: unknown; doc_type?: unknown };
    const rid = texto(o.id)?.toLowerCase() ?? null;
    if (rid && /^[0-9a-f]{24}$/.test(rid) && (o.doc_type == null || /invoice/i.test(String(o.doc_type)))) rectifica = rid;
  }
  // El pedido de venta del que salió una factura (en la ficha: `from` con doc_type «salesorder»).
  let pedido_origen: string | null = null;
  if (tipo === 'factura' && f.from && typeof f.from === 'object') {
    const o = f.from as { id?: unknown; doc_type?: unknown };
    const pid = texto(o.id)?.toLowerCase() ?? null;
    if (pid && /^[0-9a-f]{24}$/.test(pid) && /sales[\s_-]?order/i.test(String(o.doc_type ?? ''))) pedido_origen = pid;
  }
  return { id, numero: texto(f.document_number), contacto_id: texto(f.contact_id)?.toLowerCase() ?? null, contacto_nombre: texto(f.contact_name),
    emision, vence: dia(f.due_date), base, iva, retencion: dif > 0.005 ? dif : 0, total, pendiente, estado, pagada_el, cuenta: cuentaDeLineas(f.lines),
    tipo, rectifica, pedido_origen, concepto: texto(f.description)?.slice(0, 600) ?? null,
    envios_gx: gxDeTextos(f.description, ...(Array.isArray(f.lines) ? (f.lines as { name?: unknown; description?: unknown }[]).flatMap((l) => (l && typeof l === 'object' ? [l.name, l.description] : [])) : [])) };
}

/** Una página de «List invoices» (o de «List credit notes», con tipo abono) pasada a filas de la copia: las filas, si hay más y por dónde seguir. */
export function copiasDeHolded(cuerpo: unknown, tipo: 'factura' | 'abono' = 'factura'): { facturas: FacturaCopia[]; hayMas: boolean; cursor: string | null; leidas: number } {
  const c = (cuerpo && typeof cuerpo === 'object' ? cuerpo : {}) as { items?: unknown; has_more?: unknown; cursor?: unknown };
  const items = Array.isArray(c.items) ? c.items as FacturaHolded[] : [];
  const cursor = typeof c.cursor === 'string' && c.cursor ? c.cursor : null;
  return { facturas: items.map((f) => copiaDeHolded(f ?? {}, tipo)).filter((f): f is FacturaCopia => !!f), hayMas: c.has_more === true && !!cursor, cursor, leidas: items.length };
}

// ---- Pedidos de venta sin facturar («List sales orders») ----------------------------------
// Para el crédito usado: los viajes que están en la facturación como pedido de venta aún sin
// facturar. Misma forma que una factura (número, contacto, fecha, total, concepto, líneas).
// Las referencias GX se buscan también en el NÚMERO del pedido: los que salen de la plataforma
// llevan su GX como número. Así un viaje que está en los dos sitios no se cuenta dos veces.
export type PedidoVenta = { id: string; numero: string | null; contacto_id: string | null; contacto_nombre: string | null;
  fecha: string; total: number; estado: 'pendiente' | 'parcial'; envios_gx: string[] };

export function pedidosDeHolded(cuerpo: unknown): { pedidos: PedidoVenta[]; hayMas: boolean; cursor: string | null; leidos: number } {
  const c = (cuerpo && typeof cuerpo === 'object' ? cuerpo : {}) as { items?: unknown; has_more?: unknown; cursor?: unknown };
  const items = Array.isArray(c.items) ? c.items as (FacturaHolded & { draft?: unknown })[] : [];
  const cursor = typeof c.cursor === 'string' && c.cursor ? c.cursor : null;
  const pedidos: PedidoVenta[] = [];
  for (const o of items) {
    if (!o || typeof o !== 'object' || o.draft === true) continue;
    const id = texto(o.id), fecha = dia(o.date);
    // Solo los que aún no están facturados del todo: pendiente o facturado en parte.
    if (!id || !fecha || (o.status !== 'pending' && o.status !== 'partial')) continue;
    const lineas = Array.isArray(o.lines) ? (o.lines as { name?: unknown; description?: unknown }[]).flatMap((l) => (l && typeof l === 'object' ? [l.name, l.description] : [])) : [];
    pedidos.push({ id, numero: texto(o.document_number), contacto_id: texto(o.contact_id)?.toLowerCase() ?? null, contacto_nombre: texto(o.contact_name),
      fecha, total: Math.abs(c2(num(o.total))), estado: o.status === 'partial' ? 'parcial' : 'pendiente',
      envios_gx: gxDeTextos(o.document_number, o.description, ...lineas) });
  }
  return { pedidos, hayMas: c.has_more === true && !!cursor, cursor, leidos: items.length };
}

/** Las referencias de envío (GX…) que lleva la FICHA de un pedido de venta: en su número, su concepto o sus líneas. */
export function gxDePedido(cuerpo: unknown): string[] {
  if (!cuerpo || typeof cuerpo !== 'object') return [];
  const o = cuerpo as { document_number?: unknown; description?: unknown; lines?: unknown };
  const lineas = Array.isArray(o.lines) ? (o.lines as { name?: unknown; description?: unknown }[]).flatMap((l) => (l && typeof l === 'object' ? [l.name, l.description] : [])) : [];
  return gxDeTextos(o.document_number, o.description, ...lineas);
}

// ---- El plan de cuentas («List chart of accounts») ----------------------------------------
// La línea de la factura trae el IDENTIFICADOR interno de su cuenta contable, no su número ni
// su nombre (usuario, 2026-11-26: «¿podemos poner mejor el nombre, y no el código?»).
export function cuentasDeHolded(cuerpo: unknown): { cuenta_id: string; numero: string | null; nombre: string | null }[] {
  const c = (cuerpo && typeof cuerpo === 'object' ? cuerpo : {}) as { items?: unknown };
  const items = Array.isArray(c.items) ? c.items as { id?: unknown; number?: unknown; name?: unknown }[] : [];
  const salida: { cuenta_id: string; numero: string | null; nombre: string | null }[] = [];
  for (const a of items) {
    const id = a && typeof a === 'object' ? texto(a.id)?.toLowerCase() : null;
    if (!id || !/^[0-9a-f]{24}$/.test(id) || salida.some((x) => x.cuenta_id === id)) continue;
    const numero = typeof a.number === 'number' && Number.isFinite(a.number) ? String(a.number) : texto(a.number);
    salida.push({ cuenta_id: id, numero: numero?.slice(0, 20) ?? null, nombre: texto(a.name)?.slice(0, 200) ?? null });
  }
  return salida;
}
/** Los identificadores de cuenta que hay en el texto guardado de una factura («id · id»). */
export function idsDeCuentas(cuenta: string | null | undefined): string[] {
  return (cuenta ?? '').split(' · ').map((x) => x.replace(' …', '').trim()).filter((x) => /^[0-9a-f]{24}$/.test(x));
}

// ---- El gasto de consultas del mes («Get API usage by type») ------------------------------
export function usoDeHolded(cuerpo: unknown): { periodo: string; usadas: number; limite: number | null } | null {
  const c = (cuerpo && typeof cuerpo === 'object' ? cuerpo : {}) as { period?: unknown; usage?: unknown; limit?: unknown };
  const usadas = importeDe(c.usage), limite = importeDe(c.limit);
  if (usadas == null || usadas < 0) return null;
  return { periodo: typeof c.period === 'string' && /^\d{4}-\d{2}$/.test(c.period) ? c.period : '', usadas: Math.round(usadas), limite: limite != null && limite > 0 ? Math.round(limite) : null };
}

/** El CIF de un contacto de la facturación: su `code` y, si no lo tiene, su número de IVA. */
export function cifDeContacto(contacto: unknown): { cif: string | null; nombre: string | null } {
  const c = (contacto && typeof contacto === 'object' ? contacto : {}) as { code?: unknown; vat_number?: unknown; name?: unknown };
  return { cif: texto(c.code) ?? texto(c.vat_number), nombre: texto(c.name) };
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
