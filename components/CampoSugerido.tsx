'use client';

// Campo de texto con SUGERENCIAS, con el aspecto de la plataforma (la misma ventana flotante que
// el desplegable de país) en vez de la lista de sugerencias del navegador (usuario, 2026-11-25:
// «así tampoco»). Se escribe lo que se quiera; las sugerencias que casan con lo escrito salen
// debajo y se eligen con el ratón, el dedo o las flechas y Enter.

import { useCerrarFuera } from '@/lib/useCerrarFuera';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './selector-pais.css';

export type Sugerencia = string | { valor: string; detalle?: string };

type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'list' | 'type' | 'id'> & {
  id: string;
  valor: string;
  onCambio: (v: string) => void;
  sugerencias: Sugerencia[];
  ariaInvalid?: boolean;
};

const sinAcentos = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

export default function CampoSugerido({ id, valor, onCambio, sugerencias, ariaInvalid, onFocus, onBlur, onKeyDown, ...resto }: Props) {
  const [foco, setFoco] = useState(false);
  const [cerrado, setCerrado] = useState(false);   // tras elegir o Escape, hasta que se vuelva a escribir
  const [act, setAct] = useState(-1);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const campo = useRef<HTMLInputElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const listaId = useId();

  // Las que casan con lo escrito (sin acentos); si lo escrito ya es una de ellas y es la única, nada.
  const filas = useMemo(() => {
    const t = sinAcentos(valor);
    const todas = sugerencias.map((s) => (typeof s === 'string' ? { valor: s } : s)).filter((s) => s.valor);
    const casan = t ? todas.filter((s) => sinAcentos(s.valor).includes(t)) : todas;
    if (casan.length === 1 && sinAcentos(casan[0].valor) === t) return [];
    return casan.slice(0, 30);
  }, [sugerencias, valor]);
  const abierto = foco && !cerrado && filas.length > 0;
  // Se cierra al pulsar fuera, no al perder el foco (en el iPhone, el ✓ del teclado lo quita).
  useCerrarFuera(abierto, () => { setFoco(false); setAct(-1); }, campo, pop);

  function colocar() {
    const c = campo.current; if (!c) return;
    const r = c.getBoundingClientRect();
    const ancho = Math.min(Math.max(r.width, 220), window.innerWidth - 16);
    setPos({ top: r.bottom + 5, left: Math.max(8, Math.min(r.left, window.innerWidth - ancho - 8)), width: ancho });
  }
  useEffect(() => {
    if (!abierto) return;
    colocar();
    const mover = (e: Event) => { if (pop.current?.contains(e.target as Node)) return; colocar(); };
    window.addEventListener('scroll', mover, true);
    window.addEventListener('resize', mover);
    return () => { window.removeEventListener('scroll', mover, true); window.removeEventListener('resize', mover); };
  }, [abierto]);
  useEffect(() => { if (act >= filas.length) setAct(-1); }, [filas.length, act]);
  useEffect(() => {
    if (abierto && act >= 0) pop.current?.querySelector<HTMLElement>(`[data-i="${act}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [act, abierto]);

  function elegir(v: string) { onCambio(v); setCerrado(true); setAct(-1); }

  return <>
    <input
      {...resto} ref={campo} id={id} type="text" value={valor} autoComplete="off"
      role="combobox" aria-autocomplete="list" aria-expanded={abierto} aria-controls={abierto ? listaId : undefined}
      aria-activedescendant={abierto && act >= 0 ? `${listaId}-${act}` : undefined} aria-invalid={ariaInvalid || undefined}
      onChange={(e) => { setCerrado(false); setAct(-1); onCambio(e.target.value); }}
      onFocus={(e) => { setFoco(true); setCerrado(false); onFocus?.(e); }}
      onBlur={(e) => { onBlur?.(e); }}
      onKeyDown={(e) => {
        if (abierto) {
          if (e.key === 'ArrowDown') { e.preventDefault(); setAct((a) => Math.min(filas.length - 1, a + 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setAct((a) => Math.max(-1, a - 1)); }
          else if (e.key === 'Enter' && act >= 0) { e.preventDefault(); elegir(filas[act].valor); }
          else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setCerrado(true); setAct(-1); }
        }
        onKeyDown?.(e);
      }}
    />
    {abierto && pos && createPortal(
      <div ref={pop} className="pref-pop campo-sug-pop" style={{ top: pos.top, left: pos.left, width: pos.width }}>
        <ul className="pref-list" id={listaId} role="listbox" aria-label="Sugerencias">
          {filas.map((f, n) => (
            <li key={f.valor} role="presentation">
              <button type="button" id={`${listaId}-${n}`} role="option" aria-selected={n === act} data-i={n} tabIndex={-1}
                className={`pref-item${n === act ? ' act' : ''}`}
                // Sin perder el foco del campo: al soltar se elige y el teclado del móvil no se cierra.
                onMouseDown={(e) => e.preventDefault()} onMouseEnter={() => setAct(n)} onClick={() => elegir(f.valor)}>
                <span className="pf-name">{f.valor}</span>
                {f.detalle ? <span className="pf-dial">{f.detalle}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      </div>,
      document.body,
    )}
  </>;
}
