'use client';

// Selector de idiomas de aceptar-carga.html para las páginas públicas (cargas y CMR): las
// abren transportistas y conductores de cualquier país. Traduce EN SITIO con Google
// Translate (sin recargar al traducir; solo al VOLVER al español, que es la única forma de
// quitar la traducción —como en la web pública—) y
// comparte la cookie googtrans con la web pública. Las banderas son la excepción permitida
// de la regla 0-ter.
import { useEffect, useRef, useState } from 'react';
import './selector-idioma.css';

const IDIOMAS: [string, string, string, string][] = [
  ['es', '🇪🇸', 'ES', 'Español'], ['pt', '🇵🇹', 'PT', 'Português'], ['en', '🇬🇧', 'EN', 'English'], ['fr', '🇫🇷', 'FR', 'Français'],
  ['ar', '🇸🇦', 'AR', 'العربية'], ['de', '🇩🇪', 'DE', 'Deutsch'], ['it', '🇮🇹', 'IT', 'Italiano'], ['nl', '🇳🇱', 'NL', 'Nederlands'],
  ['pl', '🇵🇱', 'PL', 'Polski'], ['ro', '🇷🇴', 'RO', 'Română'], ['uk', '🇺🇦', 'UK', 'Українська'], ['zh-CN', '🇨🇳', 'ZH', '中文'],
];

// Lo que se usa del script de Google Translate.
type GoogleTraductor = { translate: { TranslateElement: new (opciones: { pageLanguage: string; autoDisplay: boolean; includedLanguages: string }, id: string) => unknown } };
declare global { interface Window { google?: GoogleTraductor; googleTranslateElementInit?: () => void } }

// Google Translate cambia los textos por su cuenta y React, al actualizar la página, se
// encuentra nodos que ya no están donde los dejó y se rompe. Este parche (el habitual)
// evita el fallo: si el nodo ya no es hijo, no hace nada.
function parcheReact() {
  if (typeof Node === 'undefined' || (Node.prototype as Node & { __parcheGT?: boolean }).__parcheGT) return;
  (Node.prototype as Node & { __parcheGT?: boolean }).__parcheGT = true;
  const quitar = Node.prototype.removeChild;
  Node.prototype.removeChild = function <T extends Node>(this: Node, hijo: T): T {
    if (hijo.parentNode !== this) return hijo;
    return quitar.call(this, hijo) as T;
  };
  const meter = Node.prototype.insertBefore;
  Node.prototype.insertBefore = function <T extends Node>(this: Node, nuevo: T, ref: Node | null): T {
    if (ref && ref.parentNode !== this) return nuevo;
    return meter.call(this, nuevo, ref) as T;
  };
}

function ponerCookie(valor: string) {
  const h = location.hostname;
  document.cookie = `googtrans=${valor}; path=/`;
  document.cookie = `googtrans=${valor}; path=/; domain=${h}`;
  document.cookie = `googtrans=${valor}; path=/; domain=.${h}`;
}
// Volver al español = QUITAR la traducción (Google no «traduce a español» una página que
// ya es española). Igual que la web pública (js/idiomas.js): se borra la cookie googtrans
// en todas sus variantes de dominio y se recarga la página tal cual.
function volverAEspanol() {
  const host = location.hostname, partes = host.split('.');
  const dominios = ['', host, '.' + host];
  if (partes.length > 2) { const base = partes.slice(1).join('.'); dominios.push(base, '.' + base); }
  for (const d of dominios) for (const p of ['/', '']) {
    document.cookie = `googtrans=; expires=Thu, 01 Jan 1970 00:00:00 UTC${p ? `; path=${p}` : ''}${d ? `; domain=${d}` : ''}`;
  }
  try {
    const marco = document.querySelector<HTMLIFrameElement>('iframe.goog-te-banner-frame');
    (marco?.contentDocument?.querySelector('.goog-close-link') as HTMLElement | null)?.click();
  } catch { /* sin banner */ }
  setTimeout(() => location.reload(), 100);
}
function aplicar(lang: string) {
  const sel = document.querySelector<HTMLSelectElement>('.goog-te-combo');
  if (!sel) return false;
  sel.value = lang; sel.dispatchEvent(new Event('change'));
  return true;
}
let cargado = false;
let incluidos = IDIOMAS.slice(1).map((x) => x[0]).join(',');
function cargarGT() {
  if (cargado) return; cargado = true;
  window.googleTranslateElementInit = () => {
    new window.google!.translate.TranslateElement({ pageLanguage: 'es', autoDisplay: false, includedLanguages: incluidos }, 'google_translate_element');
  };
  const s = document.createElement('script');
  s.src = 'https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit';
  s.onerror = () => { cargado = false; };
  document.body.appendChild(s);
}
function insistir(lang: string, veces = 24) {
  let n = 0;
  const t = setInterval(() => { n++; if (aplicar(lang) || n >= veces) clearInterval(t); }, 250);
}

