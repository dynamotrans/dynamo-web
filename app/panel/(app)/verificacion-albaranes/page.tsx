import { sesion, esDynamo, sinAcceso, esSoloLectura } from '@/lib/sesion';
import AvisoCuenta from '@/components/panel/AvisoCuenta';
import VerificacionAlbaranes, { type AlbaranPendiente } from '@/components/panel/VerificacionAlbaranes';

export const dynamic = 'force-dynamic';

// Verificación de albaranes (solo Dynamo): los que llegan de los transportistas esperan aquí,
// invisibles para el cliente, hasta que se aceptan o se rechazan.
export default async function PaginaVerificacionAlbaranes() {
  const s = await sesion();
  if (!s) return null;
  const { supabase, perfil } = s;
  if (sinAcceso(perfil)) return <AvisoCuenta perfil={perfil} />;
  if (!esDynamo(perfil.rol)) {
    return <section className="section active"><div className="pt-aviso error" style={{ maxWidth: 640 }}><div>Esta sección es solo del equipo de Dynamo.</div></div></section>;
  }
  const { data } = await supabase.rpc('verificacion_albaranes_lista');
  return <VerificacionAlbaranes lista={(data ?? []) as unknown as AlbaranPendiente[]} soloLectura={esSoloLectura(perfil.rol)} />;
}
