// Aviso de entrada desde un dispositivo nuevo: navegador en palabras y huella de la cookie.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describirNavegador, huella, lugarAproximado } from '../../lib/dispositivo';

test('describe navegador y sistema', () => {
  assert.equal(describirNavegador('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36'), 'Chrome en macOS');
  assert.equal(describirNavegador('Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1'), 'Safari en iPhone');
  assert.equal(describirNavegador('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36 Edg/131.0'), 'Edge en Windows');
  assert.equal(describirNavegador('Mozilla/5.0 (Linux; Android 14) Gecko/20100101 Firefox/132.0'), 'Firefox en Android');
  assert.equal(describirNavegador(''), null);
  assert.equal(describirNavegador('curl/8.0'), 'Navegador sin identificar');
});

test('huella SHA-256 en hexadecimal, sin el valor en claro', async () => {
  const h = await huella('6f1c2b8e-0000-4000-8000-000000000000');
  assert.match(h, /^[0-9a-f]{64}$/);
  assert.equal(h, await huella('6f1c2b8e-0000-4000-8000-000000000000'));
  assert.notEqual(h, await huella('otro'));
});

test('lugar aproximado con la ciudad de Vercel', () => {
  const h = (o: Record<string, string>) => ({ get: (n: string) => o[n] ?? null });
  assert.equal(lugarAproximado(h({ 'x-vercel-ip-city': 'Sevilla', 'x-vercel-ip-country': 'ES' })), 'Sevilla, ES');
  assert.equal(lugarAproximado(h({ 'x-vercel-ip-city': 'M%C3%A1laga', 'x-vercel-ip-country': 'ES' })), 'Málaga, ES');
  assert.equal(lugarAproximado(h({})), null);
});
