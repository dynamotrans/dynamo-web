import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leerRespuesta, partirDireccion, rutaPorCif, rutaPorNombre } from '../../lib/apiEmpresas';

test('autorrelleno (APIEmpresas): parte la dirección y pone la provincia del CP', () => {
  assert.deepEqual(partirDireccion('CALLE EJEMPLO 1, 28001 MADRID'), { direccion: 'CALLE EJEMPLO 1', codigo_postal: '28001', poblacion: 'MADRID' });
  assert.deepEqual(partirDireccion('AVDA. DE LA PALMERA 5 41012 SEVILLA (SEVILLA)'), { direccion: 'AVDA. DE LA PALMERA 5', codigo_postal: '41012', poblacion: 'SEVILLA' });
  assert.deepEqual(partirDireccion('Sin código postal'), { direccion: 'Sin código postal', codigo_postal: '', poblacion: '' });
  const [e] = leerRespuesta({ cif: 'b-12345678', name: 'NOMBRE DE LA EMPRESA SL', address: 'CALLE EJEMPLO 1, 28001 MADRID', status: 'activa' });
  assert.deepEqual(e, { cif: 'B12345678', razon_social: 'NOMBRE DE LA EMPRESA SL', direccion: 'CALLE EJEMPLO 1', codigo_postal: '28001', poblacion: 'MADRID', provincia: 'Madrid', estado: 'activa' });
});

test('autorrelleno (APIEmpresas): lee listas y otros nombres de campo, y no falla con lo raro', () => {
  const l = leerRespuesta({ data: [
    { nif: 'B11111111', razon_social: 'UNO SL', address: { street: 'C/ Uno 1', postal_code: '41001', city: 'Sevilla' } },
    { cif: 'B22222222' },                          // sin nombre: se ignora
    { cif: 'B33333333', nombre: 'TRES SA', domicilio: 'Rua 3, 4000-001 Porto' },
  ] });
  assert.equal(l.length, 2);
  assert.equal(l[0].provincia, 'Sevilla');
  assert.equal(l[0].direccion, 'C/ Uno 1');
  assert.equal(l[1].razon_social, 'TRES SA');
  assert.deepEqual(leerRespuesta(null), []);
  assert.deepEqual(leerRespuesta('texto'), []);
  assert.match(rutaPorCif('B1 2'), /companies\?cif=B1%202$/);
  assert.match(rutaPorNombre('Marbex & Co'), /search\?q=Marbex%20%26%20Co$/);
});
