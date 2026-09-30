/* ===========================================================
   idiomas.js — selector de idiomas ÚNICO de todo el sitio
   ===========================================================
   Lo usan index.html y las hojas de sección (/grupajes, /contacto…).
   Aquí viven, EN UN SOLO SITIO:
     · la lista de idiomas (LANGS): añadir o quitar uno aquí lo
       cambia en TODAS las páginas a la vez,
     · el HTML del botón y del desplegable (se pinta solo),
     · el motor de Google Translate y la cookie `googtrans`,
     · la autodetección del idioma del navegador en la 1ª visita.

   Cómo se usa en una página:
     <link rel="stylesheet" href="/css/idiomas.css">
     <div class="lang-selector notranslate" translate="no" data-lang-selector></div>
     <script defer src="/js/idiomas.js"></script>

   La cookie `googtrans` va en path=/ , así que el idioma elegido
   se conserva al saltar entre la home, las hojas de sección y el portal.
   =========================================================== */
(function () {
'use strict';

var BANDERA_CA = '<svg class="flag-svg" viewBox="0 0 24 16" aria-hidden="true"><rect width="24" height="16" fill="#fcdd09"/><rect y="1.78" width="24" height="1.78" fill="#da121a"/><rect y="5.33" width="24" height="1.78" fill="#da121a"/><rect y="8.89" width="24" height="1.78" fill="#da121a"/><rect y="12.44" width="24" height="1.78" fill="#da121a"/></svg>';
var BANDERA_EU = '<svg class="flag-svg" viewBox="0 0 24 16" aria-hidden="true"><rect width="24" height="16" fill="#d52b1e"/><path d="M0 0 24 16M24 0 0 16" stroke="#009b3a" stroke-width="4.2"/><rect x="10" width="4" height="16" fill="#fff"/><rect y="6" width="24" height="4" fill="#fff"/></svg>';

// ÚNICA lista de idiomas del sitio. El orden es el que se ve en el desplegable.
var LANGS = [
    { lang: 'es',    code: 'ES',  nombre: 'Español',    flag: '🇪🇸' },
    { lang: 'ca',    code: 'CAT', nombre: 'Català',     flag: BANDERA_CA },
    { lang: 'eu',    code: 'EUS', nombre: 'Euskara',    flag: BANDERA_EU },
    { lang: 'pt',    code: 'PT',  nombre: 'Português',  flag: '🇵🇹' },
    { lang: 'en',    code: 'EN',  nombre: 'English',    flag: '🇬🇧' },
    { lang: 'fr',    code: 'FR',  nombre: 'Français',   flag: '🇫🇷' },
    { lang: 'ar',    code: 'AR',  nombre: 'العربية',     flag: '🇸🇦' },
    { lang: 'de',    code: 'DE',  nombre: 'Deutsch',    flag: '🇩🇪' },
    { lang: 'it',    code: 'IT',  nombre: 'Italiano',   flag: '🇮🇹' },
    { lang: 'nl',    code: 'NL',  nombre: 'Nederlands', flag: '🇳🇱' },
    { lang: 'pl',    code: 'PL',  nombre: 'Polski',     flag: '🇵🇱' },
    { lang: 'ro',    code: 'RO',  nombre: 'Română',     flag: '🇷🇴' },
    { lang: 'uk',    code: 'UK',  nombre: 'Українська', flag: '🇺🇦' },
    { lang: 'zh-CN', code: 'ZH',  nombre: '中文',        flag: '🇨🇳' }
];

// langMap = todos menos el español (el español es el idioma base, no una traducción)
var langMap = {};
LANGS.forEach(function (l) { if (l.lang !== 'es') langMap[l.lang] = { flag: l.flag, code: l.code }; });
var INCLUIDOS = LANGS.filter(function (l) { return l.lang !== 'es'; })
                     .map(function (l) { return l.lang; }).join(',');

/* ---------- 1. Pintar el selector ---------- */
function pintarSelector() {
    var cajas = document.querySelectorAll('[data-lang-selector]');
    if (!cajas.length) return;
    var opciones = LANGS.map(function (l) {
        return '<button type="button" class="lang-option' + (l.lang === 'es' ? ' active' : '') +
               '" data-lang="' + l.lang + '"><span class="flag">' + l.flag + '</span> ' + l.nombre + '</button>';
    }).join('');
    cajas.forEach(function (caja, i) {
        // Si hubiera más de un selector en la página, solo el primero lleva los id
        // (el resto funciona igual: los handlers van por clase).
        caja.classList.add('lang-selector', 'notranslate');
        caja.setAttribute('translate', 'no');
        caja.innerHTML =
            '<button type="button" class="lang-btn"' + (i === 0 ? ' id="langBtn"' : '') +
            ' aria-haspopup="true" aria-expanded="false" aria-label="Cambiar idioma">' +
            '<span class="flag">🇪🇸</span> ES <span class="arrow">▼</span></button>' +
            '<div class="lang-dropdown"' + (i === 0 ? ' id="langDropdown"' : '') + '>' + opciones + '</div>';
    });

    // Delegación: vale para cualquier selector de la página, ahora y después
    document.addEventListener('click', function (e) {
        var btn = e.target.closest('.lang-btn');
        if (btn) { toggleLangDropdown(btn); return; }
        var opt = e.target.closest('.lang-option');
        if (opt) {
            var l = opt.getAttribute('data-lang');
            var info = LANGS.filter(function (x) { return x.lang === l; })[0] || {};
            changeLang(l, info.flag, info.code, opt);
            return;
        }
        if (!e.target.closest('.lang-selector')) cerrarTodos();
    });
}

function cerrarTodos() {
    document.querySelectorAll('.lang-dropdown.open').forEach(function (d) { d.classList.remove('open'); });
    document.querySelectorAll('.lang-btn.open').forEach(function (b) {
        b.classList.remove('open'); b.setAttribute('aria-expanded', 'false');
    });
}

function toggleLangDropdown(btn) {
    btn = btn || document.getElementById('langBtn');
    if (!btn) return;
    var dd = btn.parentNode.querySelector('.lang-dropdown');
    var abierto = dd && dd.classList.contains('open');
    cerrarTodos();
    if (dd && !abierto) {
        dd.classList.add('open');
        btn.classList.add('open');
        btn.setAttribute('aria-expanded', 'true');
    }
}

function pintarBoton(lang) {
    var info = langMap[lang];
    if (!info) return;
    document.querySelectorAll('.lang-btn').forEach(function (b) {
        b.innerHTML = '<span class="flag">' + info.flag + '</span> ' + info.code + ' <span class="arrow">▼</span>';
    });
}

/* ---------- 2. Motor de Google Translate ---------- */
var gtLoaded = false, gtReady = false, gtInitTimeout = null;

function loadGoogleTranslate() {
    if (gtLoaded) return;
    gtLoaded = true;
    if (!document.getElementById('google_translate_element')) {
        var d = document.createElement('div');
        d.id = 'google_translate_element';
        d.style.display = 'none';
        document.body.appendChild(d);
    }
    var s = document.createElement('script');
    s.src = 'https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit';
    s.onerror = function () { gtLoaded = false; };
    document.body.appendChild(s);
}

function googleTranslateElementInit() {
    new google.translate.TranslateElement({
        pageLanguage: 'es',
        autoDisplay: false,
        includedLanguages: INCLUIDOS
    }, 'google_translate_element');
    var checkReady = setInterval(function () {
        if (document.querySelector('.goog-te-combo')) { gtReady = true; clearInterval(checkReady); }
    }, 200);
    setTimeout(function () { clearInterval(checkReady); }, 10000);
}

function doTranslate(lang) {
    var sel = document.querySelector('.goog-te-combo');
    if (!sel) return false;
    sel.value = lang;
    sel.dispatchEvent(new Event('change'));
    // Las etiquetas de horario las generamos nosotros (van en notranslate):
    // hay que repintarlas en el idioma nuevo. Solo existe en index.html.
    if (typeof window.applyScheduleLabels === 'function') window.applyScheduleLabels(lang);
    return true;
}

function borrarCookiesGT() {
    var host = location.hostname, parts = host.split('.');
    var domains = ['', host, '.' + host];
    if (parts.length > 2) { var bare = parts.slice(1).join('.'); domains.push(bare, '.' + bare); }
    domains.forEach(function (d) {
        ['/', ''].forEach(function (p) {
            var c = 'googtrans=; expires=Thu, 01 Jan 1970 00:00:00 UTC';
            if (p) c += '; path=' + p;
            if (d) c += '; domain=' + d;
            document.cookie = c;
        });
    });
    return domains;
}

function changeLang(lang, flag, code, opt) {
    document.querySelectorAll('.lang-btn').forEach(function (b) {
        b.innerHTML = '<span class="flag">' + ((langMap[lang] && langMap[lang].flag) || flag) + '</span> ' +
                      code + ' <span class="arrow">▼</span>';
    });
    document.querySelectorAll('.lang-option').forEach(function (o) { o.classList.remove('active'); });
    if (opt) opt.classList.add('active');
    else document.querySelectorAll('.lang-option[data-lang="' + lang + '"]').forEach(function (o) { o.classList.add('active'); });
    cerrarTodos();

    // Volver al español = quitar la traducción (no hay "traducir a español")
    if (lang === 'es') {
        var domains = borrarCookiesGT();
        document.cookie = 'googtrans=/es/es; path=/';
        try {
            var sel = document.querySelector('.goog-te-combo');
            if (sel) { sel.value = 'es'; sel.dispatchEvent(new Event('change')); }
        } catch (e) {}
        try {
            var frame = document.querySelector('iframe.goog-te-banner-frame');
            if (frame && frame.contentDocument) {
                var cerrar = frame.contentDocument.querySelector('.goog-close-link');
                if (cerrar) cerrar.click();
            }
        } catch (e) {}
        setTimeout(function () {
            domains.forEach(function (d) {
                var c = 'googtrans=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/';
                if (d) c += '; domain=' + d;
                document.cookie = c;
            });
            window.location.href = location.pathname + '?lang=es&t=' + Date.now();
        }, 100);
        return;
    }

    var val = '/es/' + lang;
    document.cookie = 'googtrans=' + val + '; path=/';
    document.cookie = 'googtrans=' + val + '; path=/; domain=' + location.hostname;
    document.cookie = 'googtrans=' + val + '; path=/; domain=.' + location.hostname;

    loadGoogleTranslate();
    if (gtReady && doTranslate(lang)) return;

    var intentos = 0;
    if (gtInitTimeout) clearInterval(gtInitTimeout);
    gtInitTimeout = setInterval(function () {
        intentos++;
        if (doTranslate(lang)) { clearInterval(gtInitTimeout); gtInitTimeout = null; }
        else if (intentos >= 16) {           // 16 × 250 ms = 4 s
            clearInterval(gtInitTimeout); gtInitTimeout = null;
            location.reload();               // la cookie ya está puesta: GT traduce al cargar
        }
    }, 250);
}

/* ---------- 3. Al cargar la página ---------- */
function arrancar() {
    pintarSelector();

    // Venimos de "volver a español": limpiar cookies y quitar el ?lang=es
    if (location.search.indexOf('lang=es') > -1) {
        borrarCookiesGT();
        if (history.replaceState) history.replaceState(null, '', location.pathname);
        return;                              // la página ya está en español
    }

    // ¿Ya había un idioma elegido? (cookie compartida con el resto del sitio)
    var m = document.cookie.match(/googtrans=\/es\/([\w-]+)/);
    if (m && m[1] && langMap[m[1]]) {
        var lang = m[1];
        pintarBoton(lang);
        document.querySelectorAll('.lang-option').forEach(function (o) {
            o.classList.toggle('active', o.getAttribute('data-lang') === lang);
        });
        setTimeout(loadGoogleTranslate, 1000);
        // Vigilante: si GT carga pero no aplica la traducción solo, la forzamos
        var n = 0;
        var wd = setInterval(function () {
            n++;
            var puesto = document.documentElement.classList.contains('translated-ltr') ||
                         document.documentElement.classList.contains('translated-rtl');
            if (puesto || n > 20) { clearInterval(wd); return; }
            doTranslate(lang);
        }, 600);
        return;
    }

    // Primera visita: idioma del navegador. Español → se queda igual;
    // idioma soportado → ese; idioma no soportado (ruso, croata…) → inglés.
    if (document.cookie.indexOf('dynamo_lang_detected=') === -1) {
        var nav = (navigator.language || navigator.userLanguage || 'es').toLowerCase().split('-')[0];
        var exp = new Date(); exp.setFullYear(exp.getFullYear() + 1);
        document.cookie = 'dynamo_lang_detected=1; expires=' + exp.toUTCString() + '; path=/; SameSite=Lax';

        var usar = (nav === 'es') ? null : (langMap[nav] ? nav : 'en');
        if (usar) {
            pintarBoton(usar);
            document.querySelectorAll('.lang-option').forEach(function (o) {
                o.classList.toggle('active', o.getAttribute('data-lang') === usar);
            });
            document.cookie = 'googtrans=/es/' + usar + '; path=/';
            document.cookie = 'googtrans=/es/' + usar + '; path=/; domain=' + location.hostname;
            document.cookie = 'googtrans=/es/' + usar + '; path=/; domain=.' + location.hostname;
            setTimeout(function () {
                loadGoogleTranslate();
                var n2 = 0;
                var t = setInterval(function () {
                    n2++;
                    if (doTranslate(usar) || n2 > 40) clearInterval(t);
                }, 250);
            }, 1200);
            return;
        }
    }

    // Por defecto: cargar GT en segundo plano para el cambio manual
    setTimeout(loadGoogleTranslate, 1000);
}

/* ---------- Compatibilidad: index.html llama a estas por su nombre ---------- */
window.googleTranslateElementInit = googleTranslateElementInit;
window.loadGoogleTranslate = loadGoogleTranslate;
window.doTranslate = doTranslate;
window.changeLang = function (lang, flag, code) { changeLang(lang, flag, code, null); };
window.toggleLangDropdown = function () { toggleLangDropdown(null); };
window.langMap = langMap;
window.IDIOMAS = LANGS;

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', arrancar);
else arrancar();
})();
