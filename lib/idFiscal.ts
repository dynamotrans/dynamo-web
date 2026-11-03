// @ts-nocheck
// Validación del CIF/NIF/NIE español y del nº de IVA europeo (con prefijo de país),
// copiada tal cual de registro.html (validaIdFiscal). Se usa en el navegador (aviso en
// vivo) y en el servidor (el alta no pasa con un ID que no valida).
export type ResultadoIdFiscal = { ok: boolean; soft?: boolean; tipo: string | null; msg: string } | null;

/* eslint-disable */
export function validaIdFiscal(raw: string): ResultadoIdFiscal {
        var v = String(raw || '').toUpperCase().replace(/[\s.\-]/g, '');
        if (!v) return null;
        var LET = 'TRWAGMYFPDXBNJZSQVHLCKE';
        if (/^\d{8}[A-Z]$/.test(v)) { var e1 = LET[+v.slice(0, 8) % 23]; return { ok: e1 === v[8], tipo: 'DNI español', msg: 'la letra sería ' + e1 }; }
        if (/^[XYZ]\d{7}[A-Z]$/.test(v)) { var n = { X: '0', Y: '1', Z: '2' }[v[0]] + v.slice(1, 8); var e2 = LET[+n % 23]; return { ok: e2 === v[8], tipo: 'NIE (extranjero residente)', msg: 'la letra sería ' + e2 }; }
        if (/^[ABCDEFGHJNPQRSUVW]\d{7}[0-9A-J]$/.test(v)) {
            var suma = 0;
            for (var i = 0; i < 7; i++) { var d = +v[i + 1]; if (i % 2 === 0) { var x = d * 2; suma += Math.floor(x / 10) + (x % 10); } else suma += d; }
            var ctl = (10 - (suma % 10)) % 10, eD = String(ctl), eL = 'JABCDEFGHI'[ctl];
            var soloLetra = /[PQRSNW]/.test(v[0]);
            var ok3 = soloLetra ? v[8] === eL : (v[8] === eD || v[8] === eL);
            return { ok: ok3, tipo: 'CIF español', msg: 'el control sería ' + (soloLetra ? eL : eD + ' (o ' + eL + ')') };
        }
        if (/^(PT)?\d{9}$/.test(v)) { var p = v.replace(/^PT/, ''), s = 0; for (var j = 0; j < 8; j++) s += (+p[j]) * (9 - j); var c = 11 - (s % 11); if (c >= 10) c = 0; return { ok: c === +p[8], tipo: 'NIF portugués', msg: 'dígito de control incorrecto' }; }
        if (/^FR[0-9A-Z]{2}\d{9}$/.test(v)) { var si = v.slice(4), t = 0; for (var k = 0; k < 9; k++) { var dd = +si[8 - k]; if (k % 2 === 1) { dd *= 2; if (dd > 9) dd -= 9; } t += dd; } var okF = (t % 10 === 0) && (!/^\d{2}$/.test(v.slice(2, 4)) || +v.slice(2, 4) === (12 + 3 * (+si % 97)) % 97); return { ok: okF, tipo: 'Nº TVA francés', msg: 'clave o SIREN incorrectos' }; }
        if (/^(IT)?\d{11}$/.test(v)) { var it = v.replace(/^IT/, ''), ts = 0; for (var q = 0; q < 11; q++) { var dq = +it[q]; if (q % 2 === 1) { dq *= 2; if (dq > 9) dq -= 9; } ts += dq; } return { ok: ts % 10 === 0, tipo: 'Partita IVA italiana', msg: 'dígito de control incorrecto' }; }
        // ===== RESTO DE EUROPA (nº de IVA con prefijo de país) =====
        var BADm = 'dígito de control incorrecto';
        function pesos(ds, ws) { var s2 = 0; for (var i2 = 0; i2 < ws.length; i2++) s2 += (+ds[i2]) * ws[i2]; return s2; }
        function mod1110(ds) { var pr = 10; for (var i3 = 0; i3 < ds.length; i3++) { var su = ((+ds[i3]) + pr) % 10; if (su === 0) su = 10; pr = (2 * su) % 11; } return (11 - pr) % 10; }
        function luhnOk(ds) { var tt = 0; for (var i4 = 0; i4 < ds.length; i4++) { var dg = +ds[ds.length - 1 - i4]; if (i4 % 2 === 1) { dg *= 2; if (dg > 9) dg -= 9; } tt += dg; } return tt % 10 === 0; }
        var m;
        if ((m = v.match(/^DE(\d{9})$/))) return { ok: mod1110(m[1].slice(0, 8)) === +m[1][8], tipo: 'IVA alemán (USt-IdNr.)', msg: BADm };
        if ((m = v.match(/^ATU(\d{8})$/))) { var sa = 0; for (var ia = 0; ia < 7; ia++) { var da = +m[1][ia]; if (ia % 2 === 1) { da *= 2; if (da > 9) da -= 9; } sa += da; } return { ok: (96 - sa) % 10 === +m[1][7], tipo: 'IVA austriaco (ATU)', msg: BADm }; }
        if ((m = v.match(/^BE([01]\d{9})$/))) return { ok: 97 - (+m[1].slice(0, 8) % 97) === +m[1].slice(8), tipo: 'IVA belga', msg: BADm };
        if ((m = v.match(/^NL(\d{9})B\d{2}$/))) { var okNl = pesos(m[1], [9, 8, 7, 6, 5, 4, 3, 2]) % 11 === +m[1][8]; if (!okNl) { var big = v.replace(/[A-Z]/g, function (ch) { return String(ch.charCodeAt(0) - 55); }), r97 = 0; for (var ib = 0; ib < big.length; ib++) r97 = (r97 * 10 + (+big[ib])) % 97; okNl = r97 === 1; } return { ok: okNl, tipo: 'IVA neerlandés (BTW)', msg: BADm }; }
        if ((m = v.match(/^PL(\d{10})$/))) { var spl = pesos(m[1], [6, 5, 7, 2, 3, 4, 5, 6, 7]) % 11; return { ok: spl !== 10 && spl === +m[1][9], tipo: 'NIP polaco', msg: BADm }; }
        if ((m = v.match(/^LU(\d{8})$/))) return { ok: +m[1].slice(0, 6) % 89 === +m[1].slice(6), tipo: 'IVA luxemburgués', msg: BADm };
        if ((m = v.match(/^CHE(\d{9})(MWST|TVA|IVA)?$/))) { var cch = 11 - (pesos(m[1], [5, 4, 3, 2, 7, 6, 5, 4]) % 11); if (cch === 11) cch = 0; return { ok: cch !== 10 && cch === +m[1][8], tipo: 'UID suizo (CHE)', msg: BADm }; }
        if ((m = v.match(/^DK(\d{8})$/))) return { ok: pesos(m[1], [2, 7, 6, 5, 4, 3, 2, 1]) % 11 === 0, tipo: 'CVR danés', msg: BADm };
        if ((m = v.match(/^SE(\d{10})01$/))) return { ok: luhnOk(m[1]), tipo: 'IVA sueco (Momsnr.)', msg: BADm };
        if ((m = v.match(/^FI(\d{8})$/))) { var rfi = pesos(m[1], [7, 9, 10, 5, 8, 4, 2]) % 11; var cfi = rfi === 0 ? 0 : 11 - rfi; return { ok: rfi !== 1 && cfi === +m[1][7], tipo: 'ALV finlandés', msg: BADm }; }
        if ((m = v.match(/^SI(\d{8})$/))) { var csi = 11 - (pesos(m[1], [8, 7, 6, 5, 4, 3, 2]) % 11); if (csi === 11) csi = 0; return { ok: csi !== 10 && csi === +m[1][7], tipo: 'IVA esloveno', msg: BADm }; }
        if ((m = v.match(/^SK(\d{10})$/))) return { ok: +m[1] % 11 === 0, tipo: 'IČ DPH eslovaco', msg: BADm };
        if ((m = v.match(/^HR(\d{11})$/))) return { ok: mod1110(m[1].slice(0, 10)) === +m[1][10], tipo: 'OIB croata', msg: BADm };
        if ((m = v.match(/^HU(\d{8})$/))) return { ok: (10 - (pesos(m[1], [9, 7, 3, 1, 9, 7, 3]) % 10)) % 10 === +m[1][7], tipo: 'IVA húngaro', msg: BADm };
        if ((m = v.match(/^EE(\d{9})$/))) return { ok: (10 - (pesos(m[1], [3, 7, 1, 3, 7, 1, 3, 7]) % 10)) % 10 === +m[1][8], tipo: 'KMKR estonio', msg: BADm };
        if ((m = v.match(/^(?:EL|GR)(\d{9})$/))) { var sel = 0; for (var ie = 0; ie < 8; ie++) sel += (+m[1][ie]) * Math.pow(2, 8 - ie); return { ok: (sel % 11) % 10 === +m[1][8], tipo: 'AFM griego', msg: BADm }; }
        if ((m = v.match(/^RO(\d{2,10})$/))) { var ro = ('0000000000' + m[1]).slice(-10); var cro = (pesos(ro, [7, 5, 3, 2, 1, 7, 5, 3, 2]) * 10) % 11; if (cro === 10) cro = 0; return { ok: cro === +ro[9], tipo: 'CIF rumano', msg: BADm }; }
        if ((m = v.match(/^GB(\d{9})$/))) { var tgb = pesos(m[1], [8, 7, 6, 5, 4, 3, 2]) + (+m[1].slice(7)); return { ok: tgb % 97 === 0 || (tgb + 55) % 97 === 0, tipo: 'VAT británico', msg: BADm }; }
        if ((m = v.match(/^BG(\d{9})$/))) { var sbg = pesos(m[1], [1, 2, 3, 4, 5, 6, 7, 8]) % 11; if (sbg === 10) { sbg = pesos(m[1], [3, 4, 5, 6, 7, 8, 9, 10]) % 11; if (sbg === 10) sbg = 0; } return { ok: sbg === +m[1][8], tipo: 'IVA búlgaro', msg: BADm }; }
        if ((m = v.match(/^CZ(\d{8})$/))) return { ok: (11 - (pesos(m[1], [8, 7, 6, 5, 4, 3, 2]) % 11)) % 10 === +m[1][7], tipo: 'DIČ checo', msg: BADm };
        var SOFT = [[/^IE(\d{7}[A-W][A-IW]?|\d[A-Z+*]\d{5}[A-W])$/, 'VAT irlandés'], [/^LV\d{11}$/, 'PVN letón'], [/^LT(\d{9}|\d{12})$/, 'PVM lituano'], [/^MT\d{8}$/, 'VAT maltés'], [/^CY\d{8}[A-Z]$/, 'VAT chipriota'], [/^BG\d{10}$/, 'IVA búlgaro (personal)'], [/^CZ\d{9,10}$/, 'DIČ checo (personal)']];
        for (var isf = 0; isf < SOFT.length; isf++) { if (SOFT[isf][0].test(v)) return { ok: true, soft: true, tipo: SOFT[isf][1], msg: '' }; }
        return { ok: false, tipo: null, msg: 'formato no reconocido — admite NIF/CIF/NIE españoles y nº de IVA europeo con prefijo de país (PT, FR, IT, DE, NL, BE, PL…)' };
    }

