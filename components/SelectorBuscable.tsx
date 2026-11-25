'use client';

// Desplegable con BUSCADOR para listas largas de texto (provincias…). Mismo aspecto y mismo
// manejo que el de país (`SelectorPais`: botón, ventana flotante, buscador arriba, flechas y
// Enter), sin banderas (usuario, 2026-11-25: «cuando se elige provincia, etc., con el
// autocompletado que usamos normalmente, como el de país» — ni el desplegable del navegador
// ni su lista de sugerencias).
//
// Con `libre`, además de elegir de la lista se puede escribir un valor que no esté («Usar …»):
// es el caso de la provincia fuera de España, que no tiene lista cerrada.

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './selector-pais.css';

type Props = {
  id: string;
  valor: string;
  onCambio: (v: string) => void;
  opciones: string[];
  /** Qué se elige, en una palabra y en minúsculas («provincia»): va en los textos de ayuda. */
  nombre: string;
  /** Texto del botón cuando no hay nada elegido. */
  vacio?: string;
  /** Se puede escribir un valor que no esté en la lista. */
  libre?: boolean;
  disabled?: boolean;
  ariaInvalid?: boolean;
  className?: string;
  style?: React.CSSProperties;
};

const sinAcentos = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

type Fila = { clave: string; tipo: 'opcion' | 'libre' | 'quitar'; v: string };

