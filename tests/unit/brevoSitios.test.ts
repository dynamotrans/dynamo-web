import { test } from 'node:test';
import assert from 'node:assert/strict';
import { atributosBrevo, errorBrevo, TIPO_CONTACTO_SITIO, type SitioParaBrevo } from '../../lib/brevoSitios';

const base: SitioParaBrevo = {
  email: 'almacen@empresa.com', nombre: null, cargo: null, empresa: 'Aceros del Sur SL', cif: 'B12345678', telefono: '+34 954 000 000',
  direccion: 'Calle Uno 1', codigo_postal: '41001', localidad: 'Sevilla', provincia: 'Sevilla', pais: 'es', google_maps: null, sitio_id: 's1', huella: 'h',
};

test('sin persona de contacto, el saludo lleva la empresa', () => {
  const a = atributosBrevo(base);
  assert.equal(a.NOMBRE, 'Aceros del Sur SL');
  assert.equal(a.COMPANY_NAME, 'Aceros del Sur SL');
  assert.equal(a.PROVINCIA, 'Sevilla');
  assert.equal(a.PAIS, 'ES');
  assert.equal(a.TIPO_CONTACTO, TIPO_CONTACTO_SITIO);
});

test('con persona de contacto, el saludo lleva su nombre y va su cargo', () => {
  const a = atributosBrevo({ ...base, nombre: '  Marta   Ruiz ', cargo: 'Jefa de almacén' });
  assert.equal(a.NOMBRE, 'Marta Ruiz');
  assert.equal(a.JOB_TITLE, 'Jefa de almacén');
});

test('los campos vacíos no se mandan (no pisan lo que ya hubiera en Brevo)', () => {
  const a = atributosBrevo({ ...base, cif: null, telefono: '  ', google_maps: null, cargo: null });
  for (const k of ['CIF', 'TELEFONO', 'GOOGLE_MAPS', 'JOB_TITLE']) assert.equal(k in a, false, k);
  assert.equal(Object.values(a).every((v) => v !== ''), true);
});

test('los textos largos se cortan', () => {
  const a = atributosBrevo({ ...base, direccion: 'x'.repeat(900) });
  assert.equal(a.DIRECCION.length, 250);
});

test('el rechazo de Brevo se resume en corto', () => {
  assert.equal(errorBrevo(400, { code: 'invalid_parameter', message: 'Invalid email address' }), 'Brevo 400 · invalid_parameter: Invalid email address');
  assert.equal(errorBrevo(401, null), 'Brevo 401');
  assert.equal(errorBrevo(500, { message: 'y'.repeat(900) }).length, 300);
});
