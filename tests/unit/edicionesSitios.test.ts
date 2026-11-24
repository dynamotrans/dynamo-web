import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ajustarAPuntos, extenderAlSitio, nombreParada } from '../../lib/edicionesSitios';

const A = { id: 'a' }, B = { id: 'b' };
type E = Record<string, unknown>;

test('extenderAlSitio: el teléfono puesto en una parada vale para las demás del mismo sitio, no para otros', () => {
  const puntos = [{ k: 1, sitio: A }, { k: 2, sitio: A }, { k: 3, sitio: B }];
  const antes: Record<number, E> = {};
  const despues: Record<number, E> = { 2: { telefono: '600' } };
  assert.deepEqual(extenderAlSitio(antes, despues, puntos), { 1: { telefono: '600' }, 2: { telefono: '600' } });
});

test('extenderAlSitio: la cita y el detalle de mercancía son de esa parada y no se copian', () => {
  const puntos = [{ k: 1, sitio: A }, { k: 2, sitio: A }];
  const despues: Record<number, E> = { 1: { cita: true, citaHora: '10:00', mercancia: 'bobinas' } };
  assert.deepEqual(extenderAlSitio({}, despues, puntos), despues);
});

test('extenderAlSitio: solo se copia lo que cambia, sin pisar lo propio de la otra parada', () => {
  const puntos = [{ k: 1, sitio: A }, { k: 2, sitio: A }];
  const antes: Record<number, E> = { 1: { telefono: '600' }, 2: { telefono: '600', cita: true } };
  const despues: Record<number, E> = { 1: { telefono: '600', contacto: 'Ana' }, 2: antes[2] };
  assert.deepEqual(extenderAlSitio(antes, despues, puntos), { 1: { telefono: '600', contacto: 'Ana' }, 2: { telefono: '600', cita: true, contacto: 'Ana' } });
});

test('extenderAlSitio: los sitios nuevos (sin identificador) no se mezclan entre sí', () => {
  const puntos = [{ k: 1, sitio: null }, { k: 2, sitio: null }];
  const despues: Record<number, E> = { 1: { telefono: '600' } };
  assert.deepEqual(extenderAlSitio({}, despues, puntos), despues);
});

test('ajustarAPuntos: una parada que estrena sitio hereda lo ya tocado de ese sitio', () => {
  const puntos = [{ k: 1, sitio: A }, { k: 2, sitio: A }];
  const edic: Record<number, E> = { 1: { telefono: '600', cita: true } };
  assert.deepEqual(ajustarAPuntos(edic, puntos, new Map([[1, 'a']])), { 1: { telefono: '600', cita: true }, 2: { telefono: '600' } });
});

test('ajustarAPuntos: al cambiar de sitio en una parada, lo del sitio anterior no se arrastra', () => {
  const puntos = [{ k: 1, sitio: B }];
  const edic: Record<number, E> = { 1: { telefono: '600', cita: true, mercancia: 'bobinas' } };
  assert.deepEqual(ajustarAPuntos(edic, puntos, new Map([[1, 'a']])), { 1: { mercancia: 'bobinas' } });
  assert.deepEqual(ajustarAPuntos({ 1: { telefono: '600' } }, puntos, new Map([[1, 'a']])), {});
});

test('ajustarAPuntos: sin cambios devuelve el mismo objeto', () => {
  const puntos = [{ k: 1, sitio: A }, { k: 2, sitio: B }];
  const edic: Record<number, E> = { 1: { telefono: '600' } };
  assert.equal(ajustarAPuntos(edic, puntos, new Map([[1, 'a'], [2, 'b']])), edic);
});

test('nombreParada', () => {
  assert.equal(nombreParada(0, 'carga'), '1 · Recogida');
  assert.equal(nombreParada(1, 'descarga'), '2 · Entrega');
});
