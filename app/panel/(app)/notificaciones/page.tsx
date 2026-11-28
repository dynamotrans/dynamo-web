import { sesion, esDynamo, sinAcceso } from '@/lib/sesion';
import AvisoCuenta from '@/components/panel/AvisoCuenta';
import Notificaciones, { type NotificacionFila } from '@/components/panel/Notificaciones';

export const dynamic = 'force-dynamic';

// NOTIFICACIONES (usuario, 2026-11-28): qué avisos manda la plataforma y por dónde (email y/o
// WhatsApp). Las ve el equipo de Dynamo; las cambia el Admin Master (como los parámetros).
export default async function PaginaNotificaciones() {
  const s = await sesion();
  if (!s) return null;
  const { supabase, perfil } = s;
  if (sinAcceso(perfil)) return <AvisoCuenta perfil={perfil} />;
  if (!esDynamo(perfil.rol)) {
    return <section className="section active"><div className="pt-aviso error" style={{ maxWidth: 640 }}><div>Esta sección es solo del equipo de Dynamo.</div></div></section>;
  }
  const { data, error } = await supabase.from('notificaciones')
    .select('tipo, grupo, orden, titulo, descripcion, bloqueada, activa, email, whatsapp, whatsapp_plantilla')
    .order('grupo').order('orden');
  return <Notificaciones filas={(data ?? []) as NotificacionFila[]} puedeCambiar={perfil.rol === 'admin'} error={error?.message ?? null} />;
}
