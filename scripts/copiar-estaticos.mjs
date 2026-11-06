// Copia la web pública estática (los .html de la raíz, css/, js/, images/...) a public/
// justo antes de compilar Next.js.
//
// Por qué así y no moviendo los ficheros a public/ en git: la web pública vive en la
// RAÍZ en la rama `main` (dynamotrans.com, estática, sin Next.js). Si en `pruebas`
// estuvieran en public/, cada cambio público que baja de `main` a `pruebas` (regla 8)
// chocaría al fusionar. Así los dos lados siguen teniendo los ficheros en el mismo sitio
// y public/ es solo un paso de compilación (está en .gitignore).
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';

const DESTINO = 'public';
const CARPETAS = ['css', 'js', 'images', 'blog'];
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
// El service worker de las maquetas (PWA del portal) guardaba en el navegador CUALQUIER
// página del dominio, también el panel real, los PDF y las exportaciones de datos, sin
// caducar ni borrarse al salir. En la plataforma se publica en su lugar uno que se
// desinstala solo y borra esas cachés (revisión de seguridad 2026-11-05). El sw.js de la
// raíz (web pública y maquetas) no se toca.
writeFileSync(`${DESTINO}/sw.js`, `// Desinstalador: borra las cachés del antiguo service worker y se da de baja.
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys()
    .then(function (ks) { return Promise.all(ks.map(function (k) { return caches.delete(k); })); })
    .then(function () { return self.registration.unregister(); })
    .then(function () { return self.clients.matchAll({ type: 'window' }); })
    .then(function (cs) { cs.forEach(function (c) { c.navigate(c.url); }); }));
});
`);
console.log(`[copiar-estaticos] ${n} elementos de la web publica copiados a ${DESTINO}/`);
