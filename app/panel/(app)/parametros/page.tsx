import { sesion, esDynamo } from '@/lib/sesion';
import AvisoCuenta from '@/components/panel/AvisoCuenta';
import Parametros, { type ParametroFila } from '@/components/panel/Parametros';

export const dynamic = 'force-dynamic';

// Parámetros de la plataforma (tabla `parametros`): los números que mueven las reglas
// (bienvenida, pronto pago, almacenes, PIN, reservas…). Los ve Dynamo; los cambia un admin.
export default async function PaginaParametros() {
  const s = await sesion();
  if (!s) return null;
  const { supabase, perfil } = s;
  if (!perfil || perfil.estado !== 'activa') return <AvisoCuenta perfil={perfil} />;
  if (!esDynamo(perfil.rol)) {
    return <section className="section active"><div className="pt-aviso error" style={{ maxWidth: 640 }}><div>Esta sección es solo del equipo de Dynamo.</div></div></section>;
  }
  const { data, error } = await supabase.from('parametros').select('clave, valor, descripcion, modificado_en').order('clave');
  return <Parametros filas={(data ?? []) as ParametroFila[]} esAdmin={perfil.rol === 'admin'} error={error?.message ?? null} />;
}
