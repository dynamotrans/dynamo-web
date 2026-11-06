import { sesion, esDynamo } from '@/lib/sesion';
import AvisoCuenta from '@/components/panel/AvisoCuenta';
import DashboardAdmin, { type ProntoPago } from '@/components/panel/DashboardAdmin';
import CuadroMando, { type Cuadro, type Periodo, type Sector } from '@/components/panel/CuadroMando';

export const dynamic = 'force-dynamic';
// Dashboard admin (solo Dynamo): diseño de #sec-dashboard-admin de dashboard.html.
// Periodo del cuadro de mando (?cm=mes|mes-ant|anio|anio-ant|12m|todo|otro&desde&hasta) y el
// periodo anterior equivalente para comparar.
function periodoDe(sp: Record<string, string | undefined>, primerDia: string | null): { p: Periodo; desde: string; hasta: string; cDesde: string | null; cHasta: string | null } {
  const hoy = new Date(new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date()) + 'T12:00:00Z');
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const a = hoy.getUTCFullYear(), m = hoy.getUTCMonth();
  const ult = (y: number, mm: number) => new Date(Date.UTC(y, mm + 1, 0, 12));
  const ok = (x?: string) => (/^\d{4}-\d{2}-\d{2}$/.test(x ?? '') ? x! : '');
  // Sin elegir nada: últimos 5 años (usuario, 2026-11-06).
  const p = (['5a', '12m', 'mes', 'mes-ant', 'anio', 'anio-ant', 'todo', 'otro'] as Periodo[]).includes(sp.cm as Periodo) ? (sp.cm as Periodo) : '5a';
  switch (p) {
    case 'mes-ant': return { p, desde: iso(new Date(Date.UTC(a, m - 1, 1, 12))), hasta: iso(ult(a, m - 1)), cDesde: iso(new Date(Date.UTC(a, m - 2, 1, 12))), cHasta: iso(ult(a, m - 2)) };
    case 'anio': return { p, desde: `${a}-01-01`, hasta: iso(hoy), cDesde: `${a - 1}-01-01`, cHasta: iso(new Date(Date.UTC(a - 1, m, hoy.getUTCDate(), 12))) };
    case 'anio-ant': return { p, desde: `${a - 1}-01-01`, hasta: `${a - 1}-12-31`, cDesde: `${a - 2}-01-01`, cHasta: `${a - 2}-12-31` };
    // 60 meses hasta hoy (mes actual incluido), comparados con los 60 anteriores.
    case '5a': return { p, desde: iso(new Date(Date.UTC(a, m - 59, 1, 12))), hasta: iso(hoy), cDesde: iso(new Date(Date.UTC(a, m - 119, 1, 12))), cHasta: iso(ult(a, m - 60)) };
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
  const [enCurso, sinTransp, inc, pen, alm, contra, pp] = await Promise.all([
    cuenta(supabase.from('envios').select('id', { count: 'exact', head: true }).in('estado', ['programado', 'hacia_la_carga', 'cargando', 'en_ruta'])),
    cuenta(supabase.from('envios').select('id', { count: 'exact', head: true }).eq('estado', 'programado').eq('es_manual', false).is('transportista_id', null)),
    cuenta(supabase.from('incidencias').select('id', { count: 'exact', head: true }).in('estado', ['abierto', 'en_curso'])),
    cuenta(supabase.from('penalizaciones').select('id', { count: 'exact', head: true }).eq('estado', 'pendiente_confirmar')),
    cuenta(supabase.from('almacenamientos').select('id', { count: 'exact', head: true }).eq('estado', 'pendiente_confirmar')),
    cuenta(supabase.from('envio_reservas').select('id', { count: 'exact', head: true }).eq('estado', 'pendiente_revision')),
    supabase.rpc('pronto_pago_estado'),
  ]);
  const [cm, sec] = await Promise.all([
    supabase.rpc('cuadro_mando', { p_desde: per.desde, p_hasta: per.hasta, p_comp_desde: per.cDesde, p_comp_hasta: per.cHasta }),
    supabase.rpc('cuadro_mando_sectores', { p_desde: per.desde, p_hasta: per.hasta }),
  ]);
  return <DashboardAdmin cifras={{ enCurso, sinTransp, inc, pen, alm, contra }}
    prontoPago={(pp.data as ProntoPago) ?? null} errorPP={pp.error?.message ?? null}
    cuadro={<CuadroMando datos={(cm.data as unknown as Cuadro | null) ?? null} periodo={per.p} error={cm.error?.message ?? null} sectores={(sec.data ?? []) as Sector[]} />} />;
}
