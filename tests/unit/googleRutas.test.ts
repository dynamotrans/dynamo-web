import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leerRuta, direccionEnLinea } from '../../lib/servidor/googleRutas';

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
