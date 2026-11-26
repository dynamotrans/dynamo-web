import { sesion, esDynamo, sinAcceso } from '@/lib/sesion';
import { vistaDe, filtrarVista } from '@/lib/vista';
import AvisoCuenta from '@/components/panel/AvisoCuenta';
import DashboardCliente, { type MiniEnvio } from '@/components/panel/DashboardCliente';
import type { Enum, Tabla } from '@/lib/supabase/tipos';
import { estadoVisual, fechaCarga, type EnvioFila } from '@/lib/envios';

export const dynamic = 'force-dynamic';

type FilaVivo = Pick<Tabla<'envios'>, 'id' | 'referencia_gx' | 'referencia_cliente' | 'estado' | 'fecha_carga_desde' | 'fecha_carga_hasta' | 'fecha_carga_real'
  | 'estado_asignacion' | 'es_manual' | 'codigo_postal_origen' | 'poblacion_origen' | 'codigo_postal_destino' | 'poblacion_destino' | 'metros_lineales' | 'toneladas' | 'descripcion_mercancia'>;
// «Mis envíos» del dashboard (usuario, 2026-11-21): SOLO los programados (con o sin
// transportista asignado), los de fecha de carga más cercana primero. Los entregados, cancelados
// o ya en marcha no salen aquí; están en Envíos.
const VIVOS: Enum<'estado_envio'>[] = ['programado'];

// Dashboard del cliente: diseño de #sec-dashboard de dashboard.html. El cliente ve sus
// envíos (mis_envios); Dynamo ve el mismo panel con los de todos, para saber qué ve el cliente.
export default async function PaginaDashboard() {
  const s = await sesion();
  if (!s) return null;
  const { supabase, perfil } = s;
  if (sinAcceso(perfil)) return <AvisoCuenta perfil={perfil} />;
  const dynamo = esDynamo(perfil.rol);

  // Solo hacen falta 3 envíos y dos cuentas: la base de datos cuenta, la web no descarga la lista.
  // Lo que hace falta para pintar el estado y la fecha IGUAL que la lista de Envíos (usuario,
  // 2026-11-26: el dashboard decía «Programado» y la lista «Confirmado» del mismo envío).
  let filas: (FilaVivo & { cliente?: string | null; con_camion?: boolean; estado_pago_previo?: string | null })[] = [];
  let activos = 0;
  let total = 0;
  const vista = await vistaDe(supabase, perfil.rol);
  if (dynamo) {
    const [vivos, todos] = await Promise.all([
      filtrarVista(supabase.from('envios').select('id, referencia_gx, referencia_cliente, estado, estado_asignacion, es_manual, transportista_id, estado_pago_previo, fecha_carga_desde, fecha_carga_hasta, fecha_carga_real, ' +
        'codigo_postal_origen, poblacion_origen, codigo_postal_destino, poblacion_destino, metros_lineales, toneladas, descripcion_mercancia, clientes(nombre_visible)', { count: 'exact' }), vista)
        .in('estado', VIVOS).order('fecha_carga_desde', { ascending: true, nullsFirst: false }).limit(2)
        .overrideTypes<(FilaVivo & { transportista_id: string | null; estado_pago_previo: string | null; clientes: { nombre_visible: string | null } | null })[], { merge: false }>(),
      filtrarVista(supabase.from('envios').select('id', { count: 'exact', head: true }), vista).neq('estado', 'borrador'),
    ]);
    filas = (vivos.data ?? []).map((x) => ({ ...x, cliente: x.clientes?.nombre_visible ?? null, con_camion: !!x.transportista_id }));
    activos = vivos.count ?? filas.length;
    total = todos.count ?? 0;
  } else if (perfil.rol === 'cliente') {
    const [vivos, todos] = await Promise.all([
      supabase.rpc('mis_envios', {}, { count: 'exact' }).in('estado', VIVOS).order('fecha_carga_desde', { ascending: true, nullsFirst: false }).limit(2),
      supabase.rpc('mis_envios', {}, { count: 'exact', head: true }),
    ]);
    filas = (vivos.data ?? []).map((x) => ({ ...x, con_camion: !!x.asignado_en || x.estado_asignacion === 'confirmada' }));
    // Previo pago: el cliente no lee la tabla de envíos, lo trae pagos_envio() (como la lista).
    if (filas.length) {
      const { data: pagos } = await supabase.rpc('pagos_envio');
      const pp = new Map((pagos ?? []).map((x) => [x.envio_id, x.estado_pago_previo]));
      filas.forEach((f) => { f.estado_pago_previo = pp.get(f.id) ?? null; });
    }
    activos = vivos.count ?? filas.length;
    total = todos.count ?? 0;
  }
  // Seguimiento: «Asignando transportista» y la fecha de carga asignada, de la base de datos.
  const seg = new Map<string, { asignando: boolean | null; fecha_carga_prevista: string | null }>();
  if (filas.length) {
    const { data } = await supabase.rpc('seguimiento_envios', { p_ids: filas.slice(0, 2).map((f) => f.id) });
    (data ?? []).forEach((x) => seg.set(x.envio_id, x));
  }
  const mini: MiniEnvio[] = filas.slice(0, 2).map((x) => {
    const sg = seg.get(x.id);
    // La misma cuenta que la lista de Envíos: estadoVisual() y fechaCarga().
    const comoFila = {
      estado: x.estado, es_manual: x.es_manual, estado_asignacion: x.estado_asignacion, transportista_asignado: !!x.con_camion,
      estado_pago_previo: x.estado_pago_previo ?? null, asignando: sg?.asignando ?? null,
      fecha_carga_real: x.fecha_carga_real, fecha_carga_prevista: sg?.fecha_carga_prevista ?? null,
      fecha_carga_desde: x.fecha_carga_desde, fecha_carga_hasta: x.fecha_carga_hasta,
    } as unknown as EnvioFila;
    return {
    id: x.id, referencia_gx: x.referencia_gx, referencia_cliente: x.referencia_cliente, estado: x.estado,
    badge: estadoVisual(comoFila), fecha_txt: fechaCarga(comoFila),
    origen: [x.codigo_postal_origen, x.poblacion_origen].filter(Boolean).join(' '), destino: [x.codigo_postal_destino, x.poblacion_destino].filter(Boolean).join(' '),
    metros_lineales: x.metros_lineales, toneladas: x.toneladas, mercancia: x.descripcion_mercancia, cliente: x.cliente ?? null,
    };
  });
  return <DashboardCliente envios={mini} activos={activos} dynamo={dynamo} sinEnvios={!dynamo && total === 0} />;
}
