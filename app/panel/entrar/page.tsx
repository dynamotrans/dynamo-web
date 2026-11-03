import { configSupabase } from '@/lib/supabase/server';
import SinConfigurar from '@/components/SinConfigurar';
import FormEntrar from './FormEntrar';
import CrearCuenta from './CrearCuenta';
import './entrar.css';

export const dynamic = 'force-dynamic';

// Mismo diseño que portal.html (la pantalla de acceso aprobada), con el login real.
// Fuera del mockup: el cartel "Modo demo" y su explicación (ya no es demo). "Crear
// cuenta" lleva al alta de clientes (/panel/registro).
export default function PaginaEntrar() {
  if (!configSupabase()) return <SinConfigurar />;
  return (
    <div className="portal-page">
      <div className="portal-bg" />
      <main className="portal-wrap">
        <div className="portal-card" role="dialog" aria-labelledby="portal-title">
          <div className="portal-logo">
            <a href="/" aria-label="Volver al inicio"><img src="/images/2.png" alt="Dynamo - Always Moving" /></a>
          </div>
          <h1 id="portal-title" className="portal-title">Acceso al Portal</h1>
          <p className="portal-subtitle">Área privada para <strong>clientes</strong> de Dynamo</p>

          <FormEntrar />
          <CrearCuenta />

          <a href="/" className="portal-back">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></svg>
            Volver al inicio
          </a>
        </div>
      </main>
      <footer className="portal-foot">
        © {new Date().getFullYear()} Dynamo Operador de Transportes ·{' '}
        <a href="mailto:info@dynamotrans.com">info@dynamotrans.com</a>
      </footer>
    </div>
  );
}
