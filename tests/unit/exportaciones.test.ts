// El CSV de exportación (lib/exportaciones.ts): formato que abre bien el Excel en
// español, el mismo del mockup — BOM, «;» de separador, comillas dobladas, CRLF y
// coma decimal en los números.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aCsv } from '../../lib/exportaciones';

test('aCsv: BOM + «;» + CRLF, comillas solo donde hacen falta (y dobladas), coma decimal, null vacío', () => {
  const csv = aCsv(['A', 'B', 'C'], [
    { A: 'normal', B: 'con "comillas"; y punto y coma', C: 1234.5 },
    { A: null, B: 'salto\nde línea', C: 0 },
  ]);
  assert.ok(csv.startsWith('﻿'), 'empieza con BOM');
  const lineas = csv.slice(1).split('\r\n');
  assert.equal(lineas.length, 3);
  assert.equal(lineas[0], 'A;B;C');
  assert.equal(lineas[1], 'normal;"con ""comillas""; y punto y coma";1234,5');
  assert.equal(lineas[2], ';"salto\nde línea";0');
});