export default function SelectorBuscable({ id, valor, onCambio, opciones, nombre, vacio, libre = false, disabled, ariaInvalid, className, style }: Props) {
  const [abierto, setAbierto] = useState(false);
  const [q, setQ] = useState('');
  const [act, setAct] = useState(0);
  const [pos, setPos] = useState<{ top: number; left: number; width: number; arriba: boolean } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const busca = useRef<HTMLInputElement>(null);
  const lista = useRef<HTMLUListElement>(null);
  const listaId = useId();

  // Un valor guardado que ya no está en la lista se conserva como una opción más.
  const todas = useMemo(() => (valor && !opciones.includes(valor) ? [valor, ...opciones] : opciones), [opciones, valor]);

  const filas = useMemo<Fila[]>(() => {
    const texto = q.trim();
    const t = sinAcentos(texto);
    if (!t) {
      const f: Fila[] = todas.map((v) => ({ clave: 'o:' + v, tipo: 'opcion', v }));
      return valor ? [{ clave: 'quitar', tipo: 'quitar', v: '' }, ...f] : f;
    }
    // Primero las que EMPIEZAN por lo escrito (ellas o alguna de sus palabras), luego las que lo contienen.
    const casan = todas.filter((v) => sinAcentos(v).includes(t));
    const empieza = casan.filter((v) => sinAcentos(v).split(/[\s/-]+/).some((w) => w.startsWith(t)));
    const f: Fila[] = [...empieza, ...casan.filter((v) => !empieza.includes(v))].map((v) => ({ clave: 'o:' + v, tipo: 'opcion', v }));
    if (libre && !todas.some((v) => sinAcentos(v) === t)) f.push({ clave: 'libre', tipo: 'libre', v: texto });
    return f;
  }, [q, todas, valor, libre]);

  function colocar() {
    const b = btn.current; if (!b) return;
    const r = b.getBoundingClientRect();
    const ancho = Math.min(Math.max(r.width, 260), window.innerWidth - 16);
    const left = Math.max(8, Math.min(r.left, window.innerWidth - ancho - 8));
    const abajo = window.innerHeight - r.bottom;
    const arriba = abajo < 340 && r.top > abajo;
    setPos({ top: arriba ? r.top - 5 : r.bottom + 5, left, width: ancho, arriba });
  }
  function abrir() {
    if (disabled) return;
    colocar(); setQ('');
    // Con valor, la primera fila es «Quitar»: la elegida va una más abajo.
    setAct(valor ? Math.max(0, todas.indexOf(valor) + 1) : 0);
    setAbierto(true);
  }
  function cerrar(volverAlBoton = false) {
    setAbierto(false); setQ('');
    if (volverAlBoton) btn.current?.focus();
  }
  function elegir(f: Fila) { onCambio(f.v); cerrar(true); }

  useLayoutEffect(() => { if (abierto) busca.current?.focus({ preventScroll: true }); }, [abierto]);

  // Fuera, scroll o cambio de tamaño → se recoloca o se cierra.
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent | TouchEvent) => {
      const t = e.target as Node;
      if (!pop.current?.contains(t) && !btn.current?.contains(t)) cerrar();
    };
    const mover = (e: Event) => { if (pop.current?.contains(e.target as Node)) return; colocar(); };
    document.addEventListener('mousedown', fuera);
    document.addEventListener('touchstart', fuera);
    window.addEventListener('scroll', mover, true);
    window.addEventListener('resize', mover);
    return () => {
      document.removeEventListener('mousedown', fuera);
      document.removeEventListener('touchstart', fuera);
      window.removeEventListener('scroll', mover, true);
      window.removeEventListener('resize', mover);
    };
  }, [abierto]);

  // La fila activa siempre a la vista al moverse con el teclado.
  useEffect(() => {
    if (!abierto) return;
    lista.current?.querySelector<HTMLElement>(`[data-i="${act}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [act, abierto]);

  function teclas(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setAct((a) => Math.min(filas.length - 1, a + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setAct((a) => Math.max(0, a - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); const f = filas[act]; if (f) elegir(f); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cerrar(true); }
    else if (e.key === 'Tab') cerrar();
  }

  const Nombre = nombre.charAt(0).toUpperCase() + nombre.slice(1);
  return (
    <div className="selpais-wrap">
      <button
        ref={btn} id={id} type="button" disabled={disabled} data-valor={valor} style={style}
        className={`selpais-btn selbus-btn${className ? ' ' + className : ''}`}
        aria-haspopup="listbox" aria-expanded={abierto} aria-controls={abierto ? listaId : undefined}
        data-invalido={ariaInvalid ? 'si' : undefined}
        aria-label={`${Nombre}: ${valor || 'sin elegir'}`}
        onClick={() => (abierto ? cerrar() : abrir())}
        onKeyDown={(e) => { if (!abierto && (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); abrir(); } }}
      >
        <span className={`pf-code${valor ? '' : ' vacio'}`}>{valor || vacio || `Elige la ${nombre}…`}</span>
        <svg className="pf-chev" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><polyline points="6 9 12 15 18 9" /></svg>
      </button>

      {abierto && pos && createPortal(
        <div ref={pop} className={`pref-pop selpais-pop${pos.arriba ? ' arriba' : ''}`} style={{ top: pos.top, left: pos.left, width: pos.width }}>
          <input
            ref={busca} className="pref-search" type="search" value={q} autoComplete="off" spellCheck={false}
            placeholder={libre ? `Busca o escribe la ${nombre}…` : `Busca una ${nombre}…`}
            aria-label={`Buscar ${nombre}`} aria-controls={listaId}
            aria-activedescendant={filas[act] ? `${listaId}-${act}` : undefined}
            onChange={(e) => { setQ(e.target.value); setAct(0); }} onKeyDown={teclas}
          />
          <ul ref={lista} className="pref-list" id={listaId} role="listbox">
            {filas.length === 0 && <li className="pref-empty">{libre && !q.trim() ? `Escribe la ${nombre}` : 'Sin resultados'}</li>}
            {filas.map((f, n) => (
              <li key={f.clave} role="presentation">
                <button
                  type="button" id={`${listaId}-${n}`} role="option" aria-selected={f.tipo === 'opcion' && f.v === valor} data-i={n} tabIndex={-1}
                  className={`pref-item${n === act ? ' act' : ''}${f.tipo === 'opcion' && f.v === valor ? ' sel' : ''}${f.tipo === 'quitar' ? ' quitar' : ''}`}
                  onMouseDown={(e) => e.preventDefault()} onMouseEnter={() => setAct(n)} onClick={() => elegir(f)}
                >
                  <span className="pf-name">{f.tipo === 'quitar' ? `Quitar la ${nombre}` : f.tipo === 'libre' ? <>Usar «{f.v}»</> : f.v}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>,
        document.body,
      )}
    </div>
  );
}
