import { test } from 'node:test';
import assert from 'node:assert/strict';
import { descifrarLinea, partirLinea, repartirTrazados, trazadoEntre } from '../../lib/lineaRuta';
import { posicionCamion, type MapaEnvio } from '../../lib/mapaEnvio';

test('descifrarLinea: el ejemplo de la documentación de Google', () => {
  assert.deepEqual(descifrarLinea('_p~iF~ps|U_ulLnnqC_mqNvxq`@'), [[38.5, -120.2], [40.7, -120.95], [43.252, -126.453]]);
});

test('descifrarLinea: vacía o estropeada no rompe', () => {
  assert.deepEqual(descifrarLinea(null), []);
  assert.deepEqual(descifrarLinea(''), []);
  assert.deepEqual(descifrarLinea('_p~iF~ps|U_'), [[38.5, -120.2]]);   // cortada a medias: lo leído hasta ahí
  assert.deepEqual(descifrarLinea('\u0000\u0001'), []);
});

test('partirLinea: corta en la fracción recorrida, sobre la línea', () => {
  const l: [number, number][] = [[0, 0], [0, 1], [0, 3]];
  const m = partirLinea(l, 0.5)!;
  assert.deepEqual(m.punto.map((x) => Math.round(x * 1000) / 1000), [0, 1.5]);
  assert.equal(m.hecho.length, 3);
  assert.equal(m.falta.length, 2);
  assert.deepEqual(partirLinea(l, 0)!.punto, [0, 0]);
  assert.deepEqual(partirLinea(l, 1)!.punto, [0, 3]);
  assert.deepEqual(partirLinea(l, 7)!.punto, [0, 3]);        // fuera de rango: se recorta
  assert.equal(partirLinea([[1, 1]], 0.5), null);
});

test('trazadoEntre: empieza y acaba en las paradas; sin trazado, la recta', () => {
  assert.deepEqual(trazadoEntre([1, 1], [2, 2], undefined), [[1, 1], [2, 2]]);
  assert.deepEqual(trazadoEntre([1, 1], [2, 2], [[1.1, 1], [1.9, 2]]), [[1, 1], [1.1, 1], [1.9, 2], [2, 2]]);
});

test('repartirTrazados: por envío y tramo, cada línea una sola vez', () => {
  const r = repartirTrazados({ lineas: ['_p~iF~ps|U_ulLnnqC'], tramos: [{ envio: 'a', desde: 1, hasta: 2, linea: 0 }, { envio: 'b', desde: 2, hasta: 3, linea: 0 }, { envio: 'c', desde: 1, hasta: 2, linea: 5 }] });
  assert.equal(r.a['1-2'].length, 2);
  assert.equal(r.b['2-3'], r.a['1-2']);
  assert.equal(r.c, undefined);
});

test('repartirTrazados: el trazado de la vuelta se pinta al revés', () => {
  const r = repartirTrazados({ lineas: ['_p~iF~ps|U_ulLnnqC'], tramos: [{ envio: 'a', desde: 1, hasta: 2, linea: 0 }, { envio: 'b', desde: 1, hasta: 2, linea: 0, alreves: true }] });
  assert.deepEqual(r.a['1-2'], [[38.5, -120.2], [40.7, -120.95]]);
  assert.deepEqual(r.b['1-2'], [[40.7, -120.95], [38.5, -120.2]]);
});

test('posicionCamion: en ruta va sobre la carretera si hay trazado, y sobre la recta si no', () => {
  const base: MapaEnvio = {
    resultado: 'ok', referencia: 'X', estado: 'en_ruta', ahora: '2026-11-24T10:00:00Z', etapas: [], gps_firma: null,
    paradas: [
      { orden: 1, tipo: 'carga', empresa: 'A', poblacion: 'Uno', provincia: null, codigo_postal: null, pais: 'ES', lat: 0, lon: 0, coord: 'sitio', realizado_en: null },
      { orden: 2, tipo: 'descarga', empresa: 'B', poblacion: 'Dos', provincia: null, codigo_postal: null, pais: 'ES', lat: 0, lon: 2, coord: 'sitio', realizado_en: null },
    ],
    camion: { modo: 'en_ruta', desde: 1, hasta: 2, fraccion: 0.5, parado: false, retraso: false, salida: null, llegada_prevista: null },
  };
  const recta = posicionCamion(base)!;
  assert.deepEqual([recta.lat, Math.round(recta.lon * 1000) / 1000], [0, 1]);
  // La carretera sube hasta la latitud 1 y vuelve: a mitad de camino el camión está arriba.
  const curva = posicionCamion({ ...base, trazados: { '1-2': [[1, 0], [1, 2]] } })!;
  assert.equal(Math.round(curva.lat * 100) / 100, 1);
  assert.equal(Math.round(curva.lon * 100) / 100, 1);
});
