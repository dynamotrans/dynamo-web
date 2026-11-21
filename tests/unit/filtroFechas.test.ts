// El filtro de fecha único de los listados.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rangoFiltroFecha, enRango, filtroFechaValido, opcionesFiltroFecha } from '../../lib/filtroFechas';

const hoy = '2026-11-21';
test('periodos: días, semanas, meses, trimestres y años', () => {
  assert.equal(rangoFiltroFecha('', hoy), null);
  assert.deepEqual(rangoFiltroFecha('hoy', hoy), { desde: hoy, hasta: hoy });
  assert.deepEqual(rangoFiltroFecha('ult7', hoy), { desde: '2026-11-15', hasta: hoy });
  assert.deepEqual(rangoFiltroFecha('esta-semana', hoy), { desde: '2026-11-16', hasta: '2026-11-22' });
  assert.deepEqual(rangoFiltroFecha('mes', hoy), { desde: '2026-11-01', hasta: '2026-11-30' });
  assert.deepEqual(rangoFiltroFecha('mes-pasado', hoy), { desde: '2026-10-01', hasta: '2026-10-31' });
  assert.deepEqual(rangoFiltroFecha('mes-proximo', hoy), { desde: '2026-12-01', hasta: '2026-12-31' });
  assert.deepEqual(rangoFiltroFecha('trim', hoy), { desde: '2026-10-01', hasta: '2026-12-31' });
  assert.deepEqual(rangoFiltroFecha('trim-pasado', hoy), { desde: '2026-07-01', hasta: '2026-09-30' });
  assert.deepEqual(rangoFiltroFecha('trim-pasado', '2026-02-10'), { desde: '2025-10-01', hasta: '2025-12-31' });
  assert.deepEqual(rangoFiltroFecha('mes-pasado', '2026-01-05'), { desde: '2025-12-01', hasta: '2025-12-31' });
  assert.deepEqual(rangoFiltroFecha('anio-pasado', hoy), { desde: '2025-01-01', hasta: '2025-12-31' });
  assert.deepEqual(rangoFiltroFecha('2026-02', hoy), { desde: '2026-02-01', hasta: '2026-02-28' });
});

test('entre dos fechas: con una sola también filtra; sin ninguna, no', () => {
  assert.deepEqual(rangoFiltroFecha('entre', hoy, '2026-03-01', '2026-03-31'), { desde: '2026-03-01', hasta: '2026-03-31' });
  assert.deepEqual(rangoFiltroFecha('entre', hoy, '2026-03-01', ''), { desde: '2026-03-01', hasta: null });
  assert.equal(rangoFiltroFecha('entre', hoy, '', ''), null);
  assert.equal(rangoFiltroFecha('entre', hoy, 'basura', ''), null);
});

test('enRango y valores válidos', () => {
  const r = { desde: '2026-03-01', hasta: '2026-03-31' };
  assert.equal(enRango('2026-03-15T10:00:00Z', r), true);
  assert.equal(enRango('2026-04-01', r), false);
  assert.equal(enRango(null, r), false);
  assert.equal(enRango(null, null), true);
  assert.equal(filtroFechaValido('trim'), true);
  assert.equal(filtroFechaValido('manana'), true);
  assert.equal(filtroFechaValido('rarito'), false);
  assert.ok(opcionesFiltroFecha(true).some((o) => o.v === 'manana'));
  assert.ok(!opcionesFiltroFecha().some((o) => o.v === 'manana'));
});
