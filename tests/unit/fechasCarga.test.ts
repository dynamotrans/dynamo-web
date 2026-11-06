// Primer día de carga del tarifador: mismos casos que primera_fecha_carga() en la base de
// datos (prueba 149 del arnés), para que la web y la base de datos no se separen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { primerDia, sumarHabiles } from '../../lib/fechasCarga';

const sinFest = new Set<string>();
const madrid = (s: string) => new Date(s);   // con la zona en el texto

test('fecha fija: corte a las 12:00', () => {
  assert.equal(primerDia('dia', sinFest, undefined, madrid('2026-11-11T10:00:00+01:00')), '2026-11-12');
  assert.equal(primerDia('dia', sinFest, undefined, madrid('2026-11-11T13:00:00+01:00')), '2026-11-13');
});

test('ventana: corte a las 14:00 y salto del fin de semana', () => {
  assert.equal(primerDia('estandar', sinFest, undefined, madrid('2026-11-11T13:00:00+01:00')), '2026-11-12');
  assert.equal(primerDia('estandar', sinFest, undefined, madrid('2026-11-13T15:00:00+01:00')), '2026-11-17');
});

test('horas de corte de Parámetros y festivos', () => {
  assert.equal(primerDia('dia', sinFest, { fija: 9 }, madrid('2026-11-11T10:00:00+01:00')), '2026-11-13');
  assert.equal(sumarHabiles('2026-12-07', 1, new Set(['2026-12-08'])), '2026-12-09');
});
