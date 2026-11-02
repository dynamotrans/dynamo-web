import { configSupabase } from '@/lib/supabase/server';
import SinConfigurar from '@/components/SinConfigurar';
import FormEntrar from './FormEntrar';

export const dynamic = 'force-dynamic';

export default function PaginaEntrar() {
  if (!configSupabase()) return <SinConfigurar />;
  return (
    <div className="pt-entrar">
      <div className="pt-card">
        <img className="logo" src="/images/2.png" alt="Dynamo" />
        <h1>Plataforma Dynamo</h1>
        <p className="sub">Entra con tu correo y tu contraseña.</p>
        <FormEntrar />
        <a className="volver" href="/">Volver a dynamotrans.com</a>
      </div>
    </div>
  );
}
