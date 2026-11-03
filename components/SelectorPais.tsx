'use client';

// Desplegable de PAÍS o de PREFIJO TELEFÓNICO con buscador y banderas.
// Una sola pieza para toda la plataforma (sitios, clientes, transportistas,
// contactos, usuarios, altas, registro). Diseño = el del selector de prefijos
// del mockup (`js/prefijos.js`: .pref-btn / .pref-pop / .pref-search / .pref-list).
//
// Orden: España, Portugal y Polonia arriba («Más habituales») y después todos
// los países del mundo por orden alfabético. Se busca por nombre (sin acentos),
// por código (ES, PT…) o por prefijo (+34, 351…).

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { PAISES_MUNDO, PAISES_PRIMEROS, bandera, paisDePrefijo } from '@/lib/paises';
import './selector-pais.css';

type Props = {
  /** 'pais' → el valor es el código ISO (ES). 'prefijo' → el valor es el prefijo (+34). */
  modo?: 'pais' | 'prefijo';
  valor: string;
  onCambio?: (v: string) => void;
  /** Si se da, añade un <input type="hidden"> para formularios con FormData. */
  name?: string;
  /** id del botón, para que el <label htmlFor> lo enfoque. */
  id?: string;
  /** Clase extra del botón (p. ej. para igualar al resto de campos de la zona). */
  className?: string;
  ariaLabel?: string;
  disabled?: boolean;
};

const sinAcentos = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

type Fila = { c: string; n: string; d: string; clave: string };
const FILAS: Fila[] = PAISES_MUNDO.map(([c, n, d]) => ({ c, n, d, clave: sinAcentos(`${n} ${c} ${d} ${d.slice(1)}`) }));
const ARRIBA = PAISES_PRIMEROS.map((c) => FILAS.find((f) => f.c === c)!).filter(Boolean);
const RESTO = FILAS.filter((f) => !PAISES_PRIMEROS.includes(f.c));