// Países cuyo nº fiscal sabemos comprobar con su dígito de control (o al menos su
// formato). Para el RESTO del mundo (Marruecos, Ucrania, EE. UU., China…) no hay
// algoritmo público común: se admite el número tal cual y Dynamo lo revisa al
// activar la cuenta. Así puede darse de alta un cliente de cualquier país.
const PAISES_CON_VALIDACION = new Set(['ES', 'PT', 'FR', 'IT', 'DE', 'AT', 'BE', 'NL', 'PL', 'LU', 'CH', 'DK', 'SE', 'FI',
  'SI', 'SK', 'HR', 'HU', 'EE', 'GR', 'RO', 'GB', 'BG', 'CZ', 'IE', 'LV', 'LT', 'MT', 'CY', 'NO']);

export function validaIdFiscalPais(raw: string, pais: string): ResultadoIdFiscal {
  const r = validaIdFiscal(raw);
  if (!r || r.ok || PAISES_CON_VALIDACION.has((pais || 'ES').toUpperCase())) return r;
  const v = String(raw || '').toUpperCase().replace(/[\s.\-/]/g, '');
  if (/^[A-Z0-9]{4,20}$/.test(v)) return { ok: true, soft: true, tipo: 'Nº fiscal extranjero', msg: '' };
  return { ok: false, tipo: null, msg: 'escribe solo letras y números (entre 4 y 20)' };
}
