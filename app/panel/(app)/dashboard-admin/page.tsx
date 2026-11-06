import { sesion, esDynamo } from '@/lib/sesion';
import AvisoCuenta from '@/components/panel/AvisoCuenta';
import DashboardAdmin, { type ProntoPago } from '@/components/panel/DashboardAdmin';
import type { MiniEnvio } from '@/components/panel/DashboardCliente';
import type { Tabla } from '@/lib/supabase/tipos';
import CuadroMando, { type Cuadro, type Periodo, type Sector } from '@/components/panel/CuadroMando';

export const dynamic = 'force-dynamic';
type FilaUltimo = Pick<Tabla<'envios'>, 'id' | 'referencia_gx' | 'referencia_cliente' | 'estado' | 'fecha_carga_desde' | 'fecha_carga_hasta' | 'fecha_carga_real'
  | 'codigo_postal_origen' | 'poblacion_origen' | 'codigo_postal_destino' | 'poblacion_destino' | 'metros_lineales' | 'toneladas' | 'descripcion_mercancia'
  | 'importe_cliente'> & { clientes: { nombre_visible: string | null } | null };

// Dashboard admin (solo Dynamo): diseño de #sec-dashboard-admin de dashboard.html.
// Periodo del cuadro de mando (?cm=mes|mes-ant|anio|anio-ant|12m|todo|otro&desde&hasta) y el
// periodo anterior equivalente para comparar.
function periodoDe(sp: Record<string, string | undefined>, primerDia: string | null): { p: Periodo; desde: string; hasta: string; cDesde: string | null; cHasta: string | null } {
  const hoy = new Date(new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date()) + 'T12:00:00Z');
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const a = hoy.getUTCFullYear(), m = hoy.getUTCMonth();
  const ult = (y: number, mm: number) => new Date(Date.UTC(y, mm + 1, 0, 12));
  const ok = (x?: string) => (/^\d{4}-\d{2}-\d{2}$/.test(x ?? '') ? x! : '');
  const p = (['mes', 'mes-ant', 'anio', 'anio-ant', '12m', 'todo', 'otro'] as Periodo[]).includes(sp.cm as Periodo) ? (sp.cm as Periodo) : 'mes';
  switch (p) {
    case 'mes-ant': return { p, desde: iso(new Date(Date.UTC(a, m - 1, 1, 12))), hasta: iso(ult(a, m - 1)), cDesde: iso(new Date(Date.UTC(a, m - 2, 1, 12))), cHasta: iso(ult(a, m - 2)) };
    case 'anio': return { p, desde: `${a}-01-01`, hasta: iso(hoy), cDesde: `${a - 1}-01-01`, cHasta: iso(new Date(Date.UTC(a - 1, m, hoy.getUTCDate(), 12))) };
    case 'anio-ant': return { p, desde: `${a - 1}-01-01`, hasta: `${a - 1}-12-31`, cDesde: `${a - 2}-01-01`, cHasta: `${a - 2}-12-31` };
    case '12m': return { p, desde: iso(new Date(Date.UTC(a, m - 11, 1, 12))), hasta: iso(hoy), cDesde: iso(new Date(Date.UTC(a, m - 23, 1, 12))), cHasta: iso(ult(a, m - 12)) };
    case 'todo': return { p, desde: primerDia ?? `${a}-01-01`, hasta: iso(ult(a, 11)), cDesde: null, cHasta: null };
    case 'otro': {
      const d = ok(sp.desde) || iso(new Date(Date.UTC(a, m, 1, 12))), h = ok(sp.hasta) || iso(hoy);
      const dias = Math.round((Date.parse(h) - Date.parse(d)) / 86400000) + 1;
      const cH = new Date(Date.parse(d) - 86400000), cD = new Date(cH.getTime() - (dias - 1) * 86400000);
      return { p, desde: d, hasta: h, cDesde: dias > 0 ? iso(cD) : null, cHasta: dias > 0 ? iso(cH) : null };
    }
    default: return { p: 'mes', desde: iso(new Date(Date.UTC(a, m, 1, 12))), hasta: iso(ult(a, m)), cDesde: iso(new Date(Date.UTC(a, m - 1, 1, 12))), cHasta: iso(ult(a, m - 1)) };
  }
}

export default async function PaginaDashboardAdmin({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const s = await sesion();
  if (!s) return null;
  const { supabase, perfil } = s;
  if (!perfil || perfil.estado !== 'activa') return <AvisoCuenta perfil={perfil} />;
  if (!esDynamo(perfil.rol)) {
    return <section className="section active"><div className="pt-aviso error" style={{ maxWidth: 640 }}><div>Esta sección es solo del equipo de Dynamo.</div></div></section>;
  }
  const cuenta = (q: PromiseLike<{ count: number | null }>) => q.then((r) => r.count ?? 0);
  // «Todo»: desde el primer envío con fecha (máximo 10 años atrás, que es lo que admite cuadro_mando).
  let primerDia: string | null = null;
  if (sp.cm === 'todo') {
    const { data: pe } = await supabase.from('envios').select('fecha_carga_desde').not('fecha_carga_desde', 'is', null).order('fecha_carga_desde').limit(1).maybeSingle();
    const tope = new Date(); tope.setUTCFullYear(tope.getUTCFullYear() - 9); tope.setUTCMonth(0, 1);
    primerDia = pe?.fecha_carga_desde && pe.fecha_carga_desde > tope.toISOString().slice(0, 10) ? pe.fecha_carga_desde : tope.toISOString().slice(0, 10);
  }
  const per = periodoDe(sp, primerDia);
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
  const [cm, sec] = await Promise.all([
    supabase.rpc('cuadro_mando', { p_desde: per.desde, p_hasta: per.hasta, p_comp_desde: per.cDesde, p_comp_hasta: per.cHasta }),
    supabase.rpc('cuadro_mando_sectores', { p_desde: per.desde, p_hasta: per.hasta }),
  ]);
  const mini: (MiniEnvio & { importe: number | null })[] = (ultimos.data ?? []).map((x) => ({
    id: x.id, referencia_gx: x.referencia_gx, referencia_cliente: x.referencia_cliente, estado: x.estado,
    fecha_carga_desde: x.fecha_carga_real ?? x.fecha_carga_desde, fecha_carga_hasta: x.fecha_carga_real ? null : x.fecha_carga_hasta,
    origen: [x.codigo_postal_origen, x.poblacion_origen].filter(Boolean).join(' '), destino: [x.codigo_postal_destino, x.poblacion_destino].filter(Boolean).join(' '),
    metros_lineales: x.metros_lineales, toneladas: x.toneladas, mercancia: x.descripcion_mercancia, cliente: x.clientes?.nombre_visible ?? null,
    importe: x.importe_cliente != null ? Number(x.importe_cliente) : null,
  }));
  return <DashboardAdmin cifras={{ enCurso, sinTransp, inc, pen, alm, contra, solicitudes }} ultimos={mini}
    prontoPago={(pp.data as ProntoPago) ?? null} errorPP={pp.error?.message ?? null}
    cuadro={<CuadroMando datos={(cm.data as unknown as Cuadro | null) ?? null} periodo={per.p} error={cm.error?.message ?? null} sectores={(sec.data ?? []) as Sector[]} />} />;
}