export default function SelectorPais({ modo = 'pais', valor: valorRecibido, onCambio, name, id, className, ariaLabel, disabled }: Props) {
  // España por defecto (casi todo es España): si llega vacío, se muestra y se guarda ES / +34.
  const porDefecto = modo === 'pais' ? 'ES' : '+34';
  const valor = valorRecibido || porDefecto;
  useEffect(() => { if (!valorRecibido && onCambio) onCambio(porDefecto); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [abierto, setAbierto] = useState(false);
  const [q, setQ] = useState('');
  const [act, setAct] = useState(0);
  // En modo prefijo se recuerda qué país se eligió (Canadá y EE. UU. comparten +1).
  const [paisElegido, setPaisElegido] = useState('');
  const [pos, setPos] = useState<{ top: number; left: number; width: number; arriba: boolean } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const busca = useRef<HTMLInputElement>(null);
  const lista = useRef<HTMLUListElement>(null);
  const listaId = useId();

  const ccActual = modo === 'pais' ? valor : (paisElegido && FILAS.find((f) => f.c === paisElegido)?.d === valor ? paisElegido : paisDePrefijo(valor));
  const filaActual = FILAS.find((f) => f.c === ccActual);

  // Resultado del buscador: con texto, una sola lista (los habituales primero si casan).
  const grupos = useMemo(() => {
    const t = sinAcentos(q.trim()).replace(/^\+/, '');
    if (!t) return [{ titulo: 'Más habituales', filas: ARRIBA }, { titulo: 'Todos los países', filas: RESTO }];
    const casa = (f: Fila) => f.clave.split(' ').some((w) => w.startsWith(t)) || f.clave.includes(t);
    // Primero los que EMPIEZAN por lo escrito, luego los que lo contienen.
    const todas = [...ARRIBA, ...RESTO].filter(casa);
    const empieza = todas.filter((f) => sinAcentos(f.n).startsWith(t) || f.c.toLowerCase() === t || f.d.slice(1).startsWith(t));
    const resto = todas.filter((f) => !empieza.includes(f));
    return [{ titulo: '', filas: [...empieza, ...resto] }];
  }, [q]);
  const planas = useMemo(() => grupos.flatMap((g) => g.filas), [grupos]);

  function colocar() {
    const b = btn.current; if (!b) return;
    const r = b.getBoundingClientRect();
    const ancho = Math.min(Math.max(r.width, modo === 'prefijo' ? 300 : 280), window.innerWidth - 16);
    const left = Math.max(8, Math.min(r.left, window.innerWidth - ancho - 8));
    const abajo = window.innerHeight - r.bottom;
    const arriba = abajo < 340 && r.top > abajo;
    setPos({ top: arriba ? r.top - 5 : r.bottom + 5, left, width: ancho, arriba });
  }

  function abrir() {
    if (disabled) return;
    colocar(); setQ('');
    const i = [...ARRIBA, ...RESTO].findIndex((f) => f.c === ccActual);
    setAct(Math.max(0, i)); setAbierto(true);
  }
  function cerrar(volverAlBoton = false) {
    setAbierto(false); setQ('');
    if (volverAlBoton) btn.current?.focus();
  }
  function elegir(f: Fila) {
    if (modo === 'prefijo') setPaisElegido(f.c);
    onCambio?.(modo === 'pais' ? f.c : f.d);
    cerrar(true);
  }

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
  }, [abierto]); // eslint-disable-line react-hooks/exhaustive-deps

  // La fila activa siempre a la vista al moverse con el teclado.
  useEffect(() => {
    if (!abierto) return;
    lista.current?.querySelector<HTMLElement>(`[data-i="${act}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [act, abierto]);

  function teclas(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setAct((a) => Math.min(planas.length - 1, a + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setAct((a) => Math.max(0, a - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); const f = planas[act]; if (f) elegir(f); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cerrar(true); }
    else if (e.key === 'Tab') cerrar();
  }

  let i = -1;
  return (
    <div className={`selpais-wrap${modo === 'prefijo' ? ' pref-wrap' : ''}`}>
      {name && <input type="hidden" name={name} value={valor} />}
      <button
        ref={btn} id={id} type="button" disabled={disabled}
        className={`${modo === 'prefijo' ? 'pref-btn' : 'selpais-btn'}${className ? ' ' + className : ''}`}
        aria-haspopup="listbox" aria-expanded={abierto} aria-controls={abierto ? listaId : undefined}
        aria-label={ariaLabel ?? (modo === 'prefijo' ? 'Prefijo de país' : 'País')}
        onClick={() => (abierto ? cerrar() : abrir())}
        onKeyDown={(e) => { if (!abierto && (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); abrir(); } }}
      >
        <span className="pf-flag" aria-hidden>{bandera(ccActual) || '🌐'}</span>
        <span className="pf-code">{modo === 'prefijo' ? valor : (filaActual?.n ?? valor)}</span>
        <svg className="pf-chev" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><polyline points="6 9 12 15 18 9" /></svg>
      </button>

      {abierto && pos && createPortal(
        <div
          ref={pop} className={`pref-pop selpais-pop${pos.arriba ? ' arriba' : ''}`}
          style={{ top: pos.top, left: pos.left, width: pos.width }}
        >
          <input
            ref={busca} className="pref-search" type="search" value={q} autoComplete="off" spellCheck={false}
            placeholder={modo === 'prefijo' ? 'Busca país o prefijo…' : 'Busca un país…'}
            aria-label="Buscar país" aria-controls={listaId}
            aria-activedescendant={planas[act] ? `${listaId}-${planas[act].c}` : undefined}
            onChange={(e) => { setQ(e.target.value); setAct(0); }} onKeyDown={teclas}
          />
          <ul ref={lista} className="pref-list" id={listaId} role="listbox">
            {planas.length === 0 && <li className="pref-empty">Sin resultados</li>}
            {grupos.map((g) => g.filas.length > 0 && [
              g.titulo ? <li key={'g' + g.titulo} className="pf-grp" role="presentation">{g.titulo}</li> : null,
              ...g.filas.map((f) => {
                i += 1; const n = i;
                return (
                  <li key={f.c} role="presentation">
                    <button
                      type="button" id={`${listaId}-${f.c}`} role="option" aria-selected={f.c === ccActual} data-i={n} tabIndex={-1}
                      className={`pref-item${n === act ? ' act' : ''}${f.c === ccActual ? ' sel' : ''}`}
                      onMouseDown={(e) => e.preventDefault()} onMouseEnter={() => setAct(n)} onClick={() => elegir(f)}
                    >
                      <span className="pf-flag" aria-hidden>{bandera(f.c)}</span>
                      <span className="pf-name">{f.n}</span>
                      <span className="pf-dial">{f.d}</span>
                    </button>
                  </li>
                );
              }),
            ])}
          </ul>
        </div>,
        document.body,
      )}
    </div>
  );
}
