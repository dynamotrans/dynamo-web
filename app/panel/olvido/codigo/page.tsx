import Link from 'next/link';
import { redirect } from 'next/navigation';
import { configSupabase } from '@/lib/supabase/server';
import TarjetaAcceso from '@/components/TarjetaAcceso';
import SinConfigurar from '@/components/SinConfigurar';
import FormCodigo from './FormCodigo';

export const dynamic = 'force-dynamic';

// Paso 2 de «¿Olvidaste tu contraseña?»: el código de 6 cifras que llega al email (o el
// enlace del mismo email, que lleva a /panel/confirmar). Después, crear la contraseña.
export default async function PaginaCodigoOlvido({ searchParams }: { searchParams: Promise<{ email?: string }> }) {
  if (!configSupabase()) return <SinConfigurar />;
  const email = String((await searchParams).email ?? '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) redirect('/panel/olvido');
  return (
    <TarjetaAcceso titulo="Revisa tu email"
                   subtitulo={<>Si <strong>{email}</strong> tiene cuenta en la plataforma, le hemos enviado un email con un enlace y un código. Pulsa el enlace o escribe aquí las 6 cifras.</>}>
      <FormCodigo email={email} />
      <p className="reg-helper" style={{ marginTop: '1rem' }}>
        ¿No te llega? Mira en <strong>spam</strong> o en <strong>promociones</strong>. Si el email está mal,{' '}
        <Link href="/panel/olvido" style={{ color: 'var(--purple)', fontWeight: 700 }}>vuelve a empezar</Link>.
      </p>
    </TarjetaAcceso>
  );
}
