// Un solo calendario y una sola forma de elegir la hora en toda la plataforma (usuario,
// 2026-11-21: «todos los calendarios unificados, mismo formato»). Ninguna pantalla usa el
// calendario ni el reloj del navegador: fechas con CampoFecha y horas con CampoHora.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

function ficheros(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? ficheros(p) : /\.tsx?$/.test(n) ? [p] : [];
  });
}

test('ninguna pantalla usa <input type="date|time|datetime-local|month|week">', () => {
  // (CampoFecha y CampoHora solo lo nombran en sus comentarios.)
  const malos = ['app', 'components'].flatMap(ficheros).filter((f) => !/Campo(Fecha|Hora)\.tsx$/.test(f) &&
    /type=["'{]*(date|time|datetime-local|month|week)["'}]/.test(readFileSync(f, 'utf8')));
  assert.deepEqual(malos, [], `Usa CampoFecha / CampoHora en: ${malos.join(', ')}`);
});
