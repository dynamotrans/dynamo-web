// Esquemas de entrada de las acciones del servidor (generados de sus tipos).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ESQUEMAS } from '../../lib/entradas/esquemas';

const UUID = '7b8c3a1e-2f4d-4c5b-9a6e-1d2c3b4a5f60';
const vale = (k: keyof typeof ESQUEMAS, args: unknown[]) => ESQUEMAS[k].safeParse(args).success;

test('identificadores: solo uuid', () => {
  assert.equal(vale('app/panel/(app)/envios/acciones#cancelarEnvio', [UUID, 'El cliente ya no lo necesita']), true);
  assert.equal(vale('app/panel/(app)/envios/acciones#cancelarEnvio', ["1' or '1'='1", 'x']), false);
});

test('textos con tope y tipos que no son', () => {
  assert.equal(vale('app/panel/(app)/envios/acciones#cancelarEnvio', [UUID, 'x'.repeat(6000)]), false);
  assert.equal(vale('app/panel/(app)/envios/acciones#cancelarEnvio', [UUID, { malo: true }]), false);
});

test('la firma del CMR admite su imagen', () => {
  const firma = { parada_id: null, rol: 'destinatario', nombre: 'Ana', documento: '12345678Z', pais: 'ES', email: '', png: 'data:image/png;base64,' + 'A'.repeat(200_000) };
  assert.equal(vale('app/cmr/[token]/acciones#firmar', ['tok', firma]), true);
  assert.equal(vale('app/cmr/[token]/acciones#firmar', ['tok', { ...firma, rol: 'jefe' }]), false);
});

test('campos de más se ignoran; los que faltan, no', () => {
  assert.equal(vale('app/panel/(app)/envios/acciones-cliente#valorarMiEnvio', [UUID, 5, 'Todo bien']), true);
  assert.equal(vale('app/panel/(app)/envios/acciones-cliente#valorarMiEnvio', [UUID, 'cinco', 'Todo bien']), false);
});
