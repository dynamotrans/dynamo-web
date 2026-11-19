'use client';

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { fecha as fechaTxt } from '@/lib/formato';

// ---- Un solo calendario en toda la plataforma (usuario, 2026-11-19) ----------------------
// Sustituye al calendario del navegador (`<input type="date">`), que cambiaba de aspecto en
// cada sitio y en Chrome, al pasar de mes con las flechas, cambiaba la fecha y cerraba la
// ventana que lo contenía. Este se abre bajo el campo, pasa de mes sin tocar la fecha y solo
// elige al pulsar un día. Esquinas redondas, sombra suave y el día elegido en morado claro
// con el texto oscuro.
// Valor y cambios en ISO (AAAA-MM-DD), como el campo de antes; '' = sin fecha.

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DIAS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const DIAS_LARGOS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];

const dosCifras = (n: number) => String(n).padStart(2, '0');
const aIso = (a: number, m: number, d: number) => `${a}-${dosCifras(m + 1)}-${dosCifras(d)}`;
function hoyIso(): string {
  const d = new Date();
  return aIso(d.getFullYear(), d.getMonth(), d.getDate());
}
const desdeIso = (v: string) => { const [a, m, d] = v.split('-').map(Number); return { a, m: m - 1, d }; };

export type CampoFechaProps = {
  value: string;
  onChange: (v: string) => void;
  id?: string;
  name?: string;                 // si va dentro de un <form> que se lee con FormData
  min?: string;
  max?: string;
  disabled?: boolean;
  className?: string;            // las clases del campo de cada pantalla (param-input, ptar-select…)
  style?: React.CSSProperties;
  placeholder?: string;
  'aria-label'?: string;
  soloHabiles?: boolean;         // sin sábados, domingos ni festivos
  festivos?: Set<string> | string[];
  permitirBorrar?: boolean;      // botón «Borrar» abajo (por defecto, sí)
  abiertoAlInicio?: boolean;     // se abre solo al aparecer (Nuevo envío → «otra fecha»)
  onCerrar?: () => void;
};

