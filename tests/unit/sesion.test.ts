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

// La marca «Secure» de las cookies: siempre, salvo que la web se sirva por http en local.
import { cookieSegura } from '../../lib/cookieSegura';
test('cookies «Secure»: siempre en producción, nunca se quita fuera de http local', () => {
  assert.equal(cookieSegura('https://www.dynamotrans.com'), true);
  assert.equal(cookieSegura('https://dynamo-web-git-pruebas-dynamotrans-projects.vercel.app'), true);
  assert.equal(cookieSegura(undefined), true);
  assert.equal(cookieSegura(''), true);
  assert.equal(cookieSegura('http://dynamotrans.com'), true);            // http de verdad: no se relaja
  assert.equal(cookieSegura('http://localhost.evil.com'), true);
  assert.equal(cookieSegura('http://localhost:3000'), false);
  assert.equal(cookieSegura('http://127.0.0.1:3000/'), false);
});

// Doble paso: el nivel de la sesión sale del token («aal2» = contraseña + código del móvil).
import { nivelDelToken, movilesDe } from '../../lib/supabase/doblePaso';
test('doble paso: el nivel de la sesión se lee del token; sin token legible, «aal1»', () => {
  const token = (o: object) => `${b64({ alg: 'HS256' })}.${b64(o)}.firma`;
  assert.equal(nivelDelToken(token({ aal: 'aal2' })), 'aal2');
  assert.equal(nivelDelToken(token({ aal: 'aal1' })), 'aal1');
  assert.equal(nivelDelToken(token({})), 'aal1');
  assert.equal(nivelDelToken(token({ aal: 'aal3' })), 'aal1');     // lo que no sea aal2 no cuenta
  assert.equal(nivelDelToken('no-es-un-token'), 'aal1');
  assert.equal(nivelDelToken(null), 'aal1');
});
test('doble paso: solo cuentan los móviles ya comprobados', () => {
  assert.equal(movilesDe({ factors: [{ id: 'a', status: 'unverified', factor_type: 'totp' }] }).length, 0);
  assert.equal(movilesDe({ factors: [{ id: 'a', status: 'verified', factor_type: 'totp' }, { id: 'b', status: 'verified', factor_type: 'phone' }] }).length, 1);
  assert.equal(movilesDe(null).length, 0);
});
