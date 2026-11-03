import { sesion, esDynamo } from '@/lib/sesion';
import AvisoCuenta from '@/components/panel/AvisoCuenta';
import DashboardCliente, { type MiniEnvio } from '@/components/panel/DashboardCliente';

export const dynamic = 'force-dynamic';

const VIVOS = ['programado', 'hacia_la_carga', 'cargando', 'en_ruta'];

// Dashboard del cliente: diseño de #sec-dashboard de dashboard.html. El cliente ve sus
// envíos (mis_envios); Dynamo ve el mismo panel con los de todos, para saber qué ve el cliente.
export default async function PaginaDashboard() {
  const s = await sesion();
  if (!s) return null;
  const { supabase, perfil } = s;
  if (!perfil || perfil.estado !== 'activa') return <AvisoCuenta perfil={perfil} />;
  const dynamo = esDynamo(perfil.rol);

  let filas: any[] = [];
  let total = 0;
  if (dynamo) {
    const [vivos, todos] = await Promise.all([
      supabase.from('envios').select('id, referencia_gx, referencia_cliente, estado, fecha_carga_desde, fecha_carga_hasta, fecha_carga_real, ' +
        'codigo_postal_origen, poblacion_origen, codigo_postal_destino, poblacion_destino, metros_lineales, toneladas, descripcion_mercancia, clientes(nombre_visible)')
        .in('estado', VIVOS).order('fecha_carga_desde', { ascending: true, nullsFirst: false }).limit(2000),
      supabase.from('envios').select('id', { count: 'exact', head: true }).neq('estado', 'borrador'),
    ]);
    filas = (vivos.data ?? []).map((x: any) => ({ ...x, cliente: x.clientes?.nombre_visible ?? null }));
    total = todos.count ?? 0;
  } else if (perfil.rol === 'cliente') {
    const { data } = await supabase.rpc('mis_envios').limit(2000);
    total = (data ?? []).length;
    filas = (data ?? []).filter((x: any) => VIVOS.includes(x.estado))
      .sort((a: any, b: any) => (a.fecha_carga_desde ?? '9').localeCompare(b.fecha_carga_desde ?? '9'));
  }
  const mini: MiniEnvio[] = filas.slice(0, 3).map((x: any) => ({
    id: x.id, referencia_gx: x.referencia_gx, referencia_cliente: x.referencia_cliente, estado: x.estado,
    fecha_carga_desde: x.fecha_carga_real ?? x.fecha_carga_desde, fecha_carga_hasta: x.fecha_carga_real ? null : x.fecha_carga_hasta,
    origen: [x.codigo_postal_origen, x.poblacion_origen].filter(Boolean).join(' '), destino: [x.codigo_postal_destino, x.poblacion_destino].filter(Boolean).join(' '),
    metros_lineales: x.metros_lineales, toneladas: x.toneladas, mercancia: x.descripcion_mercancia, cliente: x.cliente ?? null,
  }));
  return <DashboardCliente envios={mini} activos={filas.length} dynamo={dynamo} sinEnvios={!dynamo && total === 0} />;
}
