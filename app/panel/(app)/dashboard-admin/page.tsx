import { sesion, esDynamo } from '@/lib/sesion';
import AvisoCuenta from '@/components/panel/AvisoCuenta';
import DashboardAdmin, { type ProntoPago } from '@/components/panel/DashboardAdmin';
import type { MiniEnvio } from '@/components/panel/DashboardCliente';
import type { Tabla } from '@/lib/supabase/tipos';

export const dynamic = 'force-dynamic';
type FilaUltimo = Pick<Tabla<'envios'>, 'id' | 'referencia_gx' | 'referencia_cliente' | 'estado' | 'fecha_carga_desde' | 'fecha_carga_hasta' | 'fecha_carga_real'
  | 'codigo_postal_origen' | 'poblacion_origen' | 'codigo_postal_destino' | 'poblacion_destino' | 'metros_lineales' | 'toneladas' | 'descripcion_mercancia'
  | 'importe_cliente'> & { clientes: { nombre_visible: string | null } | null };

// Dashboard admin (solo Dynamo): diseño de #sec-dashboard-admin de dashboard.html.
export default async function PaginaDashboardAdmin() {
  const s = await sesion();
  if (!s) return null;
  const { supabase, perfil } = s;
  if (!perfil || perfil.estado !== 'activa') return <AvisoCuenta perfil={perfil} />;
  if (!esDynamo(perfil.rol)) {
    return <section className="section active"><div className="pt-aviso error" style={{ maxWidth: 640 }}><div>Esta sección es solo del equipo de Dynamo.</div></div></section>;
  }
  const cuenta = (q: PromiseLike<{ count: number | null }>) => q.then((r) => r.count ?? 0);
  const [enCurso, sinTransp, inc, pen, alm, contra, ultimos, pp, solicitudes] = await Promise.all([
    cuenta(supabase.from('envios').select('id', { count: 'exact', head: true }).in('estado', ['programado', 'hacia_la_carga', 'cargando', 'en_ruta'])),
    cuenta(supabase.from('envios').select('id', { count: 'exact', head: true }).eq('estado', 'programado').eq('es_manual', false).is('transportista_id', null)),
    cuenta(supabase.from('incidencias').select('id', { count: 'exact', head: true }).in('estado', ['abierto', 'en_curso'])),
    cuenta(supabase.from('penalizaciones').select('id', { count: 'exact', head: true }).eq('estado', 'pendiente_confirmar')),
    cuenta(supabase.from('almacenamientos').select('id', { count: 'exact', head: true }).eq('estado', 'pendiente_confirmar')),
    cuenta(supabase.from('envio_reservas').select('id', { count: 'exact', head: true }).eq('estado', 'pendiente_revision')),
    supabase.from('envios').select('id, referencia_gx, referencia_cliente, estado, fecha_carga_desde, fecha_carga_hasta, fecha_carga_real, ' +
      'codigo_postal_origen, poblacion_origen, codigo_postal_destino, poblacion_destino, metros_lineales, toneladas, descripcion_mercancia, importe_cliente, clientes(nombre_visible)')
      .neq('estado', 'borrador').order('creado_en', { ascending: false }).limit(5).overrideTypes<FilaUltimo[], { merge: false }>(),
    supabase.rpc('pronto_pago_estado'),
    cuenta(supabase.from('envios').select('id', { count: 'exact', head: true }).eq('estado', 'borrador').eq('estado_solicitud', 'pendiente_precio')),
  ]);
  const mini: (MiniEnvio & { importe: number | null })[] = (ultimos.data ?? []).map((x) => ({
    id: x.id, referencia_gx: x.referencia_gx, referencia_cliente: x.referencia_cliente, estado: x.estado,
    fecha_carga_desde: x.fecha_carga_real ?? x.fecha_carga_desde, fecha_carga_hasta: x.fecha_carga_real ? null : x.fecha_carga_hasta,
    origen: [x.codigo_postal_origen, x.poblacion_origen].filter(Boolean).join(' '), destino: [x.codigo_postal_destino, x.poblacion_destino].filter(Boolean).join(' '),
    metros_lineales: x.metros_lineales, toneladas: x.toneladas, mercancia: x.descripcion_mercancia, cliente: x.clientes?.nombre_visible ?? null,
    importe: x.importe_cliente != null ? Number(x.importe_cliente) : null,
  }));
  return <DashboardAdmin cifras={{ enCurso, sinTransp, inc, pen, alm, contra, solicitudes }} ultimos={mini}
    prontoPago={(pp.data as ProntoPago) ?? null} errorPP={pp.error?.message ?? null} />;
}
