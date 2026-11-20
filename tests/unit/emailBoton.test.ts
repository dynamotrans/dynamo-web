// Destinatarios: las direcciones de prueba (.invalid) se quitan y el resto se manda.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sinDireccionesDePrueba } from '../../lib/emailBoton';

test('quita solo las direcciones .invalid y deja las reales', () => {
  assert.equal(sinDireccionesDePrueba('a@prueba.invalid, real@gmail.com'), 'real@gmail.com');
  assert.equal(sinDireccionesDePrueba('Ana <ana@x.invalid>;otro@empresa.es'), 'otro@empresa.es');
  assert.equal(sinDireccionesDePrueba('real@gmail.com'), 'real@gmail.com');
  assert.equal(sinDireccionesDePrueba('a@prueba.invalid,b@prueba.invalid'), '');
  assert.equal(sinDireccionesDePrueba('invalido@empresa.es'), 'invalido@empresa.es');
});
