import { configSupabase } from '@/lib/supabase/server';
import TarjetaAcceso from '@/components/TarjetaAcceso';
import SinConfigurar from '@/components/SinConfigurar';
import FormOlvido from './FormOlvido';

export const dynamic = 'force-dynamic';

export default function Olvido() {
  if (!configSupabase()) return <SinConfigurar />;
  return (
    <TarjetaAcceso titulo="¿Olvidaste tu contraseña?" subtitulo="Te mandamos un enlace para crear una nueva">
      <FormOlvido />
    </TarjetaAcceso>
  );
}
