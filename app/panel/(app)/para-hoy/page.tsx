import { sesion, esDynamo } from '@/lib/sesion';
import { vistaDe } from '@/lib/vista';
import AvisoCuenta from '@/components/panel/AvisoCuenta';
import ParaHoy, { type Bloque } from '@/components/panel/ParaHoy';
import { euros, ventana } from '@/lib/formato';

export const dynamic = 'force-dynamic';

// «Para hoy» (solo Dynamo): todo lo que espera una respuesta del equipo, en una sola
// pantalla y por urgencia. Cada línea abre su ficha. Lo que ve cada uno lo decide la
// base de datos (permisos por fila); aquí solo se ordena y se resume.
const MAX = 8;
const hoyMadrid = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date());
const masDias = (iso: string, n: number) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

export default async function PaginaParaHoy() {
  const s = await sesion();
  if (!s) return null;
  const { supabase, perfil } = s;
  if (!perfil || perfil.estado !== 'activa') return <AvisoCuenta perfil={perfil} />;
  if (!esDynamo(perfil.rol)) {
    return <section className="section active"><div className="pt-aviso error" style={{ maxWidth: 640 }}><div>Esta sección es solo del equipo de Dynamo.</div></div></section>;
  }
  const vista = await vistaDe(supabase, perfil.rol);
  if (vista.tipo !== 'admin') {
    return <section className="section active"><div className="pt-aviso" style={{ maxWidth: 640 }}><div>«Para hoy» es de la gestión interna: vuelve a la vista de Dynamo (arriba, «Ver como»).</div></div></section>;
  }
  const hoy = hoyMadrid(), manana = masDias(hoy, 1);
  const ENV = 'id, referencia_gx, fecha_carga_desde, fecha_carga_hasta, importe_cliente, importe_contraoferta_cliente, creado_en, cambio_cliente_en, modificado_en, clientes(nombre_visible)';
  const cnt = { count: 'exact' as const };
  // OJO: las solicitudes «esperando precio» NO salen aquí (decisión del usuario 2026-11-08):
  // el precio lo pondrá el tarifador automático, no depende del equipo.
  const [sinCamion, cofCli, cofTra, cambios, revisar, sinPagar, inc, pen, altas, alm, revPrecio] = await Promise.all([
    supabase.from('envios').select(ENV, cnt).eq('estado', 'programado').eq('es_manual', false).is('transportista_id', null)
      .neq('estado_pago_previo', 'pendiente').lte('fecha_carga_desde', manana).order('fecha_carga_desde').limit(MAX),
    supabase.from('envios').select(ENV, cnt).eq('estado', 'borrador').eq('estado_solicitud', 'contraoferta').order('modificado_en').limit(MAX),
    supabase.from('envio_reservas').select('id, envio_id, precio_propuesto, cerrada_en, desde, envios(referencia_gx, importe_transportista), transportistas(nombre_visible, tags)', cnt)
      .eq('estado', 'pendiente_revision').order('desde').limit(MAX),
    supabase.from('envios').select(ENV, cnt).eq('estado_cambio_cliente', 'pendiente').order('cambio_cliente_en').limit(MAX),
    supabase.from('envios').select(ENV, cnt).eq('requiere_revision_precio', true).not('estado', 'in', '(entregado,cancelado)').order('fecha_carga_desde').limit(MAX),
    supabase.from('envios').select(ENV, cnt).eq('estado', 'programado').eq('estado_pago_previo', 'pendiente').order('fecha_carga_desde').limit(MAX),
    supabase.from('incidencias').select('id, titulo, prioridad, creado_en, envios(referencia_gx), tipos_incidencia(clave, nombre)', cnt)
      .in('estado', ['abierto', 'en_curso']).order('creado_en').limit(50),
    supabase.from('penalizaciones').select('id, importe_cliente, importe_transportista, creado_en, envios(referencia_gx), tipos_penalizacion(nombre)', cnt)
      .eq('estado', 'pendiente_confirmar').order('creado_en').limit(MAX),
    supabase.from('usuarios').select('id, email, nombre, rol, creado_en', cnt).eq('estado', 'pendiente_verificacion').is('cliente_id', null).is('transportista_id', null).order('creado_en').limit(MAX),
    supabase.from('almacenamientos').select('id, codigo, fecha_entrada, creado_en, clientes(nombre_visible)', cnt).eq('estado', 'pendiente_confirmar').order('fecha_entrada').limit(MAX),
    // Revisión del precio de los envíos programados con mucha antelación.
    supabase.from('envios').select(ENV, cnt).eq('estado', 'programado').eq('estado_revision_precio', 'revisar').order('fecha_carga_desde').limit(MAX),
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
    // Lo primero y destacado: hasta que el cliente no paga, el envío no avanza (no se asigna
    // camión), así que es lo más importante de vigilar.
    { id: 'sin-pagar', nivel: 'aviso', titulo: 'Envíos esperando el pago del cliente', total: sinPagar.count ?? 0, todo: '/panel/envios?f=sin-pagar',
      filas: (sinPagar.data ?? []).map((e) => ({ href: ficha(e.id), t: `#${e.referencia_gx} · ${cli(e)}`, s: `Carga ${fechas(e)} · si paga por transferencia, márcalo al recibirla`, desde: e.modificado_en ?? e.creado_en })) },
    { id: 'sin-camion', nivel: 'urgente', titulo: 'Cargan hoy o mañana y no tienen camión', total: sinCamion.count ?? 0, todo: '/panel/envios',
      filas: (sinCamion.data ?? []).map((e) => ({ href: ficha(e.id), t: `#${e.referencia_gx} · ${cli(e)}`, s: `Carga ${fechas(e)}`, desde: null,
        urgente: (e.fecha_carga_desde ?? '') <= hoy })) },
    { id: 'incidencias', nivel: incs.some((i) => i.tipos_incidencia?.clave === 'siniestro' || i.prioridad === 'critica') ? 'urgente' : 'aviso',
      titulo: 'Incidencias abiertas', total: inc.count ?? 0, todo: '/panel/incidencias',
      filas: incs.map((i) => ({ href: '/panel/incidencias', t: `${i.tipos_incidencia?.clave === 'siniestro' ? 'SINIESTRO · ' : ''}${i.titulo}`,
        s: [i.envios?.referencia_gx && `#${i.envios.referencia_gx}`, i.tipos_incidencia?.nombre, `prioridad ${i.prioridad}`].filter(Boolean).join(' · '), desde: i.creado_en,
        urgente: i.tipos_incidencia?.clave === 'siniestro' || i.prioridad === 'critica' })) },
    { id: 'contraofertas-clientes', nivel: 'aviso', titulo: 'Contraofertas de clientes', total: cofCli.count ?? 0, todo: '/panel/envios',
      filas: (cofCli.data ?? []).map((e) => ({ href: ficha(e.id), t: `#${e.referencia_gx} · ${cli(e)}`,
        s: `Propone ${euros(e.importe_contraoferta_cliente)} (le dimos ${euros(e.importe_cliente)})`, desde: e.modificado_en })) },
    { id: 'contraofertas-transportistas', nivel: 'aviso', titulo: 'Contraofertas de transportistas', total: cofTra.count ?? 0, todo: '/panel/envios',
      filas: (cofTra.data ?? []).map((r) => ({ href: ficha(r.envio_id), t: `#${r.envios?.referencia_gx ?? ''} · ${r.transportistas?.nombre_visible ?? 'Transportista'}`,
        s: `Propone ${euros(r.precio_propuesto)} (ofertado ${euros(r.envios?.importe_transportista)})${(r.transportistas?.tags ?? []).includes('alta_online') ? ' · ALTA ONLINE: revisar la empresa' : ''}`, desde: r.desde })) },
    { id: 'cambios', nivel: 'aviso', titulo: 'Cambios pedidos por clientes', total: cambios.count ?? 0, todo: '/panel/envios',
      filas: (cambios.data ?? []).map((e) => ({ href: ficha(e.id), t: `#${e.referencia_gx} · ${cli(e)}`, s: `Carga ${fechas(e)}`, desde: e.cambio_cliente_en })) },
    { id: 'revisar-precio', nivel: 'aviso', titulo: 'Precio por revisar (ruta cambiada)', total: revisar.count ?? 0, todo: '/panel/envios',
      filas: (revisar.data ?? []).map((e) => ({ href: ficha(e.id), t: `#${e.referencia_gx} · ${cli(e)}`, s: `Carga ${fechas(e)}`, desde: e.modificado_en })) },
    { id: 'revision-precio', nivel: 'aviso', titulo: 'Revisar el precio (programados con antelación)', total: revPrecio.count ?? 0, todo: '/panel/envios',
      filas: (revPrecio.data ?? []).map((e) => ({ href: ficha(e.id), t: `#${e.referencia_gx} · ${cli(e)}`,
        s: `Carga ${fechas(e)} · precio provisional ${euros(e.importe_cliente)}: pon el de hoy`, desde: null })) },
    { id: 'altas', nivel: 'aviso', titulo: 'Altas pendientes', total: altas.count ?? 0, todo: '/panel/altas',
      filas: (altas.data ?? []).map((u) => ({ href: '/panel/altas', t: u.nombre || u.email, s: u.email, desde: u.creado_en })) },
    { id: 'penalizaciones', nivel: 'info', titulo: 'Penalizaciones por confirmar', total: pen.count ?? 0, todo: '/panel/penalizaciones',
      filas: (pen.data ?? []).map((p) => ({ href: '/panel/penalizaciones', t: `${p.tipos_penalizacion?.nombre ?? 'Penalización'}${p.envios?.referencia_gx ? ` · #${p.envios.referencia_gx}` : ''}`,
        s: [p.importe_cliente != null && `Cliente ${euros(p.importe_cliente)}`, p.importe_transportista != null && `Transportista ${euros(p.importe_transportista)}`].filter(Boolean).join(' · '), desde: p.creado_en })) },
    { id: 'almacenamientos', nivel: 'info', titulo: 'Almacenamientos por confirmar', total: alm.count ?? 0, todo: '/panel/almacenamientos',
      filas: (alm.data ?? []).map((a) => ({ href: '/panel/almacenamientos', t: `${a.codigo ?? 'Almacenamiento'} · ${cli(a)}`, s: `Entrada ${ventana(a.fecha_entrada, null)}`, desde: a.creado_en })) },
  ];
  const errores = [sinCamion, cofCli, cofTra, cambios, revisar, sinPagar, inc, pen, altas, alm, revPrecio].map((r) => r.error?.message).filter(Boolean);
  return <ParaHoy bloques={bloques} error={errores[0] ?? null} />;
}
