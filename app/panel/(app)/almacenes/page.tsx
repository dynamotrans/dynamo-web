import { sesion, esDynamo } from '@/lib/sesion';
import AvisoCuenta from '@/components/panel/AvisoCuenta';
import Almacenes from '@/components/panel/Almacenes';
import { cargarLugares } from '@/lib/sitiosDatos';

export const dynamic = 'force-dynamic';

// Almacenes Dynamo (catálogo interno, solo Dynamo): diseño de #sec-almacenes-cat.
export default async function PaginaAlmacenes() {
  const s = await sesion();
  if (!s) return null;
  const { supabase, perfil } = s;
  if (!perfil || perfil.estado !== 'activa') return <AvisoCuenta perfil={perfil} />;
  if (!esDynamo(perfil.rol)) {
    return <section className="section active"><div className="pt-aviso error" style={{ maxWidth: 640 }}><div>Esta sección es solo del equipo de Dynamo.</div></div></section>;
  }
  const [{ filas, error, veranoDefecto }, par] = await Promise.all([
    cargarLugares(supabase, true),
    supabase.from('parametros').select('clave, valor').in('clave', ['almacen_precio_semana', 'almacen_precio_reparto']),
  ]);
  const p = new Map((par.data ?? []).map((x) => [x.clave as string, Number(x.valor)]));
  return <Almacenes filas={filas} error={error} veranoDefecto={veranoDefecto}
    precios={{ precioSemana: p.get('almacen_precio_semana') ?? 240, precioReparto: p.get('almacen_precio_reparto') ?? 220 }} />;
}
