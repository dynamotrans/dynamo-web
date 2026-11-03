import { sesion, esDynamo } from '@/lib/sesion';
import AvisoCuenta from '@/components/panel/AvisoCuenta';
import Mantenimiento from '@/components/panel/Mantenimiento';

export const dynamic = 'force-dynamic';

// Modo mantenimiento (kill-switch de la plataforma, solo admin): la ventana del mockup.
export default async function PaginaMantenimiento() {
  const s = await sesion();
  if (!s) return null;
  const { supabase, perfil } = s;
  if (!perfil || perfil.estado !== 'activa') return <AvisoCuenta perfil={perfil} />;
  if (!esDynamo(perfil.rol)) {
    return <section className="section active"><div className="pt-aviso error" style={{ maxWidth: 640 }}><div>Esta sección es solo del equipo de Dynamo.</div></div></section>;
  }
  const [{ data: activo }, { data: p }] = await Promise.all([
    supabase.rpc('mantenimiento_activo'),
    supabase.from('parametros').select('modificado_en, modificado_por').eq('clave', 'mantenimiento_activo').maybeSingle(),
  ]);
  let quien: string | null = null;
  if (p?.modificado_por) {
    const { data } = await supabase.from('usuarios').select('nombre, email').eq('id', p.modificado_por).maybeSingle();
    quien = data?.nombre || data?.email || null;
  }
  return <Mantenimiento activo={!!activo} esAdmin={perfil.rol === 'admin'} cambiado={p?.modificado_en ?? null} quien={quien} />;
}
