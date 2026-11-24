import { test } from 'node:test';
import assert from 'node:assert/strict';
import { horarioDeGoogle } from '../../lib/horarios';
import { fichaDeLugar } from '../../lib/servidor/googleLugares';

const p = (day: number, h1: number, m1: number, h2: number, m2: number, day2 = day) => ({ open: { day, hour: h1, minute: m1 }, close: { day: day2, hour: h2, minute: m2 } });

test('horario de Google: lunes a viernes con jornada partida y sábado de mañana', () => {
  const g = horarioDeGoogle([
    ...[1, 2, 3, 4, 5].flatMap((d) => [p(d, 8, 0, 14, 0), p(d, 15, 30, 18, 0)]),
    p(6, 9, 0, 13, 0),
  ]);
  assert.deepEqual(g, [
    { dias: [1, 2, 3, 4, 5], tramos: [{ abre: '08:00', cierra: '14:00' }, { abre: '15:30', cierra: '18:00' }] },
    { dias: [6], tramos: [{ abre: '09:00', cierra: '13:00' }] },
  ]);
});

test('horario de Google: el domingo de Google (0) es nuestro 7', () => {
  assert.deepEqual(horarioDeGoogle([p(0, 10, 0, 14, 0)]), [{ dias: [7], tramos: [{ abre: '10:00', cierra: '14:00' }] }]);
});

test('horario de Google: un tramo que pasa de medianoche se corta a las 23:59', () => {
  assert.deepEqual(horarioDeGoogle([p(5, 22, 0, 6, 0, 6)]), [{ dias: [5], tramos: [{ abre: '22:00', cierra: '23:59' }] }]);
});

test('horario de Google: sin horario, abierto 24 horas o datos raros → nada (se queda el de por defecto)', () => {
  assert.equal(horarioDeGoogle(null), null);
  assert.equal(horarioDeGoogle([]), null);
  assert.equal(horarioDeGoogle([{ open: { day: 0, hour: 0, minute: 0 } }]), null);       // 24 horas
  assert.equal(horarioDeGoogle([{ open: { day: 9, hour: 8 }, close: { day: 9, hour: 10 } }]), null);
  assert.equal(horarioDeGoogle([p(1, 8, 0, 14, 0), p(1, 13, 0, 17, 0)]), null);             // tramos que se pisan
});

test('ficha de Google: dirección, CP, localidad, provincia, país, teléfono, enlace y horario', () => {
  const f = fichaDeLugar({
    displayName: { text: 'Mercadona' }, formattedAddress: 'Av. de la Constitución, 85, 28821 Coslada, Madrid, España',
    addressComponents: [
      { longText: '85', shortText: '85', types: ['street_number'] },
      { longText: 'Avenida de la Constitución', shortText: 'Av. de la Constitución', types: ['route'] },
      { longText: 'Coslada', shortText: 'Coslada', types: ['locality', 'political'] },
      { longText: 'Madrid', shortText: 'M', types: ['administrative_area_level_2', 'political'] },
      { longText: 'Comunidad de Madrid', shortText: 'MD', types: ['administrative_area_level_1', 'political'] },
      { longText: 'España', shortText: 'ES', types: ['country', 'political'] },
      { longText: '28821', shortText: '28821', types: ['postal_code'] },
    ],
    nationalPhoneNumber: '916 73 00 00', internationalPhoneNumber: '+34 916 73 00 00',
    googleMapsUri: 'https://maps.google.com/?cid=123',
    regularOpeningHours: { periods: [p(1, 9, 0, 21, 30)] },
    types: ['supermarket', 'point_of_interest', 'establishment'], location: { latitude: 40.4237, longitude: -3.5613 },
  });
  assert.deepEqual(f, {
    empresa: 'Mercadona', direccion: 'Avenida de la Constitución, 85', codigo_postal: '28821', poblacion: 'Coslada', provincia: 'Madrid',
    pais_codigo_iso: 'ES', telefono: '+34916730000', url_google_maps: 'https://maps.google.com/?cid=123',
    etiqueta: 'Av. de la Constitución, 85, 28821 Coslada, Madrid, España',
    horario: [{ dias: [1], tramos: [{ abre: '09:00', cierra: '21:30' }] }],
    es_direccion: false, lat: 40.4237, lon: -3.5613, tipo_sugerido: { tipo: 'almacen_nave', por: 'google' },
  });
});

test('ficha de Google: sin datos no inventa nada', () => {
  const f = fichaDeLugar({ displayName: { text: 'Nave sin ficha' } });
  assert.equal(f.empresa, 'Nave sin ficha'); assert.equal(f.telefono, ''); assert.equal(f.horario, null);
  assert.equal(f.pais_codigo_iso, 'ES'); assert.equal(f.codigo_postal, '');
});

test('ficha de Google: una calle o una población es una dirección, no una empresa', () => {
  const f = fichaDeLugar({
    displayName: { text: 'Calle Río Viejo, 48' }, formattedAddress: 'C. Río Viejo, 48, 41703 Dos Hermanas, Sevilla, España',
    addressComponents: [
      { longText: '48', types: ['street_number'] }, { longText: 'Calle Río Viejo', types: ['route'] },
      { longText: 'Dos Hermanas', types: ['locality'] }, { longText: 'Sevilla', types: ['administrative_area_level_2'] },
      { longText: 'España', shortText: 'ES', types: ['country'] }, { longText: '41703', types: ['postal_code'] } ],
    types: ['street_address'], location: { latitude: 37.28, longitude: -5.92 },
  });
  assert.equal(f.es_direccion, true);
  assert.equal(f.direccion, 'Calle Río Viejo, 48'); assert.equal(f.codigo_postal, '41703'); assert.equal(f.poblacion, 'Dos Hermanas');
  assert.equal(f.telefono, ''); assert.equal(f.horario, null); assert.equal(f.lat, 37.28);
  // Sin tipos no se sabe: se trata como empresa.
  assert.equal(fichaDeLugar({ displayName: { text: 'X' } }).es_direccion, false);
});
