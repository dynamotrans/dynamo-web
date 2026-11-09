// Primer día de carga del tarifador: mismos casos que primera_fecha_carga() en la base de
// datos (pruebas 149 y 188 del arnés), para que la web y la base de datos no se separen.
// Cada ventana tiene SU hora de corte (usuario, 2026-11-10): 1-3 (completo), 1-2 y 1-4
// (grupaje); la fecha fija, la suya.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { primerDia, sumarHabiles } from '../../lib/fechasCarga';

const sinFest = new Set<string>();
const madrid = (s: string) => new Date(s);   // con la zona en el texto

test('fecha fija: corte a las 12:00', () => {
  assert.equal(primerDia('dia', false, sinFest, undefined, madrid('2026-11-11T10:00:00+01:00')), '2026-11-12');
  assert.equal(primerDia('dia', false, sinFest, undefined, madrid('2026-11-11T13:00:00+01:00')), '2026-11-13');
});

test('ventana: HOY mismo antes de su corte (si hoy es hábil); después, el siguiente hábil', () => {
  assert.equal(primerDia('estandar', false, sinFest, undefined, madrid('2026-11-11T13:00:00+01:00')), '2026-11-11');  // hoy mismo
  assert.equal(primerDia('estandar', false, sinFest, undefined, madrid('2026-11-11T15:00:00+01:00')), '2026-11-12');  // pasado el corte
  assert.equal(primerDia('estandar', false, sinFest, undefined, madrid('2026-11-13T15:00:00+01:00')), '2026-11-16');  // viernes tarde → lunes
  assert.equal(primerDia('estandar', false, sinFest, undefined, madrid('2026-11-14T10:00:00+01:00')), '2026-11-16');  // sábado: no hay «hoy»
  assert.equal(primerDia('estandar', false, new Set(['2026-11-11']), undefined, madrid('2026-11-11T10:00:00+01:00')), '2026-11-12');  // festivo hoy
});

test('cada ventana con SU hora de corte (1-2 · 1-3 · 1-4)', () => {
  const cortes = { fija: 12, v12: 10, v13: 14, v14: 16 };
  const mediodia = madrid('2026-11-11T12:00:00+01:00');
  assert.equal(primerDia('corta', true, sinFest, cortes, mediodia), '2026-11-12');     // 1-2: su corte (10) ya pasó
  assert.equal(primerDia('estandar', false, sinFest, cortes, mediodia), '2026-11-11'); // 1-3 (completo): aún llega
  assert.equal(primerDia('estandar', true, sinFest, cortes, mediodia), '2026-11-11');  // 1-4 (grupaje): aún llega
  assert.equal(primerDia('estandar', true, sinFest, cortes, madrid('2026-11-11T17:00:00+01:00')), '2026-11-12');  // pasado el suyo: el siguiente, nunca dos
});

test('horas de corte de Parámetros y festivos', () => {
  assert.equal(primerDia('dia', false, sinFest, { fija: 9 }, madrid('2026-11-11T10:00:00+01:00')), '2026-11-13');
  assert.equal(sumarHabiles('2026-12-07', 1, new Set(['2026-12-08'])), '2026-12-09');
});