export default function CampoFecha(p: CampoFechaProps) {
  const auto = useId();
  const id = p.id ?? `cf-${auto}`;
  const [abierto, setAbierto] = useState(!!p.abiertoAlInicio && !p.disabled);
  const inicial = p.value || (p.min && p.min > hoyIso() ? p.min : hoyIso());
  const [vista, setVista] = useState(() => { const x = desdeIso(inicial); return { a: x.a, m: x.m }; });
  const [foco, setFoco] = useState<string>(inicial);
  const [pos, setPos] = useState<{ top: number; left: number; ancho: number } | null>(null);
  const campoRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const fest = useMemo(() => (p.festivos instanceof Set ? p.festivos : new Set(p.festivos ?? [])), [p.festivos]);

  const bloqueado = useCallback((iso: string) => {
    if (p.min && iso < p.min) return true;
    if (p.max && iso > p.max) return true;
    if (p.soloHabiles) {
      const { a, m, d } = desdeIso(iso);
      const dia = new Date(a, m, d).getDay();
      if (dia === 0 || dia === 6 || fest.has(iso)) return true;
    }
    return false;
  }, [p.min, p.max, p.soloHabiles, fest]);

  // Al abrir, el mes del día elegido (o de hoy / el mínimo).
  const abrir = () => {
    if (p.disabled) return;
    const base = p.value || (p.min && p.min > hoyIso() ? p.min : hoyIso());
    const x = desdeIso(base);
    setVista({ a: x.a, m: x.m }); setFoco(base); setAbierto(true);
  };
  const cerrar = useCallback((devolverFoco = true) => {
    setAbierto(false);
    if (devolverFoco) campoRef.current?.focus();
    p.onCerrar?.();
  }, [p]);

  // Posición: debajo del campo y, si no cabe, encima. Fijo a la pantalla, para que ninguna
  // ventana con barra de desplazamiento lo recorte.
  const colocar = useCallback(() => {
    const r = campoRef.current?.getBoundingClientRect();
    if (!r) return;
    const ancho = Math.min(312, window.innerWidth - 16);
    const alto = panelRef.current?.offsetHeight ?? 360;
    const left = Math.max(8, Math.min(r.left, window.innerWidth - ancho - 8));
    const top = r.bottom + 6 + alto > window.innerHeight && r.top - 6 - alto > 0 ? r.top - 6 - alto : r.bottom + 6;
    setPos({ top, left, ancho });
  }, []);
  useLayoutEffect(() => { if (abierto) colocar(); }, [abierto, colocar, vista]);
  useEffect(() => {
    if (!abierto) return;
    const fuera = (ev: MouseEvent | TouchEvent) => {
      const t = ev.target as Node;
      if (panelRef.current?.contains(t) || campoRef.current?.contains(t)) return;
      cerrar(false);
    };
    const mover = () => colocar();
    document.addEventListener('mousedown', fuera, true);
    document.addEventListener('touchstart', fuera, true);
    window.addEventListener('resize', mover);
    window.addEventListener('scroll', mover, true);
    return () => {
      document.removeEventListener('mousedown', fuera, true);
      document.removeEventListener('touchstart', fuera, true);
      window.removeEventListener('resize', mover);
      window.removeEventListener('scroll', mover, true);
    };
  }, [abierto, cerrar, colocar]);
  // El foco del teclado, en el día marcado.
  useEffect(() => {
    if (abierto) panelRef.current?.querySelector<HTMLButtonElement>(`button[data-dia="${foco}"]`)?.focus({ preventScroll: true });
  }, [abierto, foco, vista]);

  const elegir = (iso: string) => { if (bloqueado(iso)) return; p.onChange(iso); cerrar(); };
  const pasarMes = (n: number) => setVista((v) => { const d = new Date(v.a, v.m + n, 1); return { a: d.getFullYear(), m: d.getMonth() }; });
  const moverFoco = (dias: number) => {
    const { a, m, d } = desdeIso(foco);
    const x = new Date(a, m, d + dias);
    const iso = aIso(x.getFullYear(), x.getMonth(), x.getDate());
    setFoco(iso); setVista({ a: x.getFullYear(), m: x.getMonth() });
  };
  const teclado = (ev: React.KeyboardEvent) => {
    const k: Record<string, () => void> = {
      ArrowLeft: () => moverFoco(-1), ArrowRight: () => moverFoco(1), ArrowUp: () => moverFoco(-7), ArrowDown: () => moverFoco(7),
      PageUp: () => pasarMes(-1), PageDown: () => pasarMes(1), Escape: () => cerrar(),
    };
    if (k[ev.key]) { ev.preventDefault(); ev.stopPropagation(); k[ev.key](); }
  };

  // Las semanas del mes a la vista, de lunes a domingo.
  const primero = new Date(vista.a, vista.m, 1);
  const hueco = (primero.getDay() + 6) % 7;
  const diasMes = new Date(vista.a, vista.m + 1, 0).getDate();
  const celdas: (string | null)[] = [...Array(hueco).fill(null), ...Array.from({ length: diasMes }, (_, i) => aIso(vista.a, vista.m, i + 1))];
  while (celdas.length % 7) celdas.push(null);
  const hoy = hoyIso();
  const mesAntesBloqueado = !!p.min && aIso(vista.a, vista.m, 1) <= p.min;
  const mesDespuesBloqueado = !!p.max && aIso(vista.a, vista.m, diasMes) >= p.max;

  return (
    <>
      <button ref={campoRef} type="button" id={id} className={`campo-fecha ${p.className ?? ''}`} style={p.style} disabled={p.disabled}
        aria-label={p['aria-label']} aria-haspopup="dialog" aria-expanded={abierto} data-valor={p.value || ''}
        onClick={() => (abierto ? cerrar() : abrir())}
        onKeyDown={(ev) => { if (ev.key === 'ArrowDown' && !abierto) { ev.preventDefault(); abrir(); } }}>
        <span className={p.value ? 'campo-fecha-txt' : 'campo-fecha-txt campo-fecha-vacio'}>{p.value ? fechaTxt(p.value) : (p.placeholder ?? 'Elige el día')}</span>
        <svg className="campo-fecha-ico" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="4" width="18" height="18" rx="3" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
        </svg>
      </button>
      {p.name && <input type="hidden" name={p.name} value={p.value} />}
      {abierto && typeof document !== 'undefined' && createPortal(
        <div ref={panelRef} className="cal-panel" role="dialog" aria-label="Calendario" onKeyDown={teclado}
          // Nada de lo que se pulse aquí debe llegar a la ventana que lo contiene (cerrarla, enviarla…).
          onClick={(ev) => ev.stopPropagation()} onMouseDown={(ev) => ev.stopPropagation()}
          style={{ top: pos?.top ?? -9999, left: pos?.left ?? 0, width: pos?.ancho ?? 312, visibility: pos ? 'visible' : 'hidden' }}>
          <div className="cal-cab">
            <span className="cal-mes" aria-live="polite">{MESES[vista.m]} {vista.a}</span>
            <span className="cal-flechas">
              <button type="button" className="cal-flecha" aria-label="Mes anterior" disabled={mesAntesBloqueado} onClick={() => pasarMes(-1)}>
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6" /></svg>
              </button>
              <button type="button" className="cal-flecha" aria-label="Mes siguiente" disabled={mesDespuesBloqueado} onClick={() => pasarMes(1)}>
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6" /></svg>
              </button>
            </span>
          </div>
          <div className="cal-rejilla" role="grid">
            {DIAS.map((d, i) => <span key={d} className={`cal-sem${i > 4 ? ' cal-finde' : ''}`} role="columnheader" aria-label={DIAS_LARGOS[i]}>{d}</span>)}
            {celdas.map((iso, i) => iso === null ? <span key={`v${i}`} /> : (
              <button key={iso} type="button" data-dia={iso} tabIndex={iso === foco ? 0 : -1}
                className={`cal-dia${iso === p.value ? ' cal-elegido' : ''}${iso === hoy ? ' cal-hoy' : ''}${i % 7 > 4 ? ' cal-finde' : ''}`}
                disabled={bloqueado(iso)} aria-pressed={iso === p.value} aria-label={fechaTxt(iso)} onClick={() => elegir(iso)}>
                {Number(iso.slice(8))}
              </button>
            ))}
          </div>
          <div className="cal-pie">
            {(p.permitirBorrar ?? true) && p.value
              ? <button type="button" className="cal-pie-btn" onClick={() => { p.onChange(''); cerrar(); }}>Borrar</button> : <span />}
            <button type="button" className="cal-pie-btn cal-pie-hoy" disabled={bloqueado(hoy)}
              onClick={() => { const x = desdeIso(hoy); setVista({ a: x.a, m: x.m }); elegir(hoy); }}>Hoy</button>
          </div>
        </div>, document.body)}
    </>
  );
}
