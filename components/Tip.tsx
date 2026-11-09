'use client';

// Icono ⓘ con globo de ayuda: se abre por hover en escritorio y por TAP (foco) en
// móvil; se cierra al tocar fuera. El globo flota anclado al icono, sin ocupar sitio.
export default function Tip({ texto, aria }: { texto: string; aria?: string }) {
  return (
    <span className="tip-i">
      <button type="button" className="tip-i-btn" aria-label={aria ?? 'Más información'}>ⓘ</button>
      <span className="tip-i-pop" role="tooltip">{texto}</span>
    </span>
  );
}
