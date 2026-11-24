import { test } from 'node:test';
import assert from 'node:assert/strict';
import { caducidadEnlace, TANDA_MS } from '../../lib/stripeCaducidad';

const MIN = 60_000;
const ahora = Date.UTC(2026, 10, 24, 10, 3, 20);            // 10:03:20 → tanda 10:00
const tanda = Date.UTC(2026, 10, 24, 10, 0, 0);

test('enlace de pago: con plazo de sobra caduca al final del plazo más el margen', () => {
  const limite = new Date(ahora + 57 * MIN);                 // 11:00:20
  const r = caducidadEnlace(limite, ahora, 5);
  assert.equal(r.tanda, tanda);
  assert.equal(r.caduca, Math.floor((limite.getTime() + 5 * MIN) / 1000) * 1000);
});

test('enlace de pago: con poco plazo dura lo mínimo que deja la pasarela (más de 30 min)', () => {
  const limite = new Date(ahora + 2 * MIN);
  const r = caducidadEnlace(limite, ahora, 5);
  assert.equal(r.caduca, tanda + 41 * MIN);
  assert.ok(r.caduca! - ahora > 30 * MIN && r.caduca! - ahora <= 41 * MIN);
  // Al final de la tanda sigue por encima de los 30 minutos.
  const tarde = tanda + TANDA_MS - 1;
  assert.ok(caducidadEnlace(new Date(tarde + MIN), tarde, 5).caduca! - tarde > 30 * MIN);
});

test('enlace de pago: dos clics en la misma tanda piden exactamente lo mismo', () => {
  const limite = new Date(ahora + 10 * MIN);
  assert.deepEqual(caducidadEnlace(limite, ahora, 5), caducidadEnlace(limite, ahora + 4 * MIN, 5));
});

test('enlace de pago: nunca más de 24 horas, y sin plazo no se fija caducidad', () => {
  const r = caducidadEnlace(new Date(ahora + 72 * 3_600_000), ahora, 5);
  assert.equal(r.caduca, tanda + 23.5 * 3_600_000);
  assert.equal(caducidadEnlace(null, ahora, 5).caduca, null);
  assert.equal(caducidadEnlace(new Date(NaN), ahora, 5).caduca, null);
});

test('enlace de pago: un margen raro no rompe la cuenta', () => {
  const limite = new Date(ahora + 57 * MIN);
  assert.equal(caducidadEnlace(limite, ahora, -3).caduca, Math.floor(limite.getTime() / 1000) * 1000);
  assert.equal(caducidadEnlace(limite, ahora, NaN).caduca, Math.floor(limite.getTime() / 1000) * 1000);
});
