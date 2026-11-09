/* ==========================================================================
   FAB de contacto (avatar de Álvaro) — hojas de sección
   --------------------------------------------------------------------------
   Abre/cierra el abanico de canales y mantiene al día la línea de estado
   del chip ("En línea" / "He salido · Vuelvo ...").

   Horario ONLINE (email y WhatsApp): L-V 8:00-18:00, hora de Madrid,
   festivos nacionales excluidos. Mismos valores que index.html.

   Necesita /js/festivos.js cargado antes para saltarse los festivos; si no
   está, degrada solo a días laborables (nunca falla).

   OJO: el componente vive duplicado en index.html (CSS + HTML + JS inline).
   Si se cambia el horario o los textos aquí, cambiarlos también allí.
   ========================================================================== */
(function () {
    'use strict';

    var ONLINE_OPEN = 8, ONLINE_CLOSE = 18;

    // Hora real en Sevilla (Europe/Madrid, gestiona el cambio de hora solo)
    function getNow() {
        return new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Madrid' }));
    }
    function esFestivo(date) {
        try { return window.FESTIVOS ? window.FESTIVOS.get('es', date) : null; }
        catch (e) { return null; }
    }
    function esLaborable(date) {
        var d = date.getDay();
        return d !== 0 && d !== 6 && !esFestivo(date);
    }
    function isOnlineHoursNow() {
        var now = getNow();
        if (!esLaborable(now)) return false;
        var h = now.getHours();
        return h >= ONLINE_OPEN && h < ONLINE_CLOSE;
    }
    // Próximo momento online: hoy si aún no ha abierto, si no el siguiente laborable
    function formatTimeUntilOnline() {
        var cur = getNow();
        for (var i = 0; i < 10; i++) {
            if (esLaborable(cur) && (i > 0 || cur.getHours() < ONLINE_OPEN)) {
                var dias = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
                var cuando = (i === 0) ? 'hoy' : 'el ' + dias[cur.getDay()];
                return cuando + ' a las ' + ONLINE_OPEN + ':00';
            }
            cur.setDate(cur.getDate() + 1);
            cur.setHours(0, 0, 0, 0);
        }
        return 'en cuanto abramos';
    }
    function syncOnlineStatus() {
        var online = isOnlineHoursNow();
        var txt = online
            ? 'En línea · Respondo enseguida'
            : 'He salido · Vuelvo ' + formatTimeUntilOnline();
        document.querySelectorAll('.contact-fab-name-status').forEach(function (el) {
            el.textContent = txt;
            el.classList.toggle('offline', !online);
        });
    }

    function init() {
        var wrap = document.getElementById('contactFab');
        if (!wrap) return;
        var btn = document.getElementById('contactFabBtn');
        if (!btn) return;

        var backTop = document.getElementById('backTop');
        function open()   { wrap.classList.add('open');    btn.setAttribute('aria-expanded', 'true');  if (backTop) backTop.classList.add('fab-hidden'); }
        function close()  { wrap.classList.remove('open'); btn.setAttribute('aria-expanded', 'false'); if (backTop) backTop.classList.remove('fab-hidden'); }
        function toggle() { wrap.classList.contains('open') ? close() : open(); }

        btn.addEventListener('click', function (e) { e.stopPropagation(); toggle(); });

        // Cerrar al elegir un canal
        wrap.querySelectorAll('.contact-fab-action').forEach(function (a) {
            a.addEventListener('click', close);
        });
        // Cerrar al pulsar fuera
        document.addEventListener('click', function (e) {
            if (wrap.classList.contains('open') && !wrap.contains(e.target)) close();
        });
        // Cerrar con Escape
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && wrap.classList.contains('open')) { close(); btn.focus(); }
        });

        syncOnlineStatus();
        setInterval(syncOnlineStatus, 60000);
    }

    // Botón "volver arriba" (solo en las páginas que tienen #backTop, p. ej. el blog).
    // Igual que en index.html: aparece tras 600px de scroll y en táctil actúa
    // al primer toque (evita el "click fantasma" de iOS).
    function initBackTop() {
        var b = document.getElementById('backTop');
        if (!b) return;
        function sync() { b.classList.toggle('show', window.scrollY > 600); }
        function up() { window.scrollTo({ top: 0, behavior: 'smooth' }); }
        window.addEventListener('scroll', sync, { passive: true });
        b.addEventListener('click', up);
        b.addEventListener('touchend', function (e) { e.preventDefault(); up(); }, { passive: false });
        sync();
    }

    function start() { init(); initBackTop(); }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start);
    } else {
        start();
    }
})();
