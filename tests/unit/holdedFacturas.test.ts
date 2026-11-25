import { test } from 'node:test';
import assert from 'node:assert/strict';
import { baseDeHolded, cifDeContacto, cobrosDeHolded, cuentaDeLineas, diasEntre, facturaDeHolded, facturasDeHolded, formaDeCobro, formaDeHolded, gxDeTexto, pendienteDeHolded, pendientesDeHolded, ultimoCobro } from '../../lib/holdedFacturas';

const HOY = '2026-11-24';
const base = { id: '507f1f77bcf86cd799439011', document_number: 'F260123', contact_name: 'Acme SL', description: 'Porte GX1',
  date: '2026-11-01', due_date: '2026-12-01', subtotal: '100.00', discount: '0', tax: '21.00', total: '121.00', status: 'pending', payments_pending: '121.00' };

test('factura de la facturación: importes en texto pasan a números y queda como emitida', () => {
  const f = facturaDeHolded(base, HOY)!;
  assert.deepEqual({ tipo: f.tipo, numero: f.numero, empresa: f.empresa, base: f.base, iva: f.iva, total: f.total, retencion: f.retencion, vence: f.vence },
    { tipo: 'emitida', numero: 'F260123', empresa: 'Acme SL', base: 100, iva: 21, total: 121, retencion: 0, vence: '2026-12-01' });
  assert.equal(f.estado, 'pendiente');
});

test('factura de la facturación: pagada, vencida, cobrada en parte y anulada', () => {
  assert.equal(facturaDeHolded({ ...base, status: 'completed' }, HOY)!.estado, 'pagada');
  assert.equal(facturaDeHolded({ ...base, due_date: '2026-11-23' }, HOY)!.estado, 'vencida');
  assert.equal(facturaDeHolded({ ...base, due_date: '2026-11-24' }, HOY)!.estado, 'pendiente');   // vence hoy: aún no está vencida
  assert.equal(facturaDeHolded({ ...base, status: 'partial', due_date: '2026-10-01' }, HOY)!.estado, 'vencida');
  assert.equal(facturaDeHolded({ ...base, status: 'cancelled' }, HOY)!.estado, null);
  assert.equal(facturaDeHolded({ ...base, due_date: null }, HOY)!.estado, 'pendiente');
});

test('factura de la facturación: la retención sale de la diferencia; el descuento baja la base', () => {
  const f = facturaDeHolded({ ...base, subtotal: '1000.00', tax: '210.00', total: '1060.00' }, HOY)!;   // 15 % de retención
  assert.equal(f.retencion, 150);
  const g = facturaDeHolded({ ...base, subtotal: '100.00', discount: '10.00', tax: '18.90', total: '108.90' }, HOY)!;
  assert.deepEqual([g.base, g.retencion], [90, 0]);
});

test('factura de la facturación: lo que no tiene forma de factura se salta, sin romper', () => {
  assert.equal(facturaDeHolded({ ...base, id: null }, HOY), null);
  assert.equal(facturaDeHolded({ ...base, date: 'ayer' }, HOY), null);
  assert.deepEqual(facturasDeHolded(null, HOY), { facturas: [], hayMas: false });
  assert.deepEqual(facturasDeHolded({ items: 'x' }, HOY), { facturas: [], hayMas: false });
  const r = facturasDeHolded({ items: [base, null, { id: 'x' }], has_more: true, cursor: 'c' }, HOY);
  assert.equal(r.facturas.length, 1);
  assert.equal(r.hayMas, true);
});

test('deuda: una factura con algo pendiente pasa a la foto con lo que falta por cobrar', () => {
  const f = pendienteDeHolded({ ...base, contact_id: 'AAAAAAAAAAAAAAAAAAAAAAAA', status: 'partial', payments_pending: '50.25' })!;
  assert.deepEqual(f, { id: base.id, numero: 'F260123', contacto_id: 'AAAAAAAAAAAAAAAAAAAAAAAA', contacto_nombre: 'Acme SL', cif: null,
    emision: '2026-11-01', vence: '2026-12-01', total: 121, pendiente: 50.25 });
});

test('deuda: lo que no debe nada (cobrada, anulada, pendiente 0) no entra en la foto', () => {
  assert.equal(pendienteDeHolded({ ...base, payments_pending: '0' }), null);
  assert.equal(pendienteDeHolded({ ...base, payments_pending: '-5.00' }), null);
  assert.equal(pendienteDeHolded({ ...base, status: 'completed' }), null);
  assert.equal(pendienteDeHolded({ ...base, status: 'cancelled' }), null);
  assert.equal(pendienteDeHolded({ ...base, id: '' }), null);
});

test('deuda: se lee página a página; sin cursor no se sigue aunque diga que hay más', () => {
  const p = pendientesDeHolded({ items: [base, { ...base, id: 'x2', payments_pending: '0' }], has_more: true, cursor: 'sig' });
  assert.deepEqual([p.facturas.length, p.hayMas, p.cursor], [1, true, 'sig']);
  assert.equal(pendientesDeHolded({ items: [base], has_more: true, cursor: null }).hayMas, false);
  assert.deepEqual(pendientesDeHolded('nada'), { facturas: [], hayMas: false, cursor: null });
});

