// Copia la web pública estática (los .html de la raíz, css/, js/, images/...) a public/
// justo antes de compilar Next.js.
//
// Por qué así y no moviendo los ficheros a public/ en git: la web pública vive en la
// RAÍZ en la rama `main` (dynamotrans.com, estática, sin Next.js). Si en `pruebas`
// estuvieran en public/, cada cambio público que baja de `main` a `pruebas` (regla 8)
// chocaría al fusionar. Así los dos lados siguen teniendo los ficheros en el mismo sitio
// y public/ es solo un paso de compilación (está en .gitignore).
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';

const DESTINO = 'public';
const CARPETAS = ['css', 'js', 'images'];
const SUELTOS = ['manifest.webmanifest', 'sw.js', 'robots.txt', 'sitemap.xml'];

rmSync(DESTINO, { recursive: true, force: true });
mkdirSync(DESTINO);

let n = 0;
for (const f of readdirSync('.')) {
  if (f.endsWith('.html')) { cpSync(f, `${DESTINO}/${f}`); n++; }
}
for (const f of SUELTOS) {
  if (existsSync(f)) { cpSync(f, `${DESTINO}/${f}`); n++; }
}
for (const d of CARPETAS) {
  if (existsSync(d)) { cpSync(d, `${DESTINO}/${d}`, { recursive: true }); n++; }
}
console.log(`[copiar-estaticos] ${n} elementos de la web publica copiados a ${DESTINO}/`);
