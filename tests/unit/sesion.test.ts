// Duración de la sesión: cuenta desde la última vez que se escribió la contraseña (amr).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sesionCaducada } from '../../lib/supabase/duracionSesion';

const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
const ahora = Math.floor(Date.now() / 1000);
const cliente = (hace: number, dias = { recordar_dias: 90, dias: 30 }) => ({
  auth: { getSession: async () => ({ data: { session: { access_token: `${b64({})}.${b64({ amr: [{ method: 'password', timestamp: ahora - hace }] })}.x` } } }) },
  rpc: async () => ({ data: dias, error: null }),
}) as never;

test('con «Recordarme»: 90 días', async () => {
  assert.equal(await sesionCaducada(cliente(86400), true), false);
  assert.equal(await sesionCaducada(cliente(91 * 86400), true), true);
});

test('sin «Recordarme»: 30 días', async () => {
  assert.equal(await sesionCaducada(cliente(31 * 86400), false), true);
});
