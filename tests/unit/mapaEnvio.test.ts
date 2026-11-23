import { test } from 'node:test';
import assert from 'node:assert/strict';
import { posicionCamion, estadoMapa, horaParada, etiquetaParada, etiquetaParadaCorta, type MapaEnvio } from '../../lib/mapaEnvio';

const base = (camion: MapaEnvio['camion']): MapaEnvio => ({
  resultado: 'ok', referencia: 'GX1', estado: 'en_ruta', ahora: '2026-11-23T10:00:00Z', gps_firma: null,
  paradas: [
    { orden: 1, tipo: 'carga', empresa: 'Almacén', poblacion: 'Sevilla', provincia: null, codigo_postal: '41001', pais: 'ES', lat: 37, lon: -6, coord: 'sitio', realizado_en: '2026-11-23T08:00:00Z' },
    { orden: 2, tipo: 'descarga', empresa: 'Nave', poblacion: 'Madrid', provincia: null, codigo_postal: '28001', pais: 'ES', lat: 40, lon: -3, coord: 'sitio', realizado_en: null },
  ],
  etapas: [{ paso: 2, estado: 'cargando', parada: 1, hora: '2026-11-23T08:00:00Z', hecha: true, actual: false }],
  camion,
});
const ruta = { modo: 'en_ruta' as const, desde: 1, hasta: 2, fraccion: 0.5, parado: false, retraso: false, salida: null, llegada_prevista: '2026-11-23T14:00:00Z' };

test('mapa: en ruta, el camión va en la fracción del tramo', () => {
  const p = posicionCamion(base(ruta))!;
  assert.equal(p.lat, 38.5); assert.equal(p.lon, -4.5);
  assert.match(p.titulo, /En ruta a Madrid/); assert.match(p.detalle, /50 %/);
});
test('mapa: parado (pausa) y con retraso cambian el aviso', () => {
  assert.match(posicionCamion(base({ ...ruta, parado: true }))!.titulo, /Parado/);
  const r = posicionCamion(base({ ...ruta, fraccion: 1, retraso: true }))!;
  assert.equal(r.tono, 'rojo'); assert.equal(r.lat, 40);
});
test('mapa: parado dice por qué (pausa, descanso de noche, esperando para llegar) y cuándo sigue', () => {
  const d = posicionCamion(base({ ...ruta, parado: true, motivo_parada: 'descanso', sigue_en: '2026-11-24T06:00:00Z' }))!;
  assert.match(d.titulo, /descanso del conductor/); assert.match(d.detalle, /sigue/); assert.equal(d.tono, 'gris');
  assert.match(posicionCamion(base({ ...ruta, parado: true, motivo_parada: 'pausa' }))!.titulo, /pausa del conductor/);
  const w = posicionCamion(base({ ...ruta, fraccion: 1, parado: true, motivo_parada: 'espera' }))!;
  assert.match(w.titulo, /esperando para llegar a Madrid/); assert.equal(w.tono, 'gris'); assert.equal(w.lat, 40);
});
test('mapa: sin salir no se pinta el camión; en parada y entregado, en la parada', () => {
  assert.equal(posicionCamion(base({ ...ruta, modo: 'sin_salir', desde: null, hasta: 1 })), null);
  assert.match(estadoMapa(base({ ...ruta, modo: 'sin_salir', desde: null, hasta: 1 })), /Aún no ha salido/);
  const c = posicionCamion(base({ ...ruta, modo: 'en_parada', desde: null, hasta: 1 }))!;
  assert.equal(c.titulo, 'Cargando'); assert.equal(c.lat, 37);
  assert.equal(posicionCamion(base({ ...ruta, modo: 'entregado', desde: null, hasta: 2 }))!.lon, -3);
});
test('mapa: sin coordenadas no se inventa una posición', () => {
  const m = base(ruta); m.paradas[1].lat = null; m.paradas[1].lon = null;
  assert.equal(posicionCamion(m), null);
  assert.match(estadoMapa(m), /Sin coordenadas/);
});

test('mapa: la hora de cada parada dice si es real (firma, marcada, seguimiento) o prevista', () => {
  const m = base(ruta);
  m.etapas.push({ paso: 4, estado: 'cargando', parada: 2, hora: '2026-11-23T14:00:00Z', hecha: false, actual: false });
  assert.match(horaParada(m, { ...m.paradas[0], firmada_en: '2026-11-23T08:05:00Z' })!.texto, /firmado en el CMR/);
  assert.match(horaParada(m, m.paradas[0])!.texto, /marcado en el seguimiento/);
  const h = horaParada(m, m.paradas[1])!;
  assert.equal(h.real, false); assert.match(h.texto, /^Prevista/);
  const et = etiquetaParada(m, { ...m.paradas[1], empresa: 'Nave <Madrid>' });
  assert.match(et, /^<strong>Entrega 2<\/strong><br>Nave &lt;Madrid&gt;<br>28001 Madrid<br>/);
});

test('mapa: la etiqueta corta lleva tipo, número, población y la hora corta', () => {
  const m = base(ruta);
  const c = etiquetaParadaCorta(m, m.paradas[0]);
  assert.match(c, /Recogida 1<\/strong> · Sevilla/);
  assert.match(c, /✓ Cargado 23\/11 09:00/);
  assert.doesNotMatch(c, /Almacén|41001|seguimiento/);
});
