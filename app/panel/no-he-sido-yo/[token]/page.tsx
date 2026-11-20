import { configSupabase } from '@/lib/supabase/server';
import TarjetaAcceso from '@/components/TarjetaAcceso';
import SinConfigurar from '@/components/SinConfigurar';
import FormNoHeSidoYo from './FormNoHeSidoYo';

export const dynamic = 'force-dynamic';

// Botón del email «Nuevo acceso a tu cuenta de Dynamo» (equipo de Dynamo, 2026-11-20).
export default async function NoHeSidoYo({ params }: { params: Promise<{ token: string }> }) {
  if (!configSupabase()) return <SinConfigurar />;
  const { token } = await params;
  return (
    <TarjetaAcceso titulo="¿No has sido tú?" subtitulo="Acceso a tu cuenta desde un dispositivo nuevo">
      <FormNoHeSidoYo token={token} />
    </TarjetaAcceso>
  );
}
