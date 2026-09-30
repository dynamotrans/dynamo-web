/* Service worker del Portal Dynamo (PWA).
 *
 * Estrategia: NETWORK-FIRST con respaldo a caché. Como el portal es un mockup
 * que cambia a menudo, SIEMPRE se intenta la red primero (para ver la última
 * versión) y solo se sirve de caché si no hay conexión — así nunca queda una
 * pantalla vieja "pegada". La caché del shell permite que la app abra estando
 * sin conexión, como una aplicación instalada.
 *
 * Ámbito: se sirve desde la raíz (/sw.js) → controla todo el origen.
 */
var CACHE = 'dynamo-portal-v1';
var SHELL = [
    '/portal.html',
    '/dashboard.html',
    '/registro.html',
    '/verificar.html',
    '/crear-password.html',
    '/manifest.webmanifest',
    '/images/icon-192.png',
    '/images/icon-512.png',
    '/images/icon-maskable-512.png'
];

self.addEventListener('install', function (e) {
    // Precarga del shell. addAll es atómico: si algún recurso fallara, no
    // rompemos la instalación → se cachea uno a uno con captura de error.
    e.waitUntil(
        caches.open(CACHE).then(function (c) {
            return Promise.all(SHELL.map(function (u) {
                return c.add(u).catch(function () { /* recurso opcional: se ignora */ });
            }));
        }).then(function () { return self.skipWaiting(); })
    );
});

self.addEventListener('activate', function (e) {
    // Limpia versiones antiguas de la caché y toma control inmediato.
    e.waitUntil(
        caches.keys().then(function (keys) {
            return Promise.all(keys.filter(function (k) { return k !== CACHE; })
                .map(function (k) { return caches.delete(k); }));
        }).then(function () { return self.clients.claim(); })
    );
});

self.addEventListener('fetch', function (e) {
    var req = e.request;
    if (req.method !== 'GET') return;                    // solo GET
    var sameOrigin = new URL(req.url).origin === self.location.origin;
    e.respondWith(
        fetch(req).then(function (res) {
            // Cachea copia de recursos propios para el modo sin conexión.
            if (sameOrigin && res && res.status === 200) {
                var copy = res.clone();
                caches.open(CACHE).then(function (c) { c.put(req, copy); }).catch(function () {});
            }
            return res;
        }).catch(function () {
            // Sin red: sirve de caché; para navegaciones, respaldo al login.
            return caches.match(req).then(function (r) {
                if (r) return r;
                if (req.mode === 'navigate') return caches.match('/portal.html');
                return Response.error();
            });
        })
    );
});
