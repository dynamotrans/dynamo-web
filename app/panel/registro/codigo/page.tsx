import Link from 'next/link';
import { redirect } from 'next/navigation';
import { configSupabase } from '@/lib/supabase/server';
import TarjetaAcceso from '@/components/TarjetaAcceso';
import SinConfigurar from '@/components/SinConfigurar';
import FormCodigo from './FormCodigo';

export const dynamic = 'force-dynamic';

// Paso 2 del alta: el código de 6 cifras que llega al email (o el enlace del mismo email,
// que lleva a /panel/confirmar). Después, crear la contraseña.
export default async function PaginaCodigo({ searchParams }: { searchParams: Promise<{ email?: string }> }) {
  if (!configSupabase()) return <SinConfigurar />;
  const email = String((await searchParams).email ?? '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) redirect('/panel/registro');
  return (
    <TarjetaAcceso titulo="Revisa tu email"
                   subtitulo={<>Te hemos enviado un enlace y un código a <strong>{email}</strong>. Pulsa el enlace o escribe aquí las 6 cifras.</>}>
      <FormCodigo email={email} />
      <p className="reg-helper" style={{ marginTop: '1rem' }}>
        ¿No te llega? Mira en <strong>spam</strong> o en <strong>promociones</strong>. Si el email está mal,{' '}
        <Link href="/panel/registro" style={{ color: 'var(--purple)', fontWeight: 700 }}>vuelve a empezar</Link>.
      </p>
    </TarjetaAcceso>
  );
}