test('deuda: el CIF del contacto es su código y, si falta, su número de IVA', () => {
  assert.deepEqual(cifDeContacto({ code: ' B12345678 ', vat_number: 'ESB12345678', name: 'Acme' }), { cif: 'B12345678', nombre: 'Acme' });
  assert.deepEqual(cifDeContacto({ code: '', vat_number: 'ESB12345678' }), { cif: 'ESB12345678', nombre: null });
  assert.deepEqual(cifDeContacto(null), { cif: null, nombre: null });
});

test('factura de la facturación: si el subtotal no viene (o viene a 0), la base sale de las líneas o del total menos el IVA', () => {
  assert.equal(baseDeHolded({ subtotal: '100.00', discount: '10.00', total: '108.90', tax: '18.90' }), 90);
  const lineas = [{ price: '50.00', units: '2', discount: '0' }, { price: '100', units: 1, discount: 10 }];
  assert.equal(baseDeHolded({ subtotal: '0', total: '229.90', tax: '39.90', lines: lineas }), 190);
  assert.equal(baseDeHolded({ total: '121.00', tax: '21.00', lines: [] }), 100);
  assert.equal(baseDeHolded({ total: '121.00', tax: '21.00' }), 100);
  assert.equal(baseDeHolded({}), 0);
  assert.equal(facturaDeHolded({ ...base, subtotal: '0', lines: [{ price: 100, units: 1 }] }, HOY)!.base, 100);
});

test('factura de la facturación: el envío (GX) se saca del concepto', () => {
  assert.equal(gxDeTexto('GX66921 - Transporte de mercancías - 16-noviembre-2026'), 'GX66921');
  assert.equal(gxDeTexto(null, 'Porte gx102345585 Sevilla'), 'GX102345585');
  assert.equal(gxDeTexto('Transporte sin referencia', 'BOXGX1'), null);
  assert.equal(facturaDeHolded({ ...base, description: 'GX66781 - Transporte de mercancías' }, HOY)!.gx, 'GX66781');
});

test('forma de la respuesta: dice qué campos vienen y sus importes, sin nombres ni conceptos', () => {
  const f = formaDeHolded({ items: [{ ...base, lines: [{ price: '100', units: '1', name: 'Secreto' }] }] });
  const txt = JSON.stringify(f);
  assert.ok(txt.includes('"subtotal":"100.00"') && txt.includes('claves_linea'));
  assert.ok(!txt.includes('Acme') && !txt.includes('Porte GX1') && !txt.includes('Secreto'));
  assert.deepEqual(formaDeHolded({ data: [] }), { claves_respuesta: ['data'], items: 'undefined' });
});

test('cobros: de cada factura vale la fecha de su ÚLTIMO cobro; lo que no es de una factura no cuenta', () => {
  const p = cobrosDeHolded({ items: [
    { document_id: 'f1', document_type: 'invoice', date: '2026-11-03T10:00:00+00:00', amount: '50.00' },
    { document_id: 'f1', document_type: 'invoice', date: '2026-11-20', amount: '71.00' },
    { document_id: 'f2', document_type: 'invoice', date: '2026-10-01' },
    { document_id: 'c9', document_type: 'purchase', date: '2026-11-21' },
    { document_id: null, document_type: 'invoice', date: '2026-11-21' }, null,
  ], has_more: true, cursor: 'x' });
  assert.equal(p.cobros.length, 3);
  assert.deepEqual([p.hayMas, p.cursor], [true, 'x']);
  const m = ultimoCobro(p.cobros);
  assert.deepEqual([m.get('f1'), m.get('f2'), m.get('c9')], ['2026-11-20', '2026-10-01', undefined]);
  assert.equal(diasEntre('2026-11-01', '2026-11-20'), 19);
  assert.equal(diasEntre('2026-10-25', '2026-10-26'), 1);     // el cambio de hora no descuenta un día
});

test('cuenta contable: la de las líneas, sin repetir; la forma del cobro no enseña nombres', () => {
  assert.equal(cuentaDeLineas([{ account: '70500000' }, { account: 70500000 }, { account: ' 70000001 ' }, { account: null }]), '70500000 · 70000001');
  assert.equal(cuentaDeLineas([{ price: 1 }]), null);
  assert.equal(cuentaDeLineas('x'), null);
  const f = facturaDeHolded({ ...base, contact_id: 'ABCDEFABCDEFABCDEFABCDEF', lines: [{ account: '70500000', price: 100, units: 1 }] }, HOY)!;
  assert.deepEqual([f.cuenta, f.contacto_id, f.pagada_el], ['70500000', 'abcdefabcdefabcdefabcdef', null]);
  const txt = JSON.stringify(formaDeCobro({ items: [{ id: 'p', contact_name: 'Acme SL', description: 'Cobro secreto', amount: '10.00', date: '2026-11-01', document_id: 'f1', document_type: 'invoice' }] }));
  assert.ok(txt.includes('"amount":"10.00"') && txt.includes('"con_documento":true') && !txt.includes('Acme') && !txt.includes('secreto'));
});
