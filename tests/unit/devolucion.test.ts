import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cuentasDevolucion, importeEscrito, totalDesdeBase } from '../../lib/devolucion';

test('devolución total: todo vuelve al cliente y Dynamo no se queda nada', () => {
  const c = cuentasDevolucion(1210, 1210, 21);
  assert.deepEqual(c, { devuelto: 1210, baseDevuelta: 1000, ivaDevuelto: 210, retenido: 0, baseRetenida: 0, ivaRetenido: 0 });
});

test('devolución parcial: bases e IVA de lo devuelto y de lo que se queda', () => {
  const c = cuentasDevolucion(1210, 847, 21);
  assert.deepEqual(c, { devuelto: 847, baseDevuelta: 700, ivaDevuelto: 147, retenido: 363, baseRetenida: 300, ivaRetenido: 63 });
});

test('las cuentas cuadran al céntimo con importes feos', () => {
  const c = cuentasDevolucion(1355.2, 999.99, 21);
  assert.equal(Math.round((c.devuelto + c.retenido) * 100), 135520);
  assert.equal(Math.round((c.baseDevuelta + c.ivaDevuelto) * 100), 99999);
  assert.equal(Math.round((c.baseRetenida + c.ivaRetenido) * 100), 35521);
});

test('nunca se devuelve más de lo disponible ni menos de cero', () => {
  assert.equal(cuentasDevolucion(100, 500, 21).devuelto, 100);
  assert.equal(cuentasDevolucion(100, -5, 21).devuelto, 0);
  assert.equal(cuentasDevolucion(100, -5, 21).retenido, 100);
});

test('sin IVA (0 %) la base es el total', () => {
  const c = cuentasDevolucion(500, 200, 0);
  assert.equal(c.baseDevuelta, 200); assert.equal(c.ivaDevuelto, 0); assert.equal(c.baseRetenida, 300);
});

test('importe escrito a mano: a la española, con punto decimal y con miles', () => {
  assert.equal(importeEscrito('1.000,50'), 1000.5);
  assert.equal(importeEscrito('1000.5'), 1000.5);
  assert.equal(importeEscrito('1.000'), 1000);
  assert.equal(importeEscrito('12.500'), 12500);
  assert.equal(importeEscrito('12.50'), 12.5);
  assert.equal(importeEscrito(' 847 € '), 847);
  assert.equal(importeEscrito('363,00'), 363);
});

test('importe escrito a mano: lo que no vale', () => {
  for (const t of ['', '   ', '0', '-5', 'abc', '12abc', '1,2,3']) assert.equal(importeEscrito(t), null, t);
});

test('la parte se escribe sin IVA: la ventana le suma el IVA del envío', () => {
  assert.equal(totalDesdeBase(500, 21, 1355.2), 605);
  assert.equal(totalDesdeBase(413.22, 21, 1355.2), 500);
  assert.equal(totalDesdeBase(700, 0, 1000), 700);
  // Toda la base es todo el pago; y lo que resulta cuadra con las cuentas de la tabla.
  assert.equal(totalDesdeBase(1120, 21, 1355.2), 1355.2);
  assert.equal(cuentasDevolucion(1355.2, totalDesdeBase(500, 21, 1355.2), 21).baseDevuelta, 500);
});

test('sin IVA: un céntimo de más por el redondeo se queda en lo disponible; más, no vale', () => {
  assert.equal(totalDesdeBase(82.65, 21, 100), 100);       // 100,01 → 100,00
  assert.ok(totalDesdeBase(90, 21, 100) > 100);            // se pasa de verdad: la ventana no lo acepta
});
