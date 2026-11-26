import { test } from 'node:test';
import assert from 'node:assert/strict';
import { baseDeHolded, cifDeContacto, cobrosDeHolded, copiaDeHolded, copiasDeHolded, cuentaDeLineas, cuentasDeHolded, gxDePedido, gxDeTextos, idsDeCuentas, importeDe, pedidosDeHolded, pedidosFacturadosDeHolded, usoDeHolded } from '../../lib/holdedFacturas';
import { diaMas, finDeMes, mesesAtras } from '../../lib/facturasCopiaFechas';

const base = { id: '507f1f77bcf86cd799439011', document_number: 'F260123', contact_id: 'ABCDEFABCDEFABCDEFABCDEF', contact_name: 'Acme SL', description: 'Porte GX1',
  date: '2026-11-01', due_date: '2026-12-01', subtotal: '100.00', discount: '0', tax: '21.00', total: '121.00', status: 'pending', payments_pending: '121.00' };

test('copia de facturas: los importes en texto pasan a números y el contacto, a minúsculas', () => {
  assert.deepEqual(copiaDeHolded({ ...base, lines: [{ account: '70500000', price: 100, units: 1 }] }), {
    id: base.id, numero: 'F260123', contacto_id: 'abcdefabcdefabcdefabcdef', contacto_nombre: 'Acme SL', emision: '2026-11-01', vence: '2026-12-01',
    base: 100, iva: 21, retencion: 0, total: 121, pendiente: 121, estado: 'pendiente', pagada_el: null, cuenta: '70500000', tipo: 'factura', rectifica: null, pedido_origen: null,
    concepto: 'Porte GX1', envios_gx: [] });
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

test('qué envíos lleva cada factura: las referencias GX del concepto y de las líneas', () => {
  // Tal como llega el concepto de verdad: «GX66921 - Transporte de mercancías - …».
  assert.deepEqual(gxDeTextos('GX66921 - Transporte de mercancías - 16-noviembre-2026 - Tautliner'), ['GX66921']);
  assert.deepEqual(gxDeTextos('Envíos gx100888878 y GX-100888871; GX 100888864. Ref. cliente: PED-GX12', null, 7, 'GX100888878'), ['GX100888878', 'GX100888871', 'GX100888864']);
  // No vale un GX pegado a otra palabra, ni con pocas cifras, ni un número más largo cortado.
  assert.deepEqual(gxDeTextos('XGX12345 · GX123 · BOGX99999 · GX1234567890123'), []);
  const f = copiaDeHolded({ id: 'a'.repeat(24), date: '2026-11-20', total: '121,00', status: 'pending', description: '  GX100888878 - Transporte  ',
    lines: [{ name: 'Porte GX100888871', description: 'y también GX100888878' }, { name: 'Suplido' }] });
  assert.deepEqual([f?.concepto, f?.envios_gx], ['GX100888878 - Transporte', ['GX100888878', 'GX100888871']]);
  assert.deepEqual([copiaDeHolded({ id: 'a'.repeat(24), date: '2026-11-20' })?.concepto, copiaDeHolded({ id: 'a'.repeat(24), date: '2026-11-20' })?.envios_gx], [null, []]);
  assert.equal(copiaDeHolded({ id: 'a'.repeat(24), date: '2026-11-20', description: 'x'.repeat(900) })?.concepto?.length, 600);
});

test('pedidos de venta sin facturar: solo los pendientes o facturados en parte, con sus referencias GX', () => {
  const o = (n: number, mas: Record<string, unknown>) => ({ id: String(n).padStart(24, '0'), document_number: `PV-${n}`, contact_id: 'A'.repeat(24), contact_name: 'Cliente SL',
    date: '2026-11-20', total: '363,00', status: 'pending', description: 'Transporte', lines: [{ name: 'Porte' }], ...mas });
  const r = pedidosDeHolded({ has_more: true, cursor: 'x', items: [
    o(1, {}),                                                          // pendiente, sin GX: de fuera de la plataforma
    o(2, { document_number: 'GX100888878' }),                          // su número ES el GX de la plataforma
    o(3, { status: 'partial', description: 'gx100888871 - Transporte', lines: [{ name: 'Porte', description: 'GX100888864' }] }),
    o(4, { status: 'completed' }), o(5, { status: 'cancelled' }),      // ya facturado o anulado: no entran
    o(6, { draft: true }), o(7, { date: null }), null,
    o(8, { total: '-1.210,50' }),
  ] });
  assert.deepEqual(r.pedidos.map((p) => [p.numero, p.estado, p.total, p.envios_gx]), [
    ['PV-1', 'pendiente', 363, []], ['GX100888878', 'pendiente', 363, ['GX100888878']],
    ['PV-3', 'parcial', 363, ['GX100888871', 'GX100888864']], ['PV-8', 'pendiente', 1210.5, []]]);
  assert.deepEqual([r.hayMas, r.cursor, r.leidos, r.pedidos[0].contacto_id, r.pedidos[0].fecha], [true, 'x', 9, 'a'.repeat(24), '2026-11-20']);
  assert.deepEqual(pedidosDeHolded(null), { pedidos: [], hayMas: false, cursor: null, leidos: 0 });
});

test('abonos: misma forma que una factura, pero en negativo, vengan como vengan', () => {
  // Tal como llegan las facturas de verdad: importes de texto con coma decimal.
  const abono = { id: 'a'.repeat(24), document_number: 'R26-0003', contact_id: 'B'.repeat(24), contact_name: 'Cliente SL', date: '2026-11-20', due_date: '2026-11-20',
    subtotal: '100,00', discount: '0,00', tax: '21,00', total: '121,00', status: 'pending', payments_total: '0,00', payments_pending: '121,00',
    lines: [{ price: '100,00', units: '1,00', account: '6011715a12dc4a4bb044de36' }] };
  const c = copiaDeHolded(abono, 'abono');
  assert.deepEqual([c?.tipo, c?.base, c?.iva, c?.total, c?.pendiente, c?.retencion, c?.estado], ['abono', -100, -21, -121, -121, 0, 'pendiente']);
  // Si la facturación ya los manda en negativo, no se les da la vuelta.
  const yaNeg = copiaDeHolded({ ...abono, subtotal: '-100,00', tax: '-21,00', total: '-121,00', payments_pending: '-121,00' }, 'abono');
  assert.deepEqual([yaNeg?.base, yaNeg?.iva, yaNeg?.total, yaNeg?.pendiente], [-100, -21, -121, -121]);
  // Devuelto o compensado del todo: no queda saldo. Devuelto en parte: queda el resto, en negativo.
  assert.deepEqual([copiaDeHolded({ ...abono, status: 'completed', payments_pending: '0,00' }, 'abono')?.pendiente, copiaDeHolded({ ...abono, status: 'completed', payments_pending: '0,00' }, 'abono')?.estado], [0, 'pagada']);
  assert.equal(copiaDeHolded({ ...abono, status: 'partial', payments_pending: '21,00' }, 'abono')?.pendiente, -21);
  assert.equal(copiaDeHolded({ ...abono, draft: true }, 'abono')?.pendiente, 0);
  // Con retención: base + IVA − total, en positivo.
  assert.equal(copiaDeHolded({ ...abono, total: '106,00', payments_pending: '106,00' }, 'abono')?.retencion, 15);
  // La misma lectura como factura queda en positivo y sin «rectifica».
  const f = copiaDeHolded({ ...abono, from: { id: 'c'.repeat(24), doc_type: 'invoice' } });
  assert.deepEqual([f?.tipo, f?.total, f?.pendiente, f?.rectifica], ['factura', 121, 121, null]);
});

test('abonos: la factura que corrigen, solo si la ficha lo dice y es una factura', () => {
  const abono = { id: 'a'.repeat(24), date: '2026-11-20', total: '121,00', status: 'pending' };
  assert.equal(copiaDeHolded({ ...abono, from: { id: 'C'.repeat(24), doc_type: 'invoice' } }, 'abono')?.rectifica, 'c'.repeat(24));
  assert.equal(copiaDeHolded({ ...abono, from: { id: 'c'.repeat(24) } }, 'abono')?.rectifica, 'c'.repeat(24));
  assert.equal(copiaDeHolded({ ...abono, from: { id: 'c'.repeat(24), doc_type: 'salesorder' } }, 'abono')?.rectifica, null);
  assert.equal(copiaDeHolded({ ...abono, from: { id: 'no-vale', doc_type: 'invoice' } }, 'abono')?.rectifica, null);
  assert.equal(copiaDeHolded({ ...abono, from: null }, 'abono')?.rectifica, null);
  assert.equal(copiaDeHolded(abono, 'abono')?.rectifica, null);
  const p = copiasDeHolded({ items: [abono, { ...abono, id: 'd'.repeat(24) }], has_more: false }, 'abono');
  assert.deepEqual(p.facturas.map((x) => [x.tipo, x.total]), [['abono', -121], ['abono', -121]]);
  assert.deepEqual(copiasDeHolded({ items: [abono] }).facturas.map((x) => x.tipo), ['factura']);
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

test('plan de cuentas: de cada cuenta, su identificador, número y nombre; lo raro se salta', () => {
  const r = cuentasDeHolded({ items: [
    { id: '6011715A12DC4A4BB044DE36', number: 70500000, name: ' Prestaciones de servicios ', balance: '1500,00' },
    { id: '6011715a12dc4a4bb044de36', number: 1, name: 'Repetida' }, { id: 'corta', number: 2, name: 'Mal id' },
    { id: 'a'.repeat(24), number: '43000000', name: null }, null ] });
  assert.deepEqual(r, [{ cuenta_id: '6011715a12dc4a4bb044de36', numero: '70500000', nombre: 'Prestaciones de servicios' },
    { cuenta_id: 'a'.repeat(24), numero: '43000000', nombre: null }]);
  assert.deepEqual(cuentasDeHolded(null), []);
  assert.deepEqual(idsDeCuentas(`6011715a12dc4a4bb044de36 · ${'b'.repeat(24)} …`), ['6011715a12dc4a4bb044de36', 'b'.repeat(24)]);
  assert.deepEqual(idsDeCuentas('70500000'), []);
  assert.deepEqual(idsDeCuentas(null), []);
});

test('gasto de consultas del mes: lo que dice la facturación (usadas, tope y mes)', () => {
  assert.deepEqual(usoDeHolded({ type: 'automation_token', period: '2026-11', usage: 8565, limit: 30000, count: 1 }), { periodo: '2026-11', usadas: 8565, limite: 30000 });
  assert.deepEqual(usoDeHolded({ period: 'noviembre', usage: '120', limit: 0 }), { periodo: '', usadas: 120, limite: null });
  assert.equal(usoDeHolded({ period: '2026-11' }), null);
  assert.equal(usoDeHolded({ usage: -1 }), null);
  assert.equal(usoDeHolded(null), null);
});

test('de qué pedido de venta sale una factura: solo de su ficha, solo pedidos de venta y nunca en un abono', () => {
  const base = { id: 'f'.repeat(24), date: '2026-11-20', total: '121,00', status: 'pending' };
  const ped = 'AB12'.repeat(6);
  assert.equal(copiaDeHolded({ ...base, from: { id: ped, doc_type: 'salesorder' } })?.pedido_origen, ped.toLowerCase());
  assert.equal(copiaDeHolded({ ...base, from: { id: ped, doc_type: 'sales_order' } })?.pedido_origen, ped.toLowerCase());
  assert.equal(copiaDeHolded({ ...base })?.pedido_origen, null);                                                    // la lista no lo trae
  assert.equal(copiaDeHolded({ ...base, from: { id: ped, doc_type: 'estimate' } })?.pedido_origen, null);           // sale de un presupuesto
  assert.equal(copiaDeHolded({ ...base, from: { id: 'no-es-un-id', doc_type: 'salesorder' } })?.pedido_origen, null);
  assert.equal(copiaDeHolded({ ...base, from: { id: ped, doc_type: 'salesorder' } }, 'abono')?.pedido_origen, null);
  assert.equal(copiaDeHolded({ ...base })?.pedido_gx, undefined);                                                   // el pedido se lee aparte
});

test('referencias GX de la ficha de un pedido de venta: número, concepto y líneas', () => {
  assert.deepEqual(gxDePedido({ document_number: 'GX100200', description: 'Viaje gx-300400', lines: [{ name: 'Porte GX 500600' }, { description: 'GX100200' }, null] }),
    ['GX100200', 'GX300400', 'GX500600']);
  assert.deepEqual(gxDePedido({ document_number: 'PV-2026-014', description: 'Transporte' }), []);
  assert.deepEqual(gxDePedido(null), []);
});

test('pedidos de venta ya facturados: solo los completados que llevan algún GX', () => {
  const r = pedidosFacturadosDeHolded({ has_more: false, cursor: null, items: [
    { id: 'a'.repeat(24), document_number: 'GX100200', date: '2026-11-20', status: 'completed' },
    { id: 'b'.repeat(24), document_number: 'PV-9', description: 'Viajes GX300400 y GX-500600', date: '2026-11-19', status: 'completed' },
    { id: 'c'.repeat(24), document_number: 'PV-10', date: '2026-11-19', status: 'completed' },                    // sin GX: no sirve para cruzar
    { id: 'd'.repeat(24), document_number: 'GX700800', date: '2026-11-19', status: 'pending' },                   // sin facturar: va en la otra foto
    { id: 'e'.repeat(24), document_number: 'GX900100', date: '2026-11-19', status: 'completed', draft: true },     // borrador
    { id: 'f'.repeat(24), document_number: 'GX900200', status: 'completed' },                                      // sin fecha
    null ] });
  assert.deepEqual(r.pedidos, [
    { id: 'a'.repeat(24), fecha: '2026-11-20', envios_gx: ['GX100200'] },
    { id: 'b'.repeat(24), fecha: '2026-11-19', envios_gx: ['GX300400', 'GX500600'] } ]);
  assert.deepEqual([r.hayMas, r.leidos], [false, 7]);
  assert.deepEqual(pedidosFacturadosDeHolded(undefined), { pedidos: [], hayMas: false, cursor: null, leidos: 0 });
});
