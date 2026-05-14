/* ============================================================
   MONTES BLANCO — main.js
   - Navbar scroll state + mobile toggle
   - Smooth in-page navigation
   - Reveal-on-scroll (IntersectionObserver)
   - i18n: 7 idiomas con translations.json + persistencia + RTL
   - Year stamp + social link placeholders
   ============================================================ */

(() => {
  'use strict';

  /* -------- CONFIG -------- */
  const SUPPORTED = ['es', 'en', 'fr', 'de', 'pt', 'ru', 'ar'];
  const DEFAULT_LANG = 'es';
  const STORAGE_KEY = 'mb_lang';

  const SOCIAL = {
    facebook: 'https://www.facebook.com/p/Montes-Blanco-Real-Estate-61575004358296/',
    instagram: 'https://www.instagram.com/montesblancorealestate/'
  };

  /* -------- DOM helpers -------- */
  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  /* ============== 1. NAVBAR ============== */
  const nav = $('#nav');
  const navToggle = $('#navToggle');

  const onScroll = () => {
    if (!nav) return;
    nav.classList.toggle('is-scrolled', window.scrollY > 40);
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  if (navToggle && nav) {
    navToggle.addEventListener('click', () => {
      const open = nav.classList.toggle('is-open');
      navToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      navToggle.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú');
    });
  }

  // Cerrar menú móvil al hacer click en un enlace
  $$('#navMenu a').forEach(a => {
    a.addEventListener('click', () => {
      if (nav && nav.classList.contains('is-open')) {
        nav.classList.remove('is-open');
        navToggle && navToggle.setAttribute('aria-expanded', 'false');
      }
    });
  });

  /* ============== 2. REVEAL ON SCROLL ============== */
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          e.target.classList.add('is-visible');
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -60px 0px' });

    $$('.reveal').forEach(el => io.observe(el));
  } else {
    $$('.reveal').forEach(el => el.classList.add('is-visible'));
  }

  /* ============== 3. YEAR + SOCIAL LINKS ============== */
  const yearEl = $('#copyright');
  if (yearEl) {
    yearEl.textContent = yearEl.textContent.replace('{year}', new Date().getFullYear());
  }

  if (SOCIAL.facebook) $('#fbLink')?.setAttribute('href', SOCIAL.facebook);
  else $('#fbLink')?.style.setProperty('display', 'none');

  if (SOCIAL.instagram) $('#igLink')?.setAttribute('href', SOCIAL.instagram);
  else $('#igLink')?.style.setProperty('display', 'none');

  /* ============== 4. i18n ============== */
  let dict = null;

  const detectInitialLang = () => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && SUPPORTED.includes(saved)) return saved;
    const browser = (navigator.language || '').slice(0, 2).toLowerCase();
    if (SUPPORTED.includes(browser)) return browser;
    return DEFAULT_LANG;
  };

  const applyLang = (lang) => {
    if (!dict || !dict[lang]) return;
    const t = dict[lang];
    const html = document.documentElement;

    html.setAttribute('lang', t['html.lang'] || lang);
    html.setAttribute('dir', t['html.dir'] || 'ltr');

    // Texto plano
    $$('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      const val = t[key];
      if (val == null) return;
      const allowHtml = el.hasAttribute('data-i18n-html');
      if (allowHtml) el.innerHTML = val;
      else el.textContent = val;
    });

    // Atributos (ej. <meta content=...>)
    $$('[data-i18n-attr]').forEach(el => {
      // formato: "attr:key,attr2:key2"
      el.getAttribute('data-i18n-attr').split(',').forEach(pair => {
        const [attr, key] = pair.split(':').map(s => s.trim());
        if (attr && key && t[key] != null) el.setAttribute(attr, t[key]);
      });
    });

    // Title de página
    if (t['meta.title']) document.title = t['meta.title'];

    // Year en el copyright (re-aplicado tras cambiar idioma)
    if (yearEl) {
      yearEl.textContent = (t['footer.copyright'] || yearEl.textContent)
        .replace('{year}', new Date().getFullYear());
    }

    // Texto del WhatsApp FAB precargado
    const wa = $('#waFab');
    if (wa && t['wa.message']) {
      const msg = encodeURIComponent(t['wa.message']);
      wa.setAttribute('href', `https://wa.me/34635643827?text=${msg}`);
    }

    // Estado UI
    const cur = $('#langCurrent');
    if (cur) cur.textContent = lang.toUpperCase();
    $$('#langMenu button').forEach(b => {
      b.classList.toggle('is-current', b.dataset.lang === lang);
    });

    localStorage.setItem(STORAGE_KEY, lang);
  };

  const loadDict = async () => {
    try {
      const res = await fetch('js/translations.json', { cache: 'no-cache' });
      if (!res.ok) throw new Error('translations.json HTTP ' + res.status);
      dict = await res.json();
      applyLang(detectInitialLang());
    } catch (err) {
      console.warn('[i18n] No se pudo cargar translations.json:', err);
    }
  };

  // Lang button + menú
  const langWrap = $('.lang-wrap');
  const langBtn = $('#langBtn');
  const langMenu = $('#langMenu');

  if (langBtn && langWrap && langMenu) {
    langBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const open = langWrap.classList.toggle('is-open');
      langBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });

    document.addEventListener('click', (e) => {
      if (!langWrap.contains(e.target)) {
        langWrap.classList.remove('is-open');
        langBtn.setAttribute('aria-expanded', 'false');
      }
    });

    $$('button[data-lang]', langMenu).forEach(b => {
      b.addEventListener('click', () => {
        applyLang(b.dataset.lang);
        langWrap.classList.remove('is-open');
        langBtn.setAttribute('aria-expanded', 'false');
      });
    });
  }

  loadDict();

})();
