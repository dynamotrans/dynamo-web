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

// Los dos teléfonos de un sitio, cada uno con su nombre (usuario, 2026-11-26).
test('teléfonos de un sitio: móvil y fijo por separado; un dato sin separar sale como «Tfno»', async () => {
  const { telefonosSitio, telDe } = await import('../../lib/contactos');
  assert.deepEqual(telefonosSitio({ telefono: '+34600111222', movil: '+34600111222', fijo: '+34954111222' }),
    [{ que: 'Móvil', tel: '+34600111222' }, { que: 'Fijo', tel: '+34954111222' }]);
  assert.deepEqual(telefonosSitio({ telefono: '+34954111222', movil: null, fijo: '+34954111222' }), [{ que: 'Fijo', tel: '+34954111222' }]);
  // Un sitio lleva un solo teléfono (2026-11-27): si en el del móvil hay un fijo, no se llama «Móvil».
  assert.deepEqual(telefonosSitio({ telefono: '+34954111222', movil: '+34954111222', fijo: null }), [{ que: 'Tfno', tel: '+34954111222' }]);
  assert.deepEqual(telefonosSitio({ telefono: '+34600111222', movil: '+34600111222', fijo: null }), [{ que: 'Móvil', tel: '+34600111222' }]);
  assert.deepEqual(telefonosSitio({ telefono: '+34600111222' }), [{ que: 'Tfno', tel: '+34600111222' }]);
  assert.deepEqual(telefonosSitio(null), []);
  assert.equal(telDe({ telefono: '', telefono_fijo: '+34954111222' }), '+34954111222');
  assert.equal(telDe({ telefono: '+34600111222', telefono_fijo: '+34954111222' }), '+34600111222');
});
