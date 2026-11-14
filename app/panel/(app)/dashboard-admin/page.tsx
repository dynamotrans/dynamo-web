import { sesion, esDynamo } from '@/lib/sesion';
import AvisoCuenta from '@/components/panel/AvisoCuenta';
import DashboardAdmin, { type Bloque, type ProntoPago } from '@/components/panel/DashboardAdmin';
import CuadroMando, { type Cuadro, type Periodo, type Sector } from '@/components/panel/CuadroMando';
import { euros, ventana } from '@/lib/formato';

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
  // Lo pendiente (antes la sección «Para hoy», usuario 2026-11-09): cada bloque es ahora
  // una caja con contador y su ventana con las primeras líneas. Lo que ve cada uno lo
  // decide la base de datos (permisos por fila); aquí solo se ordena y se resume.
  const MAX = 8;
  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date());
  const manana = (() => { const d = new Date(`${hoy}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); })();
  // «Todo»: desde el primer envío con fecha (máximo 10 años atrás, que es lo que admite cuadro_mando).
  let primerDia: string | null = null;
  if (sp.cm === 'todo') {
    const { data: pe } = await supabase.from('envios').select('fecha_carga_desde').not('fecha_carga_desde', 'is', null).order('fecha_carga_desde').limit(1).maybeSingle();
    const tope = new Date(); tope.setUTCFullYear(tope.getUTCFullYear() - 9); tope.setUTCMonth(0, 1);
    primerDia = pe?.fecha_carga_desde && pe.fecha_carga_desde > tope.toISOString().slice(0, 10) ? pe.fecha_carga_desde : tope.toISOString().slice(0, 10);
  }
  const per = periodoDe(sp, primerDia);
  const ENV = 'id, referencia_gx, fecha_carga_desde, fecha_carga_hasta, creado_en, modificado_en, clientes(nombre_visible)';
  const cnt = { count: 'exact' as const };
  // OJO: las solicitudes «esperando precio» y las revisiones de precio NO salen (decisión
  // del usuario 2026-11-08): el precio es del tarifador automático, no depende del equipo.
  const [enCurso, pp, sinCamion, cofTra, sinPagar, inc, pen, altas, alm, susp24, suspTotal] = await Promise.all([
    cuenta(supabase.from('envios').select('id', { count: 'exact', head: true }).in('estado', ['programado', 'hacia_la_carga', 'cargando', 'en_ruta'])),
    supabase.rpc('pronto_pago_estado'),
    supabase.from('envios').select(ENV, cnt).eq('estado', 'programado').eq('es_manual', false).is('transportista_id', null)
      .neq('estado_pago_previo', 'pendiente').lte('fecha_carga_desde', manana).order('fecha_carga_desde').limit(MAX),
    supabase.from('envio_reservas').select('id, envio_id, precio_propuesto, desde, envios(referencia_gx, importe_transportista), transportistas(nombre_visible, tags)', cnt)
      .eq('estado', 'pendiente_revision').order('desde').limit(MAX),
    supabase.from('envios').select(ENV, cnt).eq('estado', 'programado').eq('estado_pago_previo', 'pendiente').order('fecha_carga_desde').limit(MAX),
    supabase.from('incidencias').select('id, titulo, prioridad, creado_en, envios(referencia_gx), tipos_incidencia(clave, nombre)', cnt)
      .in('estado', ['abierto', 'en_curso']).order('creado_en').limit(50),
    supabase.from('penalizaciones').select('id, importe_cliente, importe_transportista, creado_en, envios(referencia_gx), tipos_penalizacion(nombre)', cnt)
      .eq('estado', 'pendiente_confirmar').order('creado_en').limit(MAX),
    supabase.from('usuarios').select('id, email, nombre, rol, creado_en', cnt).eq('estado', 'pendiente_verificacion').is('cliente_id', null).is('transportista_id', null).order('creado_en').limit(MAX),
    supabase.from('almacenamientos').select('id, codigo, fecha_entrada, creado_en, clientes(nombre_visible)', cnt).eq('estado', 'pendiente_confirmar').order('fecha_entrada').limit(MAX),,
    // Cuentas suspendidas por el sistema o a mano (usuario, 2026-11-14): las últimas
    // 24 h y el total histórico, con enlace a Usuarios filtrado por suspendidas.
    cuenta(supabase.from('usuarios').select('id', { count: 'exact', head: true }).eq('estado', 'suspendida')
      .gte('suspendida_en', new Date(Date.now() - 24 * 3600 * 1000).toISOString())),
    cuenta(supabase.from('usuarios').select('id', { count: 'exact', head: true }).eq('estado', 'suspendida'))
  ]);
  const cli = (e: { clientes?: { nombre_visible: string | null } | null }) => e?.clientes?.nombre_visible ?? 'Cliente';
  const ficha = (id: string) => `/panel/envios?ver=${id}`;
  const fechas = (e: { fecha_carga_desde: string | null; fecha_carga_hasta: string | null }) => ventana(e.fecha_carga_desde, e.fecha_carga_hasta);
  // Incidencias: primero siniestros y críticas.
  const PRIO: Record<string, number> = { critica: 0, alta: 1, media: 2, baja: 3 };
  const incs = (inc.data ?? []).sort((a, b) =>
    (a.tipos_incidencia?.clave === 'siniestro' ? -1 : 0) - (b.tipos_incidencia?.clave === 'siniestro' ? -1 : 0)
    || (PRIO[a.prioridad] ?? 9) - (PRIO[b.prioridad] ?? 9) || a.creado_en.localeCompare(b.creado_en)).slice(0, MAX);

  const bloques: Bloque[] = [
    // Las ALTAS, lo primero (decisión del usuario 2026-11-08): un cliente nuevo esperando
    // la revisión es lo que antes hay que atender.
    { id: 'altas', nivel: 'aviso', corto: 'Altas pendientes', titulo: 'Altas pendientes', total: altas.count ?? 0, todo: '/panel/altas',
      sub: 'Usuarios nuevos esperando la revisión del equipo.',
      filas: (altas.data ?? []).map((u) => ({ href: '/panel/altas', t: u.nombre || u.email, s: u.email, desde: u.creado_en })) },
    // Hasta que el cliente no paga, el envío no avanza (no se asigna camión).
    { id: 'sin-pagar', nivel: 'aviso', corto: 'Esperando el pago', titulo: 'Envíos esperando el pago del cliente', total: sinPagar.count ?? 0, todo: '/panel/envios?f=sin-pagar',
      sub: 'Hasta que el cliente no paga, el envío no avanza (no se asigna camión). Si paga por transferencia, márcalo al recibirla.',
      filas: (sinPagar.data ?? []).map((e) => ({ href: ficha(e.id), t: `#${e.referencia_gx} · ${cli(e)}`, s: `Carga ${fechas(e)}`, desde: e.modificado_en ?? e.creado_en })) },
    { id: 'sin-camion', nivel: 'urgente', corto: 'Hoy/mañana sin camión', titulo: 'Cargan hoy o mañana y no tienen camión', total: sinCamion.count ?? 0, todo: '/panel/envios?f=sin-asignar',
      sub: 'Envíos que cargan hoy o mañana y aún no tienen transportista asignado.',
      filas: (sinCamion.data ?? []).map((e) => ({ href: ficha(e.id), t: `#${e.referencia_gx} · ${cli(e)}`, s: `Carga ${fechas(e)}`, desde: null,
        urgente: (e.fecha_carga_desde ?? '') <= hoy })) },
    { id: 'incidencias', nivel: incs.some((i) => i.tipos_incidencia?.clave === 'siniestro' || i.prioridad === 'critica') ? 'urgente' : 'aviso',
      corto: 'Incidencias abiertas', titulo: 'Incidencias abiertas', total: inc.count ?? 0, todo: '/panel/incidencias',
      sub: 'Abiertas o en curso; primero los siniestros y las críticas.',
      filas: incs.map((i) => ({ href: '/panel/incidencias', t: `${i.tipos_incidencia?.clave === 'siniestro' ? 'SINIESTRO · ' : ''}${i.titulo}`,
        s: [i.envios?.referencia_gx && `#${i.envios.referencia_gx}`, i.tipos_incidencia?.nombre, `prioridad ${i.prioridad}`].filter(Boolean).join(' · '), desde: i.creado_en,
        urgente: i.tipos_incidencia?.clave === 'siniestro' || i.prioridad === 'critica' })) },
    { id: 'contraofertas-transportistas', nivel: 'aviso', corto: 'Contraofertas', titulo: 'Contraofertas de transportistas', total: cofTra.count ?? 0, todo: '/panel/envios',
      sub: 'Transportistas que proponen otro precio: se aceptan o rechazan en la ficha del envío.',
      filas: (cofTra.data ?? []).map((r) => ({ href: ficha(r.envio_id), t: `#${r.envios?.referencia_gx ?? ''} · ${r.transportistas?.nombre_visible ?? 'Transportista'}`,
        s: `Propone ${euros(r.precio_propuesto)} (ofertado ${euros(r.envios?.importe_transportista)})${(r.transportistas?.tags ?? []).includes('alta_online') ? ' · ALTA ONLINE: revisar la empresa' : ''}`, desde: r.desde })) },
    { id: 'penalizaciones', nivel: 'info', corto: 'Penalizaciones', titulo: 'Penalizaciones por confirmar', total: pen.count ?? 0, todo: '/panel/penalizaciones',
      sub: 'Penalizaciones registradas pendientes de confirmar.',
      filas: (pen.data ?? []).map((p) => ({ href: '/panel/penalizaciones', t: `${p.tipos_penalizacion?.nombre ?? 'Penalización'}${p.envios?.referencia_gx ? ` · #${p.envios.referencia_gx}` : ''}`,
        s: [p.importe_cliente != null && `Cliente ${euros(p.importe_cliente)}`, p.importe_transportista != null && `Transportista ${euros(p.importe_transportista)}`].filter(Boolean).join(' · '), desde: p.creado_en })) },
    { id: 'almacenamientos', nivel: 'info', corto: 'Almacenamientos', titulo: 'Almacenamientos por confirmar', total: alm.count ?? 0, todo: '/panel/almacenamientos',
      sub: 'Almacenamientos pedidos pendientes de confirmar.',
      filas: (alm.data ?? []).map((a) => ({ href: '/panel/almacenamientos', t: `${a.codigo ?? 'Almacenamiento'} · ${cli(a)}`, s: `Entrada ${ventana(a.fecha_entrada, null)}`, desde: a.creado_en })) },
  ];
  const errores = [sinCamion, cofTra, sinPagar, inc, pen, altas, alm].map((r) => r.error?.message).filter(Boolean);
  const [cm, sec] = await Promise.all([
    supabase.rpc('cuadro_mando', { p_desde: per.desde, p_hasta: per.hasta, p_comp_desde: per.cDesde, p_comp_hasta: per.cHasta }),
    supabase.rpc('cuadro_mando_sectores', { p_desde: per.desde, p_hasta: per.hasta }),
  ]);
  return <DashboardAdmin enCurso={enCurso} susp24={susp24} suspTotal={suspTotal} bloques={bloques} errorBloques={errores[0] ?? null}
    prontoPago={(pp.data as ProntoPago) ?? null} errorPP={pp.error?.message ?? null}
    cuadro={<CuadroMando datos={(cm.data as unknown as Cuadro | null) ?? null} periodo={per.p} error={cm.error?.message ?? null} sectores={(sec.data ?? []) as Sector[]} />} />;
}
