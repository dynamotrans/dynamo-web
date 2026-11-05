// Estado que se enseña de cada envío y horario de atención.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estadoVisual, esPendientePago, type EnvioFila } from '../../lib/envios';
import { horarioTelefono, HORARIO_ONLINE } from '../../lib/atencion';

const e = (x: Partial<EnvioFila>) => x as EnvioFila;

test('anulado sin pago frente a cancelado', () => {
  assert.equal(estadoVisual(e({ estado: 'cancelado', estado_pago_previo: 'pendiente' })).label, 'Anulado sin pago');
  assert.equal(estadoVisual(e({ estado: 'cancelado', estado_pago_previo: 'pagado' })).label, 'Cancelado');
});

test('pendiente de pago solo si está programado', () => {
  assert.equal(esPendientePago({ estado: 'programado', estado_pago_previo: 'pendiente' }), true);
  assert.equal(esPendientePago({ estado: 'cancelado', estado_pago_previo: 'pendiente' }), false);
  assert.equal(estadoVisual(e({ estado: 'programado', estado_pago_previo: 'pendiente' })).label, 'Pendiente de pago');
});

test('horarios de atención en formato largo', () => {
  assert.equal(HORARIO_ONLINE, 'Lunes a viernes 8:00–18:00');
  assert.equal(horarioTelefono(new Date(2026, 9, 14, 10)), 'Lunes a jueves 9:00–14:00 y 15:00–17:00 · viernes 9:00–14:00');
  assert.equal(horarioTelefono(new Date(2026, 6, 14, 10)), 'Lunes a viernes 8:30–15:30 (verano)');
});
