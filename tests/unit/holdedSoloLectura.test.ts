import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// REGLA DURA (usuario, 2026-11-24): «la API de Holded solo hará LECTURA de Holded, NUNCA
// cambios hasta que expresamente lo hablemos». Esta prueba es el cerrojo:
//  1. Solo UN fichero habla con Holded (lib/servidor/holded.ts).
//  2. Ese fichero solo sabe leer: no contiene ningún método de escritura.
// Si algún día el usuario ordena escribir en Holded, se cambia esta prueba A LA VEZ y a propósito.
const RAIZ = path.resolve(__dirname, '../..');
const PUERTA = 'lib/servidor/holded.ts';

function fuentes(dir: string, salida: string[] = []): string[] {
  for (const e of fs.readdirSync(path.join(RAIZ, dir), { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) fuentes(rel, salida);
    else if (/\.(ts|tsx|mjs|js)$/.test(e.name)) salida.push(rel);
  }
  return salida;
}

test('Holded: solo un fichero de la plataforma habla con su API', () => {
  const otros = ['app', 'components', 'lib'].flatMap((d) => fuentes(d))
    .filter((f) => f !== PUERTA && /api\.holded\.com/.test(fs.readFileSync(path.join(RAIZ, f), 'utf8')));
  assert.deepEqual(otros, [], `Estos ficheros hablan con Holded sin pasar por ${PUERTA}`);
});

test('Holded: la única puerta solo sabe LEER (ni crear, ni cambiar, ni borrar)', () => {
  const codigo = fs.readFileSync(path.join(RAIZ, PUERTA), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');   // sin comentarios
  assert.doesNotMatch(codigo, /['"`](POST|PUT|PATCH|DELETE)['"`]/i, 'La puerta de Holded tiene un método de escritura');
  const metodos = [...codigo.matchAll(/method:\s*([^,}\s]+)/g)].map((m) => m[1]);
  assert.deepEqual(metodos, ["'GET'"], 'Toda petición a Holded debe ir con el método de leer, escrito a fuego');
  assert.equal((codigo.match(/\bfetch\(/g) ?? []).length, 1, 'Solo debe haber un sitio que pida a Holded');
});
