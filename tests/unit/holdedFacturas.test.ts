import { test } from 'node:test';
import assert from 'node:assert/strict';
import { baseDeHolded, cifDeContacto, cobrosDeHolded, copiaDeHolded, copiasDeHolded, cuentaDeLineas, formaDeEnlaces, importeDe } from '../../lib/holdedFacturas';
import { diaMas, finDeMes, mesesAtras } from '../../lib/facturasCopiaFechas';

const base = { id: '507f1f77bcf86cd799439011', document_number: 'F260123', contact_id: 'ABCDEFABCDEFABCDEFABCDEF', contact_name: 'Acme SL', description: 'Porte GX1',
  date: '2026-11-01', due_date: '2026-12-01', subtotal: '100.00', discount: '0', tax: '21.00', total: '121.00', status: 'pending', payments_pending: '121.00' };

test('copia de facturas: los importes en texto pasan a números y el contacto, a minúsculas', () => {
  assert.deepEqual(copiaDeHolded({ ...base, lines: [{ account: '70500000', price: 100, units: 1 }] }), {
    id: base.id, numero: 'F260123', contacto_id: 'abcdefabcdefabcdefabcdef', contacto_nombre: 'Acme SL', emision: '2026-11-01', vence: '2026-12-01',
    base: 100, iva: 21, retencion: 0, total: 121, pendiente: 121, estado: 'pendiente', pagada_el: null, cuenta: '70500000' });
});

// Fallo real (2026-11-26): la facturación manda los importes CON COMA («240,00») y todas las
// facturas salían a 0,00 €. Esta es la factura tal como llega de verdad.
test('copia de facturas: los importes llegan CON COMA DECIMAL y se leen bien', () => {
  const real = { ...base, subtotal: '240,00', discount: '0,00', tax: '50,40', total: '290,40', payments_total: '0,00', payments_pending: '290,40',
    lines: [{ price: '240,00', units: '1,00', discount: '0,00', tax: '0', retention: '0,00', account: '6011715a12dc4a4bb044de36' }] };
  const f = copiaDeHolded(real)!;
  assert.deepEqual([f.base, f.iva, f.total, f.pendiente, f.retencion, f.estado], [240, 50.4, 290.4, 290.4, 0, 'pendiente']);
  // Si el subtotal no viniera, la base sale de la línea (precio × unidades, también con coma).
  assert.equal(copiaDeHolded({ ...real, subtotal: '0,00' })!.base, 240);
  assert.equal(baseDeHolded({ subtotal: '0,00', total: '1.210,00', tax: '210,00', lines: [{ price: '500,00', units: '2,00', discount: '0,00' }] }), 1000);
  // Cobrada en parte, con miles: debe lo que diga el importe pendiente.
  assert.equal(copiaDeHolded({ ...real, total: '12.100,00', status: 'partial', payments_pending: '6.050,50' })!.pendiente, 6050.5);
});

test('importes de la facturación: coma o punto decimal, con o sin miles, y lo que no es un número', () => {
  const casos: [unknown, number | null][] = [['240,00', 240], ['290,40', 290.4], ['1,00', 1], ['0', 0], ['0,00', 0], ['121.00', 121], ['1.210,50', 1210.5],
    ['1,210.50', 1210.5], ['12.345.678,90', 12345678.9], ['1.234.567', 1234567], ['1,234,567', 1234567], ['-50,25', -50.25], [' 1 210,00 € ', 1210], [121, 121], [12.5, 12.5],
    ['', null], ['abc', null], [null, null], [undefined, null], [{}, null], ['12a', null], [',', null], [NaN, null]];
  for (const [entra, sale] of casos) assert.equal(importeDe(entra), sale, `importeDe(${JSON.stringify(entra)})`);
});

test('copia de facturas: estados (pendiente, parcial, pagada, anulada, otro) y vuelta a borrador', () => {
  assert.equal(copiaDeHolded({ ...base, status: 'partial', payments_pending: '50.25' })!.estado, 'parcial');
  assert.equal(copiaDeHolded({ ...base, status: 'completed', payments_pending: '0' })!.estado, 'pagada');
  assert.equal(copiaDeHolded({ ...base, status: 'cancelled' })!.estado, 'anulada');
  assert.equal(copiaDeHolded({ ...base, status: 'failed' })!.estado, 'otro');
  // Una factura devuelta a borrador ya no es una factura emitida: anulada, y no debe nada.
  assert.deepEqual([copiaDeHolded({ ...base, draft: true })!.estado, copiaDeHolded({ ...base, draft: true })!.pendiente], ['anulada', 0]);
  assert.equal(copiaDeHolded({ ...base, status: 'cancelled', payments_pending: '121.00' })!.pendiente, 0);
});

