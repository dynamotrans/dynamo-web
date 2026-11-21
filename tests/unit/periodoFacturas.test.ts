// Filtro de periodos de Administración → Facturas (Dynamo).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rangoPeriodo } from '../../lib/periodoFacturas';

const hoy = new Date(2026, 10, 21); // 21-nov-2026

test('mes, mes pasado y última semana', () => {
  assert.deepEqual(rangoPeriodo('mes', hoy), ['2026-11-01', '2026-11-30']);
  assert.deepEqual(rangoPeriodo('mes-ant', hoy), ['2026-10-01', '2026-10-31']);
  assert.deepEqual(rangoPeriodo('semana', hoy), ['2026-11-15', '2026-11-21']);
});

test('trimestres y años (también cruzando el cambio de año)', () => {
  assert.deepEqual(rangoPeriodo('trim', hoy), ['2026-10-01', '2026-12-31']);
  assert.deepEqual(rangoPeriodo('trim-ant', hoy), ['2026-07-01', '2026-09-30']);
  assert.deepEqual(rangoPeriodo('trim-ant', new Date(2026, 1, 10)), ['2025-10-01', '2025-12-31']);
  assert.deepEqual(rangoPeriodo('mes-ant', new Date(2026, 0, 5)), ['2025-12-01', '2025-12-31']);
  assert.deepEqual(rangoPeriodo('anio-ant', hoy), ['2025-01-01', '2025-12-31']);
});

test('todas las fechas y entre dos fechas', () => {
  assert.deepEqual(rangoPeriodo('todo', hoy), [null, null]);
  assert.deepEqual(rangoPeriodo('otro', hoy, '2026-03-01', ''), ['2026-03-01', null]);
});
