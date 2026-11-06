import { sesion, esDynamo } from '@/lib/sesion';
import AvisoCuenta from '@/components/panel/AvisoCuenta';
import Riesgos, { type RiesgoFila } from '@/components/panel/Riesgos';

export const dynamic = 'force-dynamic';

// CESCE - Riesgos (solo Dynamo): por cliente, el crédito concedido (CESCE y manual), el
// que limita, lo asumido en los últimos días (envíos sin cobrar, con IVA) y lo disponible.
export default async function PaginaRiesgos() {
  const s = await sesion();
  if (!s) return null;
  const { supabase, perfil } = s;
  if (!perfil || perfil.estado !== 'activa') return <AvisoCuenta perfil={perfil} />;
  if (!esDynamo(perfil.rol)) {
    return <section className="section active"><div className="pt-aviso error" style={{ maxWidth: 640 }}><div>Esta sección es solo del equipo de Dynamo.</div></div></section>;
  }
  const [r, p] = await Promise.all([
    supabase.rpc('riesgos_clientes'),
    supabase.from('parametros').select('valor').eq('clave', 'riesgo_dias_asumido').maybeSingle(),
  ]);
  const num = (x: unknown) => (x == null ? null : Number(x));
  const filas: RiesgoFila[] = (r.data ?? []).map((x) => ({
    id: x.cliente_id, nombre: x.nombre, cif: x.cif, cesce: num(x.riesgo_cesce), plazo: x.plazo_cesce, manual: num(x.riesgo_manual),
    limite: num(x.riesgo_efectivo), manda: x.manda as RiesgoFila['manda'], envios: x.envios, base: Number(x.asumido_base), asumido: Number(x.asumido),
    disponible: num(x.disponible), ultimo: x.ultimo_envio,
  }));
  return <Riesgos filas={filas} dias={Number(p.data?.valor ?? 60)} error={r.error?.message ?? null} />;
}
