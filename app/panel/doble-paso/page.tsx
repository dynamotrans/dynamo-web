import { redirect } from 'next/navigation';
import { configSupabase, supabaseServidor } from '@/lib/supabase/server';
import SinConfigurar from '@/components/SinConfigurar';
import { estadoDoblePaso, movilesDe } from '@/lib/supabase/doblePaso';
import { CONTACTO } from '@/lib/atencion';
import DoblePaso from './DoblePaso';
import '../entrar/entrar.css';

export const dynamic = 'force-dynamic';

// DOBLE PASO (usuario, 2026-11-18): la pantalla del código del móvil. Se llega aquí desde
// la entrada al panel cuando a la sesión le falta el segundo paso (lib/sesion.ts), o desde
// «Mi cuenta» para darlo de alta por primera vez (?alta=1).
//   · Sin móvil dado de alta: se enseña el código QR para Google Authenticator y se pide
//     el primer código de 6 cifras.
//   · Con móvil: solo se pide el código.
// Va fuera del marco del panel: quien está aquí todavía no ha entrado.
export default async function PaginaDoblePaso({ searchParams }: { searchParams: Promise<{ alta?: string }> }) {
  if (!configSupabase()) return <SinConfigurar />;
  const supabase = await supabaseServidor();
  if (!supabase) return <SinConfigurar />;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/panel/entrar');
  const { data: perfil } = await supabase.from('usuarios').select('rol, email').eq('id', user.id).maybeSingle();
  const dp = await estadoDoblePaso(supabase, user, perfil?.rol);
  const alta = (await searchParams).alta === '1';
  // Nada que hacer aquí: ya está hecho, o ni se le exige ni ha pedido darlo de alta.
  if (dp.nivel === 'aal2' && !(alta && !dp.tieneMovil)) redirect('/panel');
  if (!dp.falta && !alta) redirect('/panel');
  const movil = movilesDe(user)[0]?.id ?? null;
  return (
    <div className="portal-page">
      <div className="portal-bg" />
      <main className="portal-wrap">
        <div className="portal-card" role="dialog" aria-labelledby="portal-title">
          <div className="portal-logo"><img src="/images/2.png" alt="Dynamo - Always Moving" /></div>
          <h1 id="portal-title" className="portal-title">{movil ? 'Código de tu móvil' : 'Activa el doble paso'}</h1>
          <p className="portal-subtitle">{movil
            ? <>Abre <strong>Google Authenticator</strong> y escribe el código de 6 cifras de Dynamo.</>
            : <>Además de tu contraseña, un <strong>código de tu móvil</strong>. Se hace una sola vez.</>}</p>
          <DoblePaso movil={movil} obligatorio={dp.obligatorio} email={perfil?.email ?? user.email ?? ''} />
        </div>
      </main>
      <footer className="portal-foot">
        © {new Date().getFullYear()} Dynamo Operador Logístico, S.L. ·{' '}
        <a href={`mailto:${CONTACTO.email}`}>{CONTACTO.email}</a>
      </footer>
    </div>
  );
}
