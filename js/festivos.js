/* =========================================================================
   FESTIVOS — registro único compartido (web pública + portal).
   Festivos NACIONALES de los 12 países donde Dynamo da servicio:
   España, Portugal, Francia, Alemania, Italia, Suiza, Países Bajos,
   Bélgica, Luxemburgo, Austria, Polonia y República Checa.

   ⚠ Cobertura NACIONAL (orientativa). NO incluye festivos autonómicos/
   regionales ni locales (municipales), que cambian cada año por región/
   municipio. Para esa cobertura fina se conectaría una API (p.ej. Nager.Date).

   Uso:
     FESTIVOS.get('es', new Date())            -> nombre del festivo o null
     FESTIVOS.countryName('fr')                -> 'Francia'
     FESTIVOS.easterSunday(2026)               -> Date (Domingo de Pascua)
   ========================================================================= */
window.FESTIVOS = (function () {
    // Computus de Gauss — Domingo de Pascua del año dado.
    function easterSunday(year) {
        var a = year % 19, b = Math.floor(year / 100), c = year % 100,
            d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25),
            g = Math.floor((b - f + 1) / 3),
            h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4,
            l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451),
            month = Math.floor((h + l - 7 * m + 114) / 31),
            day = ((h + l - 7 * m + 114) % 31) + 1;
        return new Date(year, month - 1, day);
    }
    function key(d) { return (d.getMonth() + 1) + '-' + d.getDate(); }

    // Offsets desde el Domingo de Pascua (0) para los móviles.
    var EO = { holyThu: -3, goodFri: -2, easterSun: 0, easterMon: 1, ascension: 39, whitSun: 49, whitMon: 50, corpus: 60 };

    var COUNTRY_NAMES = {
        es: 'España', pt: 'Portugal', fr: 'Francia', de: 'Alemania', it: 'Italia',
        ch: 'Suiza', nl: 'Países Bajos', be: 'Bélgica', lu: 'Luxemburgo',
        at: 'Austria', pl: 'Polonia', cz: 'República Checa'
    };

    // Festivos por país: fixed { 'M-D': nombre } + easter [{off, name}].
    var DATA = {
        es: {
            fixed: { '1-1': 'Año Nuevo', '1-6': 'Reyes', '5-1': 'Día del Trabajo', '8-15': 'Asunción', '10-12': 'Fiesta Nacional', '11-1': 'Todos los Santos', '12-6': 'Constitución', '12-8': 'Inmaculada', '12-25': 'Navidad' },
            easter: [['holyThu', 'Jueves Santo'], ['goodFri', 'Viernes Santo']]
        },
        pt: {
            fixed: { '1-1': 'Año Nuevo', '4-25': 'Día de la Libertad', '5-1': 'Día del Trabajo', '6-10': 'Día de Portugal', '8-15': 'Asunción', '10-5': 'Día de la República', '11-1': 'Todos los Santos', '12-1': 'Restauración', '12-8': 'Inmaculada', '12-25': 'Navidad' },
            easter: [['goodFri', 'Viernes Santo'], ['easterSun', 'Pascua'], ['corpus', 'Corpus Christi']]
        },
        fr: {
            fixed: { '1-1': 'Año Nuevo', '5-1': 'Día del Trabajo', '5-8': 'Victoria 1945', '7-14': 'Fiesta Nacional', '8-15': 'Asunción', '11-1': 'Todos los Santos', '11-11': 'Armisticio', '12-25': 'Navidad' },
            easter: [['easterMon', 'Lunes de Pascua'], ['ascension', 'Ascensión'], ['whitMon', 'Lunes de Pentecostés']]
        },
        de: {
            fixed: { '1-1': 'Año Nuevo', '5-1': 'Día del Trabajo', '10-3': 'Unidad Alemana', '12-25': 'Navidad', '12-26': 'San Esteban' },
            easter: [['goodFri', 'Viernes Santo'], ['easterMon', 'Lunes de Pascua'], ['ascension', 'Ascensión'], ['whitMon', 'Lunes de Pentecostés']]
        },
        it: {
            fixed: { '1-1': 'Año Nuevo', '1-6': 'Epifanía', '4-25': 'Liberación', '5-1': 'Día del Trabajo', '6-2': 'Día de la República', '8-15': 'Ferragosto', '11-1': 'Todos los Santos', '12-8': 'Inmaculada', '12-25': 'Navidad', '12-26': 'San Esteban' },
            easter: [['easterMon', 'Lunes de Pascua']]
        },
        ch: {
            fixed: { '1-1': 'Año Nuevo', '8-1': 'Fiesta Nacional', '12-25': 'Navidad' },
            easter: [['goodFri', 'Viernes Santo'], ['easterMon', 'Lunes de Pascua'], ['ascension', 'Ascensión'], ['whitMon', 'Lunes de Pentecostés']]
        },
        nl: {
            fixed: { '1-1': 'Año Nuevo', '4-27': 'Día del Rey', '12-25': 'Navidad', '12-26': '2º día de Navidad' },
            easter: [['easterSun', 'Pascua'], ['easterMon', 'Lunes de Pascua'], ['ascension', 'Ascensión'], ['whitSun', 'Pentecostés'], ['whitMon', 'Lunes de Pentecostés']]
        },
        be: {
            fixed: { '1-1': 'Año Nuevo', '5-1': 'Día del Trabajo', '7-21': 'Fiesta Nacional', '8-15': 'Asunción', '11-1': 'Todos los Santos', '11-11': 'Armisticio', '12-25': 'Navidad' },
            easter: [['easterMon', 'Lunes de Pascua'], ['ascension', 'Ascensión'], ['whitMon', 'Lunes de Pentecostés']]
        },
        lu: {
            fixed: { '1-1': 'Año Nuevo', '5-1': 'Día del Trabajo', '5-9': 'Día de Europa', '6-23': 'Fiesta Nacional', '8-15': 'Asunción', '11-1': 'Todos los Santos', '12-25': 'Navidad', '12-26': 'San Esteban' },
            easter: [['easterMon', 'Lunes de Pascua'], ['ascension', 'Ascensión'], ['whitMon', 'Lunes de Pentecostés']]
        },
        at: {
            fixed: { '1-1': 'Año Nuevo', '1-6': 'Epifanía', '5-1': 'Día del Trabajo', '8-15': 'Asunción', '10-26': 'Fiesta Nacional', '11-1': 'Todos los Santos', '12-8': 'Inmaculada', '12-25': 'Navidad', '12-26': 'San Esteban' },
            easter: [['easterMon', 'Lunes de Pascua'], ['ascension', 'Ascensión'], ['whitMon', 'Lunes de Pentecostés'], ['corpus', 'Corpus Christi']]
        },
        pl: {
            fixed: { '1-1': 'Año Nuevo', '1-6': 'Epifanía', '5-1': 'Día del Trabajo', '5-3': 'Día de la Constitución', '8-15': 'Asunción', '11-1': 'Todos los Santos', '11-11': 'Independencia', '12-25': 'Navidad', '12-26': '2º día de Navidad' },
            easter: [['easterSun', 'Pascua'], ['easterMon', 'Lunes de Pascua'], ['whitSun', 'Pentecostés'], ['corpus', 'Corpus Christi']]
        },
        cz: {
            fixed: { '1-1': 'Año Nuevo', '5-1': 'Día del Trabajo', '5-8': 'Día de la Liberación', '7-5': 'Cirilo y Metodio', '7-6': 'Jan Hus', '9-28': 'Día del Estado', '10-28': 'Independencia', '11-17': 'Lucha por la Libertad', '12-24': 'Nochebuena', '12-25': 'Navidad', '12-26': 'San Esteban' },
            easter: [['goodFri', 'Viernes Santo'], ['easterMon', 'Lunes de Pascua']]
        }
    };

    // Festivo NACIONAL local del país `cc` en la fecha `date` → nombre o null.
    // Esta es la fuente de la verdad: instantánea, offline, siempre disponible.
    function getLocal(cc, date) {
        cc = (cc || '').toLowerCase();
        var c = DATA[cc];
        if (!c || !date) return null;
        var f = c.fixed[key(date)];
        if (f) return f;
        var e = easterSunday(date.getFullYear());
        var ds = date.toDateString();
        for (var j = 0; j < c.easter.length; j++) {
            var off = EO[c.easter[j][0]];
            var hd = new Date(e); hd.setDate(e.getDate() + off);
            if (hd.toDateString() === ds) return c.easter[j][1];
        }
        return null;
    }

    /* -----------------------------------------------------------------
       CAPA OPCIONAL — enriquecer con festivos REGIONALES vía Nager.Date.
       Se llama desde el front (navegador) con FESTIVOS.ensure(cc, year).
       - Dedupe: solo se guardan fechas que NO estén ya en el local
         (Navidad, Año Nuevo… nunca se duplican → manda el local).
       - Los regionales se etiquetan "(regional)" porque solo conocemos
         el PAÍS, no la provincia exacta: puede no aplicar a la zona.
       - Caché en localStorage 30 días por país+año (1 sola petición).
       - Si la API falla / no hay red / CORS → se ignora y queda el local
         (degradación limpia: el aviso es informativo, no bloquea nada).
       ----------------------------------------------------------------- */
    var apiCache = {}; // apiCache[cc][year] = { 'M-D': 'Nombre (regional)' }

    function ensure(cc, year) {
        cc = (cc || '').toLowerCase();
        if (!cc || !year || !DATA[cc]) return Promise.resolve({});
        if (!apiCache[cc]) apiCache[cc] = {};
        if (apiCache[cc][year]) return Promise.resolve(apiCache[cc][year]);
        var lsKey = 'festivos_api_' + cc + '_' + year;
        try {
            var raw = localStorage.getItem(lsKey);
            if (raw) {
                var o = JSON.parse(raw);
                if (o && o.exp > Date.now() && o.map) { apiCache[cc][year] = o.map; return Promise.resolve(o.map); }
            }
        } catch (e) {}
        if (typeof fetch !== 'function') { apiCache[cc][year] = {}; return Promise.resolve({}); }
        var url = 'https://date.nager.at/api/v3/PublicHolidays/' + year + '/' + cc.toUpperCase();
        return fetch(url)
            .then(function (r) { if (!r.ok) throw 0; return r.json(); })
            .then(function (list) {
                var map = {};
                (list || []).forEach(function (h) {
                    if (!h || !h.date) return;
                    var p = h.date.split('-');
                    var d = new Date(+p[0], +p[1] - 1, +p[2]);
                    if (getLocal(cc, d)) return;          // ya está en el local → no duplicar
                    var k = key(d);
                    if (map[k]) return;                   // primera ocurrencia del día
                    var nm = h.localName || h.name || 'Festivo';
                    if (h.global === false) nm += ' (regional)';
                    map[k] = nm;
                });
                apiCache[cc][year] = map;
                try { localStorage.setItem(lsKey, JSON.stringify({ exp: Date.now() + 2592000000, map: map })); } catch (e) {}
                return map;
            })
            .catch(function () { apiCache[cc][year] = {}; return {}; });
    }

    // Festivo del país `cc` en `date` → nombre o null.
    // Local (nacional) primero; si no, regional cacheado de la API.
    function get(cc, date) {
        cc = (cc || '').toLowerCase();
        var local = getLocal(cc, date);
        if (local) return local;
        if (!date) return null;
        var ext = apiCache[cc] && apiCache[cc][date.getFullYear()];
        return (ext && ext[key(date)]) || null;
    }

    function countryName(cc) { return COUNTRY_NAMES[(cc || '').toLowerCase()] || cc || ''; }
    function supported(cc) { return !!DATA[(cc || '').toLowerCase()]; }

    return { get: get, getLocal: getLocal, ensure: ensure, countryName: countryName, supported: supported, easterSunday: easterSunday };
})();