test('copia de facturas: MANDA EL IMPORTE PENDIENTE que dice la facturación, no el estado', () => {
  // Estaba pagada y se corrigió el cobro: sigue llamándose «completed», pero debe 500.
  assert.equal(copiaDeHolded({ ...base, total: '1000.00', status: 'completed', payments_pending: '500.00' })!.pendiente, 500);
  assert.equal(copiaDeHolded({ ...base, status: 'partial', payments_pending: '50.25' })!.pendiente, 50.25);
  // Si el importe pendiente no viene: todo si no hay nada cobrado, nada si está pagada o a medias sin dato.
  assert.equal(copiaDeHolded({ ...base, payments_pending: undefined })!.pendiente, 121);
  assert.equal(copiaDeHolded({ ...base, status: 'completed', payments_pending: undefined })!.pendiente, 0);
  assert.equal(copiaDeHolded({ ...base, payments_pending: '' })!.pendiente, 121);
});

test('copia de facturas: el día en que quedó pagada es el de su último cobro (si la ficha trae los cobros)', () => {
  const pagos = [{ amount: '50.00', date: '2026-11-03' }, { amount: '71.00', date: '2026-11-20T10:00:00' }, { date: 'ayer' }, null];
  assert.equal(copiaDeHolded({ ...base, status: 'completed', payments_pending: '0', payments_detail: pagos })!.pagada_el, '2026-11-20');
  assert.equal(copiaDeHolded({ ...base, status: 'completed', payments_pending: '0' })!.pagada_el, null);
  // Cobrada solo en parte: aún no hay día de pago.
  assert.equal(copiaDeHolded({ ...base, status: 'partial', payments_pending: '71.00', payments_detail: pagos })!.pagada_el, null);
});

test('copia de facturas: la retención sale de la diferencia; el descuento baja la base', () => {
  assert.equal(copiaDeHolded({ ...base, subtotal: '1000.00', tax: '210.00', total: '1060.00' })!.retencion, 150);   // 15 % de retención
  const g = copiaDeHolded({ ...base, subtotal: '100.00', discount: '10.00', tax: '18.90', total: '108.90' })!;
  assert.deepEqual([g.base, g.retencion], [90, 0]);
});

test('copia de facturas: lo que no tiene forma de factura se salta; sin cursor no se sigue aunque diga que hay más', () => {
  assert.equal(copiaDeHolded({ ...base, id: null }), null);
  assert.equal(copiaDeHolded({ ...base, date: 'ayer' }), null);
  assert.deepEqual(copiasDeHolded(null), { facturas: [], hayMas: false, cursor: null, leidas: 0 });
  assert.deepEqual(copiasDeHolded({ items: 'x' }), { facturas: [], hayMas: false, cursor: null, leidas: 0 });
  const r = copiasDeHolded({ items: [base, null, { id: 'x' }], has_more: true, cursor: 'sig' });
  assert.deepEqual([r.facturas.length, r.leidas, r.hayMas, r.cursor], [1, 3, true, 'sig']);
  assert.equal(copiasDeHolded({ items: [base], has_more: true, cursor: null }).hayMas, false);
});

test('el CIF del contacto es su código y, si falta, su número de IVA', () => {
  assert.deepEqual(cifDeContacto({ code: ' B12345678 ', vat_number: 'ESB12345678', name: 'Acme' }), { cif: 'B12345678', nombre: 'Acme' });
  assert.deepEqual(cifDeContacto({ code: '', vat_number: 'ESB12345678' }), { cif: 'ESB12345678', nombre: null });
  assert.deepEqual(cifDeContacto(null), { cif: null, nombre: null });
});

