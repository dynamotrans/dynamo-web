import '@/app/panel/entrar/entrar.css';

// Marco de las pantallas de acceso (entrar, crear contraseña, olvido): el mismo diseño
// que portal.html.
export default function TarjetaAcceso({ titulo, subtitulo, children }: { titulo: string; subtitulo?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="portal-page">
      <div className="portal-bg" />
      <main className="portal-wrap">
        <div className="portal-card" role="dialog" aria-labelledby="portal-title">
          <div className="portal-logo">
            <a href="/" aria-label="Volver al inicio"><img src="/images/2.png" alt="Dynamo - Always Moving" /></a>
          </div>
          <h1 id="portal-title" className="portal-title">{titulo}</h1>
          {subtitulo && <p className="portal-subtitle">{subtitulo}</p>}
          {children}
          <a href="/panel/entrar" className="portal-back">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></svg>
            Volver a la entrada
          </a>
        </div>
      </main>
      <footer className="portal-foot">
        © {new Date().getFullYear()} Dynamo Operador Logístico, S.L. ·{' '}
        <a href="mailto:info@dynamotrans.com">info@dynamotrans.com</a>
      </footer>
    </div>
  );
}
