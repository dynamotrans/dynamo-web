// Validación del documento de identidad de quien firma el CMR (copiada de firmar-cmr.html):
// control ESTRICTO donde el país publica el algoritmo (ES, PT, IT, BE, NL, PL, RO, CZ y DE
// con dígito) y aviso suave donde no lo hay (FR, AT, CH, LU, otros). La usan la pantalla
// (para avisar al teclear) y el SERVIDOR (que es el que decide al guardar la firma).
/* eslint-disable */
export const DOC_PAISES: [string, string][] = [
        ['ES', 'España'], ['PT', 'Portugal'], ['FR', 'Francia'], ['IT', 'Italia'],
        ['DE', 'Alemania'], ['NL', 'Países Bajos'], ['BE', 'Bélgica'], ['LU', 'Luxemburgo'],
        ['AT', 'Austria'], ['PL', 'Polonia'], ['CZ', 'Chequia'], ['CH', 'Suiza'],
        ['RO', 'Rumanía'], ['XX', 'Otro país']
    ];
export function validaDoc(cc: string, raw: string): { ok: boolean; soft?: string; msg?: string; norm: string } {
        var v = String(raw || '').toUpperCase().replace(/[\s.\-]/g, '');
        var OK = { ok: true, norm: v };
        function bad(m: string) { return { ok: false, msg: m, norm: v }; }
        function soft(m?: string) { return { ok: true, soft: m || 'No podemos comprobar la letra de control de este país — revisa el número antes de firmar.', norm: v }; }
        let i: number, s: number;
        if (!v) return bad('');
        if (cc === 'ES') {
            var L = 'TRWAGMYFPDXBNJZSQVHLCKE';
            if (/^\d{8}[A-Z]$/.test(v)) return v[8] === L[+v.slice(0, 8) % 23] ? OK : bad('La letra de control del DNI no corresponde con el número.');
            if (/^[XYZ]\d{7}[A-Z]$/.test(v)) return v[8] === L[+(({ X: '0', Y: '1', Z: '2' } as Record<string, string>)[v[0]] + v.slice(1, 8)) % 23] ? OK : bad('La letra de control del NIE no corresponde con el número.');
            return bad('Formato no válido: DNI (8 dígitos + letra) o NIE (X/Y/Z + 7 dígitos + letra).');
        }
        if (cc === 'PT') {
            if (/^\d{9}$/.test(v)) {   // NIF personal
                s = 0; for (i = 0; i < 8; i++) s += (+v[i]) * (9 - i);
                var c9 = 11 - (s % 11); if (c9 >= 10) c9 = 0;
                return c9 === +v[8] ? OK : bad('El dígito de control del NIF portugués no corresponde.');
            }
            if (/^\d{9}[A-Z0-9]{2}\d$/.test(v)) {   // Cartão de Cidadão completo
                s = 0; var dbl = false;
                for (i = v.length - 1; i >= 0; i--) {
                    var val = (v[i] >= '0' && v[i] <= '9') ? +v[i] : v.charCodeAt(i) - 55;
                    if (dbl) { val *= 2; if (val > 9) val -= 9; }
                    s += val; dbl = !dbl;
                }
                return s % 10 === 0 ? OK : bad('El número del Cartão de Cidadão no es válido.');
            }
            if (/^\d{8}$/.test(v)) return soft();   // BI antiguo, sin control público
            return bad('Formato no válido: NIF (9 dígitos) o Cartão de Cidadão (p. ej. 12345678 9 ZZ0).');
        }
        if (cc === 'IT') {   // Codice Fiscale (16 caracteres con carácter de control)
            if (/^[A-Z0-9]{16}$/.test(v)) {
                const ODD: Record<string, number> = { '0': 1, '1': 0, '2': 5, '3': 7, '4': 9, '5': 13, '6': 15, '7': 17, '8': 19, '9': 21, A: 1, B: 0, C: 5, D: 7, E: 9, F: 13, G: 15, H: 17, I: 19, J: 21, K: 2, L: 4, M: 18, N: 20, O: 11, P: 3, Q: 6, R: 8, S: 12, T: 14, U: 16, V: 10, W: 22, X: 25, Y: 24, Z: 23 };
                s = 0;
                for (i = 0; i < 15; i++) s += (i % 2 === 0) ? ODD[v[i]] : ((v[i] >= '0' && v[i] <= '9') ? +v[i] : v.charCodeAt(i) - 65);
                return String.fromCharCode(65 + s % 26) === v[15] ? OK : bad('El carácter de control del Codice Fiscale no corresponde.');
            }
            if (/^[A-Z0-9]{9}$/.test(v)) return soft();   // nº de la Carta d'Identità, sin control público
            return bad('Formato no válido: Codice Fiscale (16 caracteres) o nº de Carta d\'Identità (9).');
        }
        if (cc === 'DE') {   // nº de Personalausweis: 9 caracteres (+ dígito de control opcional)
            if (/^[0-9A-Z]{10}$/.test(v)) {
                var W = [7, 3, 1]; s = 0;
                for (i = 0; i < 9; i++) s += ((v[i] >= '0' && v[i] <= '9') ? +v[i] : v.charCodeAt(i) - 55) * W[i % 3];
                if (s % 10 === +v[9]) return OK;
                return bad('El dígito de control del documento alemán no corresponde.');
            }
            if (/^[0-9A-Z]{9}$/.test(v)) return soft();   // sin el dígito de control impreso
            return bad('Formato no válido: 9 caracteres del Personalausweis (o 10 con dígito de control).');
        }
        if (cc === 'NL') {   // BSN: 9 dígitos, prueba del 11
            if (/^\d{9}$/.test(v)) {
                s = 0; for (i = 0; i < 8; i++) s += (+v[i]) * (9 - i); s -= +v[8];
                return (s > 0 && s % 11 === 0) ? OK : bad('El BSN neerlandés no es válido (prueba del 11).');
            }
            if (/^[0-9A-Z]{9}$/.test(v)) return soft();   // nº de documento, sin control público
            return bad('Formato no válido: BSN o nº de documento (9 caracteres).');
        }
        if (cc === 'BE') {   // nº de registro nacional: 11 dígitos mod 97
            if (/^\d{11}$/.test(v)) {
                var b = +v.slice(0, 9), c2 = +v.slice(9);
                return (97 - (b % 97) === c2 || 97 - ((2000000000 + b) % 97) === c2) ? OK : bad('El número de registro nacional belga no es válido.');
            }
            return bad('Formato no válido: 11 dígitos del registro nacional.');
        }
        if (cc === 'PL') {   // PESEL: 11 dígitos
            if (/^\d{11}$/.test(v)) {
                var WP = [1, 3, 7, 9, 1, 3, 7, 9, 1, 3]; s = 0;
                for (i = 0; i < 10; i++) s += WP[i] * +v[i];
                return (10 - s % 10) % 10 === +v[10] ? OK : bad('El número PESEL no es válido.');
            }
            if (/^[0-9A-Z]{9}$/.test(v)) return soft();   // nº de dowód osobisty
            return bad('Formato no válido: PESEL (11 dígitos) o nº de documento (9 caracteres).');
        }
        if (cc === 'RO') {   // CNP: 13 dígitos
            if (/^\d{13}$/.test(v)) {
                var WR = '279146358279'; s = 0;
                for (i = 0; i < 12; i++) s += (+WR[i]) * (+v[i]);
                var r = s % 11; if (r === 10) r = 1;
                return r === +v[12] ? OK : bad('El CNP rumano no es válido.');
            }
            return bad('Formato no válido: CNP de 13 dígitos.');
        }
        if (cc === 'CZ') {   // rodné číslo: 10 dígitos divisibles por 11
            if (/^\d{10}$/.test(v)) return (+v) % 11 === 0 ? OK : bad('El rodné číslo checo no es válido.');
            if (/^\d{9}$/.test(v)) return soft();   // anteriores a 1954, sin regla
            return bad('Formato no válido: rodné número de 9-10 dígitos.');
        }
        if (cc === 'FR') {   // la CNI francesa no publica control
            return /^[0-9A-Z]{9,12}$/.test(v) ? soft() : bad('Formato no válido: nº de la CNI francesa (9-12 caracteres).');
        }
        // AT / CH / LU / Otro país: sin algoritmo público → solo plausibilidad
        return /^[0-9A-Z]{5,20}$/.test(v) ? soft('No podemos validar automáticamente este documento — revísalo antes de firmar.') : bad('El número parece demasiado corto (mínimo 5 caracteres).');
    }
