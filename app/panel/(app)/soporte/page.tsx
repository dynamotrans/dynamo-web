import { sesion, esDynamo } from '@/lib/sesion';
import { vistaDe } from '@/lib/vista';
import { inicioDe } from '@/lib/vistaTipo';
import AvisoCuenta from '@/components/panel/AvisoCuenta';
import Soporte from '@/components/panel/Soporte';

export const dynamic = 'force-dynamic';

// Soporte (todos los roles): la pantalla del mockup con la atención directa y los
// horarios. «← Volver» lleva al inicio del perfil que se está viendo.
export default async function PaginaSoporte() {
  const s = await sesion();
  if (!s) return null;
  const { supabase, perfil } = s;
  if (!perfil || perfil.estado !== 'activa') return <AvisoCuenta perfil={perfil} />;
  const vista = await vistaDe(supabase, perfil.rol);
  const inicio = esDynamo(perfil.rol) ? inicioDe(vista.tipo) : perfil.rol === 'transportista' ? '/panel/envios' : '/panel/dashboard';
  return <Soporte inicio={inicio} />;
}
