'use client';

// Ventana del panel: la misma de dashboard.html (#dashModal, clases dash-modal-*).
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

export default function Modal({ titulo, sub, icono, abierto, onCerrar, pie, acciones, ancho, envivo, children }: {
  titulo: string; sub?: React.ReactNode; icono?: React.ReactNode; abierto: boolean;
  onCerrar: () => void; pie?: React.ReactNode; children: React.ReactNode;
  acciones?: React.ReactNode;   // barra de acciones bajo el título (la del "Ver detalle" del mockup)
  ancho?: number;               // ancho máximo de la ventana, si hace falta más que el normal
  envivo?: boolean;             // ventana de LECTURA (fichas): no bloquea el refresco en vivo
}) {
  useEffect(() => {
    if (!abierto) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onCerrar(); };
    document.addEventListener('keydown', esc);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', esc); document.body.style.overflow = ''; };
  }, [abierto, onCerrar]);
  // NO ABRIR A MEDIA ENTRADA DE LA PÁGINA (usuario, 2026-11-17: «hace algo raro al abrir»).
  // Cuando la página llega con la ventana ya abierta (?abrir=1, ?nueva=…, ?ver=…), la
  // sección todavía está haciendo su animación de entrada, y mientras dura un «position:
  // fixed» de dentro se coloca respecto a la sección, no a la pantalla: la ventana salía
  // descolocada, con el fondo oscuro a medias, y al acabar daba un salto. Aquí se espera a
  // que termine cualquier animación de lo que la contiene; solo entonces se enseña, ya en
  // su sitio. Abierta con un clic no hay nada que esperar y sale al momento.
  const raiz = useRef<HTMLDivElement>(null);
  const [lista, setLista] = useState(false);
  useLayoutEffect(() => {
    if (!abierto) { setLista(false); return; }
    const yo = raiz.current;
    const enCurso = !yo || typeof document.getAnimations !== 'function' ? [] : document.getAnimations().filter((a) => {
      const t = (a.effect as KeyframeEffect | null)?.target;
      // Solo las que ACABAN: una animación sin fin (un parpadeo) no se espera nunca.
      const fin = Number(a.effect?.getComputedTiming().endTime);
      return a.playState === 'running' && Number.isFinite(fin) && !!t && t !== yo && t.contains(yo);
    });
    if (!enCurso.length) { setLista(true); return; }
    let vivo = true;
    const abrir = () => { if (vivo) setLista(true); };
    Promise.allSettled(enCurso.map((a) => a.finished)).then(abrir);
    const tope = setTimeout(abrir, 700);   // por si acaso: nunca se queda sin abrir
    return () => { vivo = false; clearTimeout(tope); };
  }, [abierto]);
  if (!abierto) return null;
  return (
    // Pulsar fuera de la tarjeta (en la zona oscurecida) cierra, igual que la X. Se usa
    // onMouseDown y se comprueba que el punto pulsado es el fondo o el contenedor, no la
    // tarjeta: así no se cierra sin querer al soltar fuera tras seleccionar texto dentro.
    <div ref={raiz} className={`dash-modal${lista ? ' open' : ''}`} role="dialog" aria-modal="true" aria-labelledby="dashModalTitle"
      data-envivo-permitir={envivo ? '' : undefined}
      onMouseDown={(ev) => { if (ev.button === 0 && ev.target === ev.currentTarget) onCerrar(); }}>
      <div className="dash-modal-backdrop" onMouseDown={(ev) => { if (ev.button === 0) onCerrar(); }} />
      <div className="dash-modal-card" role="document" style={ancho ? { maxWidth: ancho } : undefined}>
        <button className="dash-modal-close" onClick={onCerrar} aria-label="Cerrar">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        </button>
        <div className="dash-modal-header">
          {icono && <div className="dash-modal-icon">{icono}</div>}
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 className="dash-modal-title" id="dashModalTitle">{titulo}</h2>
            {sub && <p className="dash-modal-sub">{sub}</p>}
          </div>
        </div>
        {acciones && <div className="dash-modal-actions">{acciones}</div>}
        <div className="dash-modal-body">{children}</div>
        {pie && <div className="dash-modal-footer">{pie}</div>}
      </div>
    </div>
  );
}
