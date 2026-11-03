import { supabaseServidor } from '@/lib/supabase/server';
import TarjetaAcceso from '@/components/TarjetaAcceso';
import SinConfigurar from '@/components/SinConfigurar';
import FormClave from './FormClave';

export const dynamic = 'force-dynamic';

// Crear la contraseña (al aceptar la invitación) o cambiarla (tras «¿Olvidaste tu
// contraseña?»). Hace falta sesión: la da el enlace del email (/panel/confirmar).
export default async function NuevaContrasena() {
  const supabase = await supabaseServidor();
  if (!supabase) return <SinConfigurar />;
  const { data: { user } } = await supabase.auth.getUser();
  return (
    <TarjetaAcceso titulo="Crea tu contraseña" subtitulo={user?.email ? <>Para <strong>{user.email}</strong></> : undefined}>
      <FormClave />
    </TarjetaAcceso>
  );
}
