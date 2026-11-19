import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tiempoQueda } from '../../lib/cuentaAtras';

const AHORA = Date.parse('2026-11-19T10:00:00Z');
const en = (s: number) => new Date(AHORA + s * 1000).toISOString();

test('tiempoQueda: días, horas, minutos y vencido', () => {
  assert.equal(tiempoQueda(null, AHORA), null);
  assert.equal(tiempoQueda('no es una fecha', AHORA), null);
  assert.equal(tiempoQueda(en(3 * 86_400 + 4 * 3600 + 59), AHORA)?.texto, '3 días 4 h');
  assert.equal(tiempoQueda(en(2 * 86_400), AHORA)?.texto, '2 días');
  assert.equal(tiempoQueda(en(26 * 3600 + 5 * 60), AHORA)?.texto, '26 h 05 min');
  assert.equal(tiempoQueda(en(5 * 3600 + 12 * 60 + 30), AHORA)?.texto, '5 h 12 min');
});

test('tiempoQueda: la última hora cuenta los segundos y es urgente', () => {
  const q = tiempoQueda(en(12 * 60 + 5), AHORA)!;
  assert.equal(q.texto, '12 min 05 s');
  assert.equal(q.urgente, true);
  assert.equal(q.cadaMs, 1000);
  assert.equal(tiempoQueda(en(5 * 3600), AHORA)?.urgente, false);
  assert.equal(tiempoQueda(en(2 * 3600), AHORA)?.urgente, true);
});

test('tiempoQueda: pasado el plazo', () => {
  const q = tiempoQueda(en(-1), AHORA)!;
  assert.equal(q.vencido, true);
  assert.equal(q.texto, 'Plazo vencido');
});
