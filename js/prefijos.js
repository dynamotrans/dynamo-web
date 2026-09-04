/* ============================================================================
   PREFIJOS TELEFÓNICOS MUNDIALES — selector buscable y LOCALIZADO
   ----------------------------------------------------------------------------
   Componente reutilizable (aceptar-carga, registro, dashboard…): sustituye un
   <select> de prefijo por un desplegable con TODOS los prefijos del mundo, con
   buscador por nombre de país o por código, y con los nombres de país en el
   IDIOMA ACTIVO de la plataforma (Intl.DisplayNames + cookie googtrans). La
   bandera es un emoji derivado del código ISO-3166 (sin depender de imágenes).
   API:  Prefijos.montar(selectEl)   ·   Prefijos.set(idOrEl, '+34')
   ============================================================================ */
(function () {
    'use strict';
    if (window.Prefijos) return;

    // ISO-3166 alpha-2 → prefijo telefónico E.164 (código de país). Cubre los
    // ~200 países/territorios con marcación propia. Para +1 y otros compartidos
    // el nombre localizado los distingue en la lista.
    var CC_DIAL = {
        AF:'+93', AL:'+355', DZ:'+213', AD:'+376', AO:'+244', AG:'+1', AR:'+54', AM:'+374', AU:'+61', AT:'+43', AZ:'+994',
        BS:'+1', BH:'+973', BD:'+880', BB:'+1', BY:'+375', BE:'+32', BZ:'+501', BJ:'+229', BT:'+975', BO:'+591', BA:'+387', BW:'+267', BR:'+55', BN:'+673', BG:'+359', BF:'+226', BI:'+257',
        KH:'+855', CM:'+237', CA:'+1', CV:'+238', CF:'+236', TD:'+235', CL:'+56', CN:'+86', CO:'+57', KM:'+269', CG:'+242', CD:'+243', CR:'+506', CI:'+225', HR:'+385', CU:'+53', CY:'+357', CZ:'+420',
        DK:'+45', DJ:'+253', DM:'+1', DO:'+1',
        EC:'+593', EG:'+20', SV:'+503', GQ:'+240', ER:'+291', EE:'+372', SZ:'+268', ET:'+251',
        FJ:'+679', FI:'+358', FR:'+33',
        GA:'+241', GM:'+220', GE:'+995', DE:'+49', GH:'+233', GR:'+30', GD:'+1', GT:'+502', GN:'+224', GW:'+245', GY:'+592',
        HT:'+509', HN:'+504', HU:'+36',
        IS:'+354', IN:'+91', ID:'+62', IR:'+98', IQ:'+964', IE:'+353', IL:'+972', IT:'+39',
        JM:'+1', JP:'+81', JO:'+962',
        KZ:'+7', KE:'+254', KI:'+686', KP:'+850', KR:'+82', KW:'+965', KG:'+996',
        LA:'+856', LV:'+371', LB:'+961', LS:'+266', LR:'+231', LY:'+218', LI:'+423', LT:'+370', LU:'+352',
        MK:'+389', MG:'+261', MW:'+265', MY:'+60', MV:'+960', ML:'+223', MT:'+356', MH:'+692', MR:'+222', MU:'+230', MX:'+52', FM:'+691', MD:'+373', MC:'+377', MN:'+976', ME:'+382', MA:'+212', MZ:'+258', MM:'+95',
        NA:'+264', NR:'+674', NP:'+977', NL:'+31', NZ:'+64', NI:'+505', NE:'+227', NG:'+234', NO:'+47',
        OM:'+968',
        PK:'+92', PW:'+680', PA:'+507', PG:'+675', PY:'+595', PE:'+51', PH:'+63', PL:'+48', PT:'+351',
        QA:'+974',
        RO:'+40', RU:'+7', RW:'+250',
        KN:'+1', LC:'+1', VC:'+1', WS:'+685', SM:'+378', ST:'+239', SA:'+966', SN:'+221', RS:'+381', SC:'+248', SL:'+232', SG:'+65', SK:'+421', SI:'+386', SB:'+677', SO:'+252', ZA:'+27', SS:'+211', ES:'+34', LK:'+94', SD:'+249', SR:'+597', SE:'+46', CH:'+41', SY:'+963',
        TW:'+886', TJ:'+992', TZ:'+255', TH:'+66', TL:'+670', TG:'+228', TO:'+676', TT:'+1', TN:'+216', TR:'+90', TM:'+993', TV:'+688',
        UG:'+256', UA:'+380', AE:'+971', GB:'+44', US:'+1', UY:'+598', UZ:'+998',
        VU:'+678', VA:'+379', VE:'+58', VN:'+84',
        YE:'+967',
        ZM:'+260', ZW:'+263',
        // Territorios/dependencias frecuentes con código propio.
        HK:'+852', MO:'+853', PR:'+1', GI:'+350', GG:'+44', JE:'+44', IM:'+44', FO:'+298', GL:'+299', XK:'+383'
    };
    // Países que salen ARRIBA (los del mercado de Dynamo), en este orden.
    var PRIORIDAD = ['ES', 'PT', 'FR', 'IT', 'DE', 'NL', 'BE', 'LU', 'AT', 'PL', 'CZ', 'GB', 'IE', 'RO', 'CH'];

    // Idioma activo de la plataforma: cookie googtrans (/es/<lang>) → si no,
    // el del navegador → si no, español.
    function lang() {
        try {
            var m = document.cookie.match(/googtrans=\/[a-z-]+\/([a-z-]+)/i);
            if (m && m[1]) return m[1];
        } catch (e) {}
        return (navigator.language || 'es').slice(0, 2);
    }
    // Bandera emoji a partir del ISO-3166 (dos "regional indicator" letters).
    function bandera(cc) {
        try { return cc.toUpperCase().replace(/./g, function (c) { return String.fromCodePoint(0x1F1E6 + c.charCodeAt(0) - 65); }); }
        catch (e) { return ''; }
    }
    // Nombre del país en el idioma activo. Intl.DisplayNames existe en todos los
    // navegadores modernos; si falla, se muestra el código.
    var _dn = {};
    function nombrePais(cc, lg) {
        try {
            if (!_dn[lg]) _dn[lg] = new Intl.DisplayNames([lg], { type: 'region' });
            return _dn[lg].of(cc) || cc;
        } catch (e) { return cc; }
    }
    // Normaliza para buscar (minúsculas, sin acentos).
    function norm(s) {
        s = String(s || '').toLowerCase();
        return s.normalize ? s.normalize('NFD').replace(/[̀-ͯ]/g, '') : s;
    }
    var TXT = {
        es: { buscar: 'Buscar país o prefijo…', hab: 'Más habituales', todos: 'Todos los países', sin: 'Sin resultados' },
        en: { buscar: 'Search country or code…', hab: 'Most common', todos: 'All countries', sin: 'No results' },
        pt: { buscar: 'Procurar país ou prefixo…', hab: 'Mais comuns', todos: 'Todos os países', sin: 'Sem resultados' },
        fr: { buscar: 'Rechercher pays ou indicatif…', hab: 'Les plus courants', todos: 'Tous les pays', sin: 'Aucun résultat' },
        de: { buscar: 'Land oder Vorwahl suchen…', hab: 'Häufigste', todos: 'Alle Länder', sin: 'Keine Treffer' },
        it: { buscar: 'Cerca paese o prefisso…', hab: 'Più comuni', todos: 'Tutti i paesi', sin: 'Nessun risultato' }
    };
    function txt(lg) { return TXT[lg] || TXT.es; }

    // CSS (una sola vez).
    (function css() {
        if (document.getElementById('prefijos-css')) return;
        var s = document.createElement('style'); s.id = 'prefijos-css';
        s.textContent =
            '.pref-wrap{position:relative;flex:none;}' +
            '.pref-btn{display:flex;align-items:center;gap:0.4rem;width:118px;height:100%;min-height:44px;background:#fff;border:1.5px solid var(--gray-300,#d7dae2);border-radius:10px;padding:0 0.55rem;font:inherit;font-weight:700;color:var(--navy,#12143a);cursor:pointer;line-height:1;}' +
            '.pref-btn:hover{border-color:var(--purple,#3300cc);}' +
            '.pref-btn .pf-flag{font-size:1.15rem;}' +
            '.pref-btn .pf-code{flex:1;text-align:left;}' +
            '.pref-btn .pf-chev{font-size:0.7rem;color:var(--gray-500,#8b90a0);}' +
            '.pref-pop{position:absolute;z-index:60;top:calc(100% + 5px);left:0;width:300px;max-width:92vw;background:#fff;border:1.5px solid var(--gray-200,#e6e8ee);border-radius:12px;box-shadow:0 16px 40px rgba(10,2,48,0.22);padding:0.55rem;}' +
            '.pref-pop[hidden]{display:none;}' +
            '.pref-search{width:100%;height:40px;border:1.5px solid var(--gray-300,#d7dae2);border-radius:9px;padding:0 0.7rem;font:inherit;font-size:16px;margin-bottom:0.45rem;box-sizing:border-box;}' +
            '.pref-search:focus{outline:none;border-color:var(--purple,#3300cc);}' +
            '.pref-list{list-style:none;margin:0;padding:0;max-height:280px;overflow-y:auto;}' +
            '.pref-list .pf-grp{font-size:0.7rem;font-weight:800;letter-spacing:0.4px;text-transform:uppercase;color:var(--gray-500,#8b90a0);padding:0.4rem 0.5rem 0.2rem;}' +
            '.pref-item{display:flex;align-items:center;gap:0.55rem;width:100%;background:none;border:none;border-radius:8px;padding:0.5rem 0.55rem;font:inherit;color:var(--navy,#12143a);cursor:pointer;text-align:left;}' +
            '.pref-item:hover,.pref-item.act{background:rgba(51,0,204,0.07);}' +
            '.pref-item .pf-flag{font-size:1.2rem;flex:none;}' +
            '.pref-item .pf-name{flex:1;font-weight:600;}' +
            '.pref-item .pf-dial{color:var(--gray-500,#8b90a0);font-weight:700;}' +
            '.pref-empty{padding:0.6rem 0.5rem;color:var(--gray-500,#8b90a0);font-size:0.85rem;}';
        document.head.appendChild(s);
    })();

    var registro = {};   // id → API interna (para Prefijos.set)

    function montar(sel, opts) {
        if (!sel || !sel.parentNode) return;
        opts = opts || {};
        var id = sel.id || ('pref-' + Math.round(performance ? performance.now() : 0));
        var actual = sel.value || opts.def || '+34';
        var lg = lang();
        var T = txt(lg);

        // Lista de países ordenada: prioridad primero, resto alfabético por
        // nombre localizado.
        var todos = Object.keys(CC_DIAL).map(function (cc) {
            return { cc: cc, dial: CC_DIAL[cc], nombre: nombrePais(cc, lg) };
        });
        var pri = [];
        PRIORIDAD.forEach(function (cc) { var f = null; todos.forEach(function (x) { if (x.cc === cc) f = x; }); if (f) pri.push(f); });
        var resto = todos.filter(function (x) { return PRIORIDAD.indexOf(x.cc) < 0; })
            .sort(function (a, b) { return a.nombre.localeCompare(b.nombre, lg); });

        // Estructura DOM.
        var wrap = document.createElement('div'); wrap.className = 'pref-wrap';
        var hidden = document.createElement('input'); hidden.type = 'hidden'; hidden.value = actual;
        var btn = document.createElement('button'); btn.type = 'button'; btn.className = 'pref-btn'; btn.setAttribute('aria-haspopup', 'listbox');
        var pop = document.createElement('div'); pop.className = 'pref-pop'; pop.hidden = true;
        pop.innerHTML = '<input type="text" class="pref-search" placeholder="' + T.buscar + '" autocomplete="off"><ul class="pref-list"></ul>';
        sel.id = ''; hidden.id = id;                    // el id pasa al input oculto
        sel.parentNode.insertBefore(wrap, sel);
        wrap.appendChild(hidden); wrap.appendChild(btn); wrap.appendChild(pop);
        sel.parentNode.removeChild(sel);

        var search = pop.querySelector('.pref-search');
        var list = pop.querySelector('.pref-list');

        function ccDe(dial) { for (var i = 0; i < todos.length; i++) if (todos[i].dial === dial) return todos[i].cc; return ''; }
        function pintaBtn() {
            var cc = ccDe(hidden.value);
            btn.innerHTML = '<span class="pf-flag" aria-hidden="true">' + bandera(cc) + '</span><span class="pf-code">' + escapeH(hidden.value) + '</span><span class="pf-chev" aria-hidden="true">▾</span>';
        }
        function itemHTML(x, sel2) {
            return '<li><button type="button" class="pref-item' + (sel2 ? ' act' : '') + '" data-dial="' + x.dial + '" data-cc="' + x.cc + '">' +
                '<span class="pf-flag" aria-hidden="true">' + bandera(x.cc) + '</span>' +
                '<span class="pf-name">' + escapeH(x.nombre) + '</span>' +
                '<span class="pf-dial">' + escapeH(x.dial) + '</span></button></li>';
        }
        function render(q) {
            q = norm(q);
            var html = '';
            function filtra(arr) { return arr.filter(function (x) { return !q || norm(x.nombre).indexOf(q) >= 0 || x.dial.replace('+', '').indexOf(q.replace('+', '')) >= 0 || x.cc.toLowerCase() === q; }); }
            var fp = filtra(pri), fr = filtra(resto);
            if (fp.length) { html += '<li class="pf-grp">' + T.hab + '</li>' + fp.map(function (x) { return itemHTML(x, x.dial === hidden.value); }).join(''); }
            if (fr.length) { html += '<li class="pf-grp">' + T.todos + '</li>' + fr.map(function (x) { return itemHTML(x, x.dial === hidden.value); }).join(''); }
            if (!fp.length && !fr.length) html = '<li class="pref-empty">' + T.sin + '</li>';
            list.innerHTML = html;
        }
        function abrir() {
            render('');
            pop.hidden = false;
            search.value = '';
            setTimeout(function () { search.focus(); }, 30);
        }
        function cerrar() { pop.hidden = true; }
        function elegir(dial) { hidden.value = dial; pintaBtn(); cerrar(); hidden.dispatchEvent(new Event('change', { bubbles: true })); btn.focus(); }

        btn.addEventListener('click', function (e) { e.stopPropagation(); if (pop.hidden) abrir(); else cerrar(); });
        search.addEventListener('input', function () { render(search.value); });
        search.addEventListener('click', function (e) { e.stopPropagation(); });
        list.addEventListener('click', function (e) {
            var it = e.target.closest ? e.target.closest('.pref-item') : null;
            if (it) elegir(it.getAttribute('data-dial'));
        });
        document.addEventListener('click', function (e) { if (!wrap.contains(e.target)) cerrar(); });
        document.addEventListener('keydown', function (e) { if (e.key === 'Escape') cerrar(); });

        pintaBtn();
        registro[id] = { set: function (dial) { hidden.value = dial; pintaBtn(); } };
        return registro[id];
    }
    function set(idOrEl, dial) {
        var id = (typeof idOrEl === 'string') ? idOrEl : (idOrEl && idOrEl.id);
        if (registro[id]) registro[id].set(dial);
        else { var el = document.getElementById(id); if (el) el.value = dial; }
    }
    function escapeH(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

    window.Prefijos = { montar: montar, set: set, lang: lang, CC_DIAL: CC_DIAL };
})();
