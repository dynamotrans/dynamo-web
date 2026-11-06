/* ==========================================================================
   Mapa de cobertura — hoja de seccion /cobertura
   --------------------------------------------------------------------------
   Version ESTATICA del mapa de la portada: pinta los paises cubiertos y
   encuadra la vista sobre ellos. Sin la animacion Espana->Europa ni las
   rutas en movimiento, que son el numero de la portada y aqui solo
   pesarian: esta es una pagina de aterrizaje y tiene que abrir rapido.

   El SVG (/images/europa-map.svg) pesa ~700 KB y se pide DESPUES de que la
   pagina este pintada, solo si existe el contenedor. El resto de hojas de
   seccion cargan este fichero (2 KB) y no hacen nada.

   La lista de paises debe coincidir con COVERED en index.html y con PAISES
   en tools/generar-hojas-seccion.py. Si se anade un pais, tocar los tres.
   ========================================================================== */
(function () {
    'use strict';

    var CUBIERTOS = ['es','pt','fr','de','pl','it','nl','be','at','cz','lu','ie','dk'];
    // Irlanda del Norte es un path aparte dentro del grupo gb del SVG. Se
    // pinta junto a la Republica para que se vea la isla entera, pero no se
    // lista como pais aparte en los textos.
    var EXTRA = ['gb-nir'];

    function init() {
        var caja = document.getElementById('lp-mapa-box');
        if (!caja) return;

        fetch('/images/europa-map.svg')
            .then(function (r) {
                if (!r.ok) throw new Error('HTTP ' + r.status);
                return r.text();
            })
            .then(function (svg) {
                caja.insertAdjacentHTML('afterbegin', svg);
                var el = caja.querySelector('svg');
                if (!el) throw new Error('sin svg');

                el.setAttribute('role', 'img');
                el.setAttribute('aria-label',
                    'Mapa de Europa con los paises donde Dynamo presta servicio resaltados');

                var marcar = CUBIERTOS.concat(EXTRA);
                var pintados = [];
                marcar.forEach(function (id) {
                    var p = el.querySelector('path[id="' + id + '"]');
                    if (p) { p.classList.add('cubierto'); pintados.push(p); }
                });

                // Encuadre: ajustamos la vista a los paises cubiertos para que
                // no sobre medio continente ni se estire hacia el norte de
                // Africa. Si getBBox falla (SVG oculto), se deja el viewBox
                // original, que tambien se ve bien.
                try {
                    var x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
                    pintados.forEach(function (p) {
                        var b = p.getBBox();
                        if (!b.width && !b.height) return;
                        x1 = Math.min(x1, b.x);        y1 = Math.min(y1, b.y);
                        x2 = Math.max(x2, b.x + b.width); y2 = Math.max(y2, b.y + b.height);
                    });
                    if (isFinite(x1) && x2 > x1 && y2 > y1) {
                        var mx = (x2 - x1) * 0.04, my = (y2 - y1) * 0.04;
                        el.setAttribute('viewBox',
                            (x1 - mx) + ' ' + (y1 - my) + ' ' +
                            (x2 - x1 + mx * 2) + ' ' + (y2 - y1 + my * 2));
                        el.removeAttribute('width');
                        el.removeAttribute('height');
                    }
                } catch (e) { /* nos quedamos con el viewBox del fichero */ }

                caja.classList.add('listo');
            })
            .catch(function () {
                // Sin mapa la pagina sigue sirviendo: debajo estan las listas
                // de provincias y paises, que son el dato de verdad.
                caja.classList.add('fallo');
                var aviso = caja.querySelector('.lp-mapa-cargando');
                if (aviso) aviso.textContent =
                    'No se ha podido cargar el mapa. Justo debajo tienes el listado completo.';
            });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
