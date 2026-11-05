import Link from 'next/link';
import { redirect } from 'next/navigation';
import { configSupabase, supabaseServidor } from '@/lib/supabase/server';
import SinConfigurar from '@/components/SinConfigurar';
import FormRegistro from './FormRegistro';
import '../entrar/entrar.css';

export const dynamic = 'force-dynamic';

// Alta de cliente: el diseño de registro.html (aprobado). Tres pasos: datos → código del
// email → contraseña. La cuenta queda pendiente hasta que Dynamo la verifica en «Altas».
export default async function PaginaRegistro() {
  if (!configSupabase()) return <SinConfigurar />;
  const supabase = await supabaseServidor();
  const { data: { user } } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
  if (user) redirect('/panel');
  return (
    <div className="portal-page">
      <div className="portal-bg" />
      <main className="portal-wrap">
        <div className="portal-card reg-card" role="dialog" aria-labelledby="portal-title">
          <div className="portal-logo">
            <a href="/" aria-label="Volver al inicio"><img src="/images/2.png" alt="Dynamo - Always Moving" /></a>
          </div>
          <h1 id="portal-title" className="portal-title">Crear cuenta</h1>
          <p className="portal-subtitle">Alta de <strong>clientes</strong> en la plataforma de Dynamo</p>
          <FormRegistro />
          <div className="portal-divider">¿Ya tienes cuenta?</div>
          <Link href="/panel/entrar" className="portal-login-link">Iniciar sesión</Link>
          <a href="/" className="portal-back">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></svg>
            Volver al inicio
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
