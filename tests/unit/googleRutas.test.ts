import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leerRuta, direccionEnLinea, escala } from '../../lib/servidor/googleRutas';

test('ruta de Google: kilómetros con dos decimales, minutos y la línea', () => {
  assert.deepEqual(leerRuta({ routes: [{ distanceMeters: 531234, duration: '18960s', polyline: { encodedPolyline: 'abc' } }] }),
    { km: 531.23, minutos: 316, linea: 'abc' });
});

test('ruta de Google: sin ruta o con distancia rara no devuelve nada', () => {
  assert.equal(leerRuta(null), null);
  assert.equal(leerRuta({ routes: [] }), null);
  assert.equal(leerRuta({ routes: [{ distanceMeters: 0, duration: '0s' }] }), null);
  assert.equal(leerRuta({ routes: [{ duration: '10s' }] }), null);
});

test('ruta de Google: sin duración legible, 0 minutos; sin línea, null', () => {
  assert.deepEqual(leerRuta({ routes: [{ distanceMeters: 1000 }] }), { km: 1, minutos: 0, linea: null });
});

test('dirección en una línea: calle, código y población, y el país con su nombre', () => {
  assert.equal(direccionEnLinea({ direccion: 'C/ Río Viejo, 48', codigo_postal: '41703', poblacion: 'Dos Hermanas', pais: 'ES' }), 'C/ Río Viejo, 48, 41703 Dos Hermanas, España');
  assert.equal(direccionEnLinea({ codigo_postal: '28821', pais: 'es' }), '28821, España');
  assert.equal(direccionEnLinea({ codigo_postal: '4000-123', poblacion: 'Porto', pais: 'PT' }), '4000-123 Porto, Portugal');
  assert.equal(direccionEnLinea({ poblacion: 'Oslo', pais: 'NO' }), 'Oslo, NO');
});

// Con coordenadas, a Google se le manda el PUNTO y no el texto de la dirección (usuario,
// 2026-11-24): con una dirección rara Google elegía otro sitio y salían mal los km y la ruta.
test('escala: mandan las coordenadas; el texto solo si no las hay', () => {
  assert.deepEqual(escala({ direccion: 'Ffff, Ffff Ffff, España', lat: 37.18, lon: -3.6 }), { location: { latLng: { latitude: 37.18, longitude: -3.6 } } });
  assert.deepEqual(escala({ direccion: '12550 Almassora, España' }), { address: '12550 Almassora, España' });
  assert.deepEqual(escala({ direccion: '12550 Almassora, España', lat: null, lon: null }), { address: '12550 Almassora, España' });
  assert.deepEqual(escala({ direccion: 'Calle Uno 1, Sevilla', lat: 0, lon: 0 }), { address: 'Calle Uno 1, Sevilla' });   // 0,0 no es un sitio
  assert.equal(escala({ direccion: 'ab' }), null);
  assert.equal(escala({}), null);
});
