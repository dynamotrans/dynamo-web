// Estado que se enseña de cada envío y horario de atención.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estadoVisual, esPendientePago, type EnvioFila } from '../../lib/envios';
import { horarioTelefono, HORARIO_ONLINE } from '../../lib/atencion';

const e = (x: Partial<EnvioFila>) => x as EnvioFila;

test('anulado sin pago frente a cancelado', () => {
  assert.equal(estadoVisual(e({ estado: 'cancelado', estado_pago_previo: 'pendiente' })).label, 'Anulado sin pago');
  assert.equal(estadoVisual(e({ estado: 'cancelado', estado_pago_previo: 'pagado' })).label, 'Cancelado');
});

test('pendiente de pago solo si está programado', () => {
  assert.equal(esPendientePago({ estado: 'programado', estado_pago_previo: 'pendiente' }), true);
  assert.equal(esPendientePago({ estado: 'cancelado', estado_pago_previo: 'pendiente' }), false);
  assert.equal(estadoVisual(e({ estado: 'programado', estado_pago_previo: 'pendiente' })).label, 'Pendiente de pago');
});

test('horarios de atención en formato largo', () => {
  assert.equal(HORARIO_ONLINE, 'Lunes a viernes 8:00–18:00');
  assert.equal(horarioTelefono(new Date(2026, 9, 14, 10)), 'Lunes a jueves 9:00–14:00 y 15:00–17:00 · viernes 9:00–14:00');
  assert.equal(horarioTelefono(new Date(2026, 6, 14, 10)), 'Lunes a viernes 8:30–15:30 (verano)');
});

test('estados: una sola lista para toda la web', async () => {
  const { ESTADOS_ENVIO, enMarcha, nombreEstado } = await import('../../lib/estados');
  const { ESTADO_ENVIO } = await import('../../lib/formato');
  assert.equal(nombreEstado('hacia_la_carga'), 'Yendo a la carga');
  assert.equal(ESTADO_ENVIO.en_ruta, ESTADOS_ENVIO.en_ruta.label);
  assert.equal(enMarcha('cargando'), true);
  assert.equal(enMarcha('programado'), false);
});

test('seguimiento: programado, asignando, confirmado y cada parada', () => {
  assert.equal(estadoVisual(e({ estado: 'programado' })).label, 'Programado');
  assert.equal(estadoVisual(e({ estado: 'programado', asignando: true })).label, 'Asignando transportista');
  assert.equal(estadoVisual(e({ estado: 'programado', asignando: true, transportista_asignado: true })).label, 'Confirmado');
  assert.equal(estadoVisual(e({ estado: 'hacia_la_carga', parada_actual: 1 })).label, 'Yendo a la carga');
  assert.equal(estadoVisual(e({ estado: 'cargando', parada_actual: 1, tipo_parada: 'carga' })).label, 'Cargando (1.ª parada)');
  assert.equal(estadoVisual(e({ estado: 'en_ruta', parada_actual: 3, tipo_parada: 'descarga' })).label, 'En ruta a 3.ª parada');
  assert.equal(estadoVisual(e({ estado: 'cargando', parada_actual: 3, tipo_parada: 'descarga' })).label, 'Descargando (3.ª parada)');
  assert.equal(estadoVisual(e({ estado: 'en_ruta' })).label, 'En ruta');
});

// La «Fecha» rápida de la barra de filtros: semanas de lunes a domingo y meses enteros.
import { rangoRapido } from '../../lib/envios';
test('rangoRapido: hoy/mañana/ayer, semana (L-D) y mes entero', () => {
  const hoy = '2026-11-08';   // domingo
  assert.deepEqual(rangoRapido('hoy', hoy), { desde: '2026-11-08', hasta: '2026-11-08' });
  assert.deepEqual(rangoRapido('manana', hoy), { desde: '2026-11-09', hasta: '2026-11-09' });
  assert.deepEqual(rangoRapido('ayer', hoy), { desde: '2026-11-07', hasta: '2026-11-07' });
  assert.deepEqual(rangoRapido('esta-semana', hoy), { desde: '2026-11-02', hasta: '2026-11-08' });
  assert.deepEqual(rangoRapido('proxima-semana', hoy), { desde: '2026-11-09', hasta: '2026-11-15' });
  assert.deepEqual(rangoRapido('semana-pasada', hoy), { desde: '2026-10-26', hasta: '2026-11-01' });
  assert.deepEqual(rangoRapido('2026-02', hoy), { desde: '2026-02-01', hasta: '2026-02-28' });
  assert.equal(rangoRapido('rarito', hoy), null);
});
