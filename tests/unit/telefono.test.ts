import { test } from 'node:test';
import assert from 'node:assert/strict';
import { telPuesto } from '../../lib/paises';

test('telPuesto: un número de verdad, con o sin prefijo', () => {
  assert.equal(telPuesto('+34600111222'), true);
  assert.equal(telPuesto('600 111 222'), true);
  assert.equal(telPuesto('0034 955 225 945'), true);
  assert.equal(telPuesto('+351912345678'), true);
});

test('telPuesto: vacío, el prefijo solo o un par de cifras no cuentan', () => {
  assert.equal(telPuesto(''), false);
  assert.equal(telPuesto(null), false);
  assert.equal(telPuesto('   '), false);
  assert.equal(telPuesto('+34'), false);
  assert.equal(telPuesto('+34 12'), false);
});