/** El motor del selector, para otros diseños (el menú del usuario del panel). */
export function useIdiomaGT(codigos: string[]): [string, (lang: string) => void] {
  const [actual, setActual] = useState('es');
  useEffect(() => {
    parcheReact();
    incluidos = codigos.filter((c) => c !== 'es').join(',');
    const m = document.cookie.match(/googtrans=\/es\/([\w-]+)/);
    const lang = m?.[1] && codigos.includes(m[1]) ? m[1] : 'es';
    setActual(lang);
    // El traductor de Google solo se carga si hay otro idioma elegido (o al elegirlo):
    // en español no se carga ningún script de terceros.
    if (lang !== 'es') { setTimeout(cargarGT, 200); insistir(lang, 30); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const elegir = (lang: string) => {
    if (lang === actual) return;
    setActual(lang);
    if (lang === 'es') { volverAEspanol(); return; }
    ponerCookie(`/es/${lang}`);
    cargarGT();
    if (!aplicar(lang)) insistir(lang);
  };
  return [actual, elegir];
}

export default function SelectorIdioma() {
  const [actual, setActual] = useState('es');
  const [abierto, setAbierto] = useState(false);
  const caja = useRef<HTMLDivElement>(null);

  useEffect(() => {
    parcheReact();
    const m = document.cookie.match(/googtrans=\/es\/([\w-]+)/);
    const lang = m?.[1] && IDIOMAS.some(([c]) => c === m[1]) ? m[1] : 'es';
    setActual(lang);
    // El traductor de Google solo se carga si hay otro idioma elegido (o al elegirlo):
    // en español no se carga ningún script de terceros.
    if (lang !== 'es') { setTimeout(cargarGT, 200); insistir(lang, 30); }
  }, []);
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => { if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false); };
    document.addEventListener('mousedown', fuera);
    return () => document.removeEventListener('mousedown', fuera);
  }, [abierto]);

  const elegir = (lang: string) => {
    setAbierto(false);
    if (lang === actual) return;
    setActual(lang);
    if (lang === 'es') { volverAEspanol(); return; }
    ponerCookie(`/es/${lang}`);
    cargarGT();
    if (!aplicar(lang)) insistir(lang);
  };
  const [, bandera, codigo] = IDIOMAS.find(([c]) => c === actual) ?? IDIOMAS[0];
  return (
    <>
      <div className="lang-selector notranslate" translate="no" ref={caja}>
        <button type="button" className={`lang-btn${abierto ? ' open' : ''}`} aria-haspopup="listbox" aria-expanded={abierto} onClick={() => setAbierto((x) => !x)}>
          <span className="flag">{bandera}</span> {codigo}
          <svg className="arrow" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9" /></svg>
        </button>
        {abierto && (
          <div className="lang-dropdown open" role="listbox">
            {IDIOMAS.map(([c, f, , n]) => (
              <button type="button" key={c} role="option" aria-selected={c === actual} className={`lang-option${c === actual ? ' active' : ''}`} onClick={() => elegir(c)}>
                <span className="flag">{f}</span> {n}
              </button>
            ))}
          </div>
        )}
      </div>
      <div id="google_translate_element" style={{ display: 'none' }} />
    </>
  );
}