test('si el subtotal no viene (o viene a 0), la base sale de las líneas o del total menos el IVA', () => {
  assert.equal(baseDeHolded({ subtotal: '100.00', discount: '10.00', total: '108.90', tax: '18.90' }), 90);
  const lineas = [{ price: '50.00', units: '2', discount: '0' }, { price: '100', units: 1, discount: 10 }];
  assert.equal(baseDeHolded({ subtotal: '0', total: '229.90', tax: '39.90', lines: lineas }), 190);
  assert.equal(baseDeHolded({ total: '121.00', tax: '21.00', lines: [] }), 100);
  assert.equal(baseDeHolded({ total: '121.00', tax: '21.00' }), 100);
  assert.equal(baseDeHolded({}), 0);
  assert.equal(copiaDeHolded({ ...base, subtotal: '0', lines: [{ price: 100, units: 1 }] })!.base, 100);
});

test('cobros: de cada cobro, su factura y su día; lo que no es de una factura no cuenta', () => {
  const p = cobrosDeHolded({ items: [
    { document_id: 'f1', document_type: 'invoice', date: '2026-11-03T10:00:00+00:00', amount: '50.00' },
    { document_id: 'f1', document_type: 'invoice', date: '2026-11-20', amount: '71.00' },
    { document_id: 'f2', document_type: 'invoice', date: '2026-10-01' },
    { document_id: 'c9', document_type: 'purchase', date: '2026-11-21' },
    { document_id: null, document_type: 'invoice', date: '2026-11-21' }, null,
  ], has_more: true, cursor: 'x' });
  assert.deepEqual(p.cobros, [{ documento: 'f1', fecha: '2026-11-03' }, { documento: 'f1', fecha: '2026-11-20' }, { documento: 'f2', fecha: '2026-10-01' }]);
  assert.deepEqual([p.hayMas, p.cursor], [true, 'x']);
});

test('cuenta contable: la de las líneas, sin repetir', () => {
  assert.equal(cuentaDeLineas([{ account: '70500000' }, { account: 70500000 }, { account: ' 70000001 ' }, { account: null }]), '70500000 · 70000001');
  assert.equal(cuentaDeLineas([{ price: 1 }]), null);
  assert.equal(cuentaDeLineas('x'), null);
});

test('enlaces entre documentos: solo el estado y el tipo de lo enlazado, sin números ni nombres', () => {
  const pedido = { id: 'a'.repeat(24), document_number: 'PV-1', contact_name: 'Cliente SL', status: 'completed', lines: [{}, {}],
    from: { id: 'b'.repeat(24), doc_type: 'estimate' }, to: [{ id: 'c'.repeat(24), doc_type: 'invoice' }, { id: 'd'.repeat(24), doc_type: 'waybill' }] };
  const r = formaDeEnlaces(pedido);
  assert.deepEqual(r, { estado: 'completed', de: 'estimate', a: ['invoice', 'waybill'], lineas: 2, claves_enlace: ['from', 'to'] });
  assert.ok(!JSON.stringify(r).includes('Cliente SL') && !JSON.stringify(r).includes('PV-1'));
  assert.deepEqual(formaDeEnlaces({ status: 'pending', from: null }), { estado: 'pending', de: null, a: '(no viene)', lineas: null, claves_enlace: ['from'] });
  assert.deepEqual(formaDeEnlaces(null), { estado: '(no viene)', de: '(no viene)', a: '(no viene)', lineas: null, claves_enlace: [] });
});

test('fechas de la copia: 12 meses atrás, fin de mes y sumar días, sin sustos con febrero ni con el cambio de hora', () => {
  assert.equal(mesesAtras('2026-11-25', 12), '2025-11-25');
  assert.equal(mesesAtras('2028-02-29', 12), '2027-02-28');     // el año anterior no tiene 29 de febrero
  assert.equal(mesesAtras('2026-03-31', 1), '2026-02-28');
  assert.equal(mesesAtras('2026-01-15', 2), '2025-11-15');
  assert.equal(finDeMes('2026-02-10'), '2026-02-28');
  assert.equal(finDeMes('2028-02-10'), '2028-02-29');
  assert.equal(finDeMes('2026-12-31'), '2026-12-31');
  assert.equal(diaMas('2026-12-31', 1), '2027-01-01');
  assert.equal(diaMas('2026-10-25', 1), '2026-10-26');           // el cambio de hora no se come un día
  assert.equal(diaMas('2026-11-25', -45), '2026-10-11');
});
