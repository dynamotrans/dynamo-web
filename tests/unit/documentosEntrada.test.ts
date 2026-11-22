import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leerNombreAlbaran, mismaClave } from '../../lib/documentosEntrada';

test('albaranes: lee la referencia, el tipo, la fecha, origen, destino y matrículas del nombre', () => {
  assert.deepEqual(leerNombreAlbaran('GX66081_ALB_20261030_08185-LLICADEVALL_28936-MOSTOLES_2299LCW-R2252BDK.pdf'), {
    referencia: 'GX66081', tipo: 'albaran', fecha: '2026-10-30', origen: '08185 LLICADEVALL', destino: '28936 MOSTOLES', matriculas: '2299LCW / R2252BDK' });
  assert.equal(leerNombreAlbaran('GX65451B_ALB_20260831_x.pdf').referencia, 'GX65451B');
  assert.equal(leerNombreAlbaran('GX1234_CMR_20260101.pdf').tipo, 'cmr_firmado');
  const raro = leerNombreAlbaran('escaneo 3.pdf');
  assert.equal(raro.referencia, null); assert.equal(raro.fecha, null);
});
test('albaranes: la clave de la entrada se compara entera', () => {
  assert.equal(mismaClave('abc', 'abc'), true);
  assert.equal(mismaClave('abc', 'abd'), false);
  assert.equal(mismaClave('', ''), false);
  assert.equal(mismaClave('abc', 'abcd'), false);
});
