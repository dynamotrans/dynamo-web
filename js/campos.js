/* ==========================================================================
   campos.js — Saneado global de campos de EMAIL y TELÉFONO en TODO el portal.
   (Web pública index.html NO usa este archivo: va aparte.)

   REGLAS (documentadas también en TODO.md):
   · EMAIL   → sin espacios. Debe contener una '@' (se exige al validar/enviar).
               Se permiten letras, números y símbolos habituales del email.
               Longitud máx. 254 caracteres (estándar RFC 5321, holgado).
               El campo de "Email de avisos del sitio" admite VARIOS emails
               separados por coma: al quitar los espacios la coma sigue
               separando ("a@x.com, b@y.com" → "a@x.com,b@y.com"), sin problema.
   · TELÉFONO → SOLO dígitos, sin espacios (se admite un '+' inicial opcional
               para el prefijo internacional cuando el número lo lleva inline;
               en el resto de campos el prefijo se elige en el selector aparte,
               js/prefijos.js, y el número va sin '+'). Longitud máx. 20 (holgada:
               E.164 tope 15 dígitos; no limita ningún teléfono real de Europa).

   Implementación: un único listener DELEGADO en `document` (fase de captura),
   así cubre también los campos creados dinámicamente (modales, fichas, wizard).
   Detecta el tipo de campo por `type`/`inputmode`:
     · email  → type="email"  o inputmode="email"
     · tel    → type="tel"     o inputmode="tel"
   NO toca: CP (inputmode="numeric"), casillas OTP (inputmode="numeric"),
   buscadores (type="search"/text) ni el input oculto del prefijo (type="hidden").
   ========================================================================== */
(function () {
    var MAX_EMAIL = 254;
    var MAX_TEL = 20;

    function setVal(el, v) {
        el.value = v;
        // Caret al final (el saneo ocurre casi siempre al teclear al final;
        // evita el salto raro tras eliminar un carácter inválido).
        try { el.setSelectionRange(v.length, v.length); } catch (e) {}
    }
    function attr(el, n) { return (el.getAttribute(n) || '').toLowerCase(); }
    function esEmail(el) { return attr(el, 'type') === 'email' || attr(el, 'inputmode') === 'email'; }
    function esTel(el) { return attr(el, 'type') === 'tel' || attr(el, 'inputmode') === 'tel'; }

    document.addEventListener('input', function (e) {
        var el = e.target;
        if (!el || el.tagName !== 'INPUT' || el.disabled || el.readOnly) return;
        if (esEmail(el)) {
            var v = el.value.replace(/\s+/g, '');
            if (v.length > MAX_EMAIL) v = v.slice(0, MAX_EMAIL);
            if (v !== el.value) setVal(el, v);
        } else if (esTel(el)) {
            var raw = el.value;
            var plus = raw.charAt(0) === '+' ? '+' : '';
            var v2 = (plus + raw.replace(/\D/g, '')).slice(0, MAX_TEL);
            if (v2 !== el.value) setVal(el, v2);
        }
    }, true);

    // Helper reutilizable para validación al enviar (email debe llevar '@').
    // Devuelve true si el email es aceptable (sin espacios y con una '@' con
    // algo antes y después). Para el campo multi-email de sitios, valida cada
    // uno separado por coma.
    window.emailValido = function (valor) {
        var s = String(valor || '').replace(/\s+/g, '');
        if (!s) return false;
        return s.split(',').every(function (p) {
            return p.length > 0 && /^[^@]+@[^@]+\.[^@]+$/.test(p);
        });
    };
})();
