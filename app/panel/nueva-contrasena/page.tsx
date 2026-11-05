import Link from 'next/link';
import { supabaseServidor } from '@/lib/supabase/server';
import TarjetaAcceso from '@/components/TarjetaAcceso';
import SinConfigurar from '@/components/SinConfigurar';
import FormClave from './FormClave';
import { vieneDeEnlace } from '@/lib/vieneDeEnlace';

export const dynamic = 'force-dynamic';

// Crear la contraseña (al aceptar la invitación) o cambiarla (tras «¿Olvidaste tu
// contraseña?»). Hace falta sesión: la da el enlace del email (/panel/confirmar).
export default async function NuevaContrasena() {
  const supabase = await supabaseServidor();
  if (!supabase) return <SinConfigurar />;
  const { data: { user } } = await supabase.auth.getUser();
  if (user && !(await vieneDeEnlace(supabase))) {
    return (
      <TarjetaAcceso titulo="Cambiar la contraseña">
        <div className="pt-aviso info"><div>Para cambiar tu contraseña ve a <Link href="/panel/mi-cuenta"><strong>Mi cuenta</strong></Link> (te pedirá la actual). Si no la recuerdas, cierra sesión y usa «¿Olvidaste tu contraseña?».</div></div>
      </TarjetaAcceso>
    );
  }
  return (
    <TarjetaAcceso titulo="Crea tu contraseña" subtitulo={user?.email ? <>Para <strong>{user.email}</strong></> : undefined}>
      <FormClave />
    </TarjetaAcceso>
  );
}
