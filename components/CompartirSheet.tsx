'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

// Ventana de COMPARTIR propia de Dynamo (usuario, 2026-11-11): el mismo diseño sencillo
// en cualquier aparato (móvil, escritorio, tableta), en vez de la hoja del sistema, que
// en cada sitio sale distinta. Opciones: WhatsApp, Email, SMS, Copiar y, si el aparato
// tiene hoja de compartir del sistema, «Más opciones…» la abre.
// Estilos en línea a propósito: la usan la página pública del CMR y el panel, sin
// depender del CSS de ninguna de las dos.
export default function CompartirSheet({ titulo, texto, url, onCerrar }: {
  titulo: string; texto: string; url: string; onCerrar: () => void;
}) {
  const [copiado, setCopiado] = useState(false);
  // En PORTAL al body (2026-11-11): dentro de otra ventana (el modal del panel), la
  // animación/transform de la tarjeta atrapa al position:fixed y la hoja salía recortada
  // y mal colocada. Montada en el body, pinta entera y por encima de todo.
  const [montado, setMontado] = useState(false);
  useEffect(() => setMontado(true), []);
  const cuerpo = `${texto}\n${url}`;
  const enc = encodeURIComponent(cuerpo);
  const opcion: React.CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
    width: '100%', padding: '0.85rem 1rem', borderRadius: 12, fontSize: '1rem', fontWeight: 800,
    textDecoration: 'none', border: 'none', cursor: 'pointer', boxSizing: 'border-box',
  };
  if (!montado) return null;
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Compartir"
      style={{ position: 'fixed', inset: 0, zIndex: 100100, background: 'rgba(10,2,48,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.2rem' }}
      onClick={(ev) => { if (ev.target === ev.currentTarget) onCerrar(); }}>
      <div style={{ background: '#fff', borderRadius: 18, padding: '1.2rem 1.1rem', maxWidth: 380, width: '100%', boxShadow: '0 24px 60px rgba(10,2,48,0.35)' }}>
        <h2 style={{ margin: '0 0 0.15rem', fontSize: '1.05rem', color: '#0a0230' }}>Compartir</h2>
        <p style={{ margin: '0 0 0.8rem', fontSize: '0.8rem', color: '#6b7280', overflowWrap: 'anywhere' }}>{titulo}</p>
        <div style={{ display: 'grid', gap: '0.5rem' }}>
          <a style={{ ...opcion, background: '#25D366', color: '#fff' }} href={`https://wa.me/?text=${enc}`} target="_blank" rel="noopener">WhatsApp</a>
          <a style={{ ...opcion, background: '#3300cc', color: '#fff' }} href={`mailto:?subject=${encodeURIComponent(titulo)}&body=${enc}`}>Email</a>
          {/* sms: con «?&body» funciona en iOS y Android (la rareza es a propósito). */}
          <a style={{ ...opcion, background: '#0ea5e9', color: '#fff' }} href={`sms:?&body=${enc}`}>SMS</a>
          <button type="button" style={{ ...opcion, background: '#fff', color: '#0a0230', border: '1.5px solid #d7dae0' }}
            onClick={() => { navigator.clipboard?.writeText(cuerpo); setCopiado(true); setTimeout(() => setCopiado(false), 1800); }}>
            {copiado ? '✓ Copiado' : 'Copiar enlace y mensaje'}
          </button>
          {typeof navigator !== 'undefined' && typeof navigator.share === 'function' && (
            <button type="button" style={{ ...opcion, background: '#fff', color: '#0a0230', border: '1.5px solid #d7dae0' }}
              onClick={() => { navigator.share({ title: titulo, text: texto, url }).catch(() => {}); }}>
              Más opciones…
            </button>
          )}
          <button type="button" style={{ ...opcion, background: 'none', color: '#6b7280', fontWeight: 700, padding: '0.6rem 1rem' }} onClick={onCerrar}>Cancelar</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
