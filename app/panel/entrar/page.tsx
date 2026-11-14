import { configSupabase } from '@/lib/supabase/server';
import SinConfigurar from '@/components/SinConfigurar';
import FormEntrar from './FormEntrar';
import CrearCuenta from './CrearCuenta';
import './entrar.css';
import { CONTACTO } from '@/lib/atencion';

export const dynamic = 'force-dynamic';

// Mismo diseño que portal.html (la pantalla de acceso aprobada), con el login real.
// Fuera del mockup: el cartel "Modo demo" y su explicación (ya no es demo). "Crear
// cuenta" lleva al alta de clientes (/panel/registro).
export default async function PaginaEntrar({ searchParams }: { searchParams: Promise<{ sesion?: string }> }) {
  if (!configSupabase()) return <SinConfigurar />;
  const sp = (await searchParams).sesion;
  const caducada = sp === 'caducada';
  return (
    <div className="portal-page">
      <div className="portal-bg" />
      <main className="portal-wrap">
        <div className="portal-card" role="dialog" aria-labelledby="portal-title">
          <div className="portal-logo">
            <a href="/" aria-label="Volver al inicio"><img src="/images/2.png" alt="Dynamo - Always Moving" /></a>
          </div>
          <h1 id="portal-title" className="portal-title">Acceso al portal</h1>
          <p className="portal-subtitle">Área privada para <strong>clientes</strong> de Dynamo</p>

          <FormEntrar caducada={caducada} baja={sp === 'baja'} suspendidaTotal={sp === 'suspendida_total'} />
          <CrearCuenta />

          <a href="/" className="portal-back">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></svg>
            Volver al inicio
          </a>
        </div>
      </main>
      <footer className="portal-foot">
        © {new Date().getFullYear()} Dynamo Operador Logístico, S.L. ·{' '}
        <a href={`mailto:${CONTACTO.email}`}>{CONTACTO.email}</a>
      </footer>
    </div>
  );
}
