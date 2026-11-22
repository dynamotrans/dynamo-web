import { test } from 'node:test';
import assert from 'node:assert/strict';
import { provinciaDeCodigoPostal, conProvinciaDelCp, PROVINCIAS_LISTA } from '../../lib/provinciasEs';

test('la provincia sale de las dos primeras cifras del código postal', () => {
  assert.equal(provinciaDeCodigoPostal('41016'), 'Sevilla');
  assert.equal(provinciaDeCodigoPostal('08210'), 'Barcelona');
  assert.equal(provinciaDeCodigoPostal(' 28 001'), 'Madrid');
  assert.equal(provinciaDeCodigoPostal('4'), null);
  assert.equal(provinciaDeCodigoPostal('99000'), null);
  assert.equal(provinciaDeCodigoPostal(''), null);
  assert.equal(PROVINCIAS_LISTA.length, 52);
});

test('en España manda el código postal; fuera, la provincia escrita se queda', () => {
  assert.equal(conProvinciaDelCp({ codigo_postal: '11201', provincia: 'sevilla' }, 'ES').provincia, 'Cádiz');
  assert.equal(conProvinciaDelCp({ codigo_postal: '1000-001', provincia: 'Lisboa' }, 'PT').provincia, 'Lisboa');
  assert.equal(conProvinciaDelCp({ codigo_postal: '', provincia: 'Sevilla' }, 'ES').provincia, 'Sevilla');
});
