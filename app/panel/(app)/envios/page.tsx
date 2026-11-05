import { redirect } from 'next/navigation';
import { leerTodo } from '@/lib/leerTodo';
import { sesion, esDynamo } from '@/lib/sesion';
import { stripeListo } from '@/lib/stripe';
import { vistaDe, filtrarVista } from '@/lib/vista';
import type { EnvioFila, Parada } from '@/lib/envios';
import TablaEnvios from '@/components/panel/TablaEnvios';
import AvisoCuenta from '@/components/panel/AvisoCuenta';
import FichaEnvio from '@/components/panel/FichaEnvio';
import { cargarFicha, cargarTransportistasParaAsignar } from '@/lib/fichaEnvio';
import FichaEnvioCliente from '@/components/panel/FichaEnvioCliente';
import FichaViaje from '@/components/panel/FichaViaje';
import OfertasAbiertas, { type Oferta } from '@/components/panel/OfertasAbiertas';

export const dynamic = 'force-dynamic';
export default async function PaginaEnvios({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const s = await sesion();
  if (!s) return null;
  const { supabase, perfil } = s;
  if (!perfil || perfil.estado !== 'activa') return <AvisoCuenta perfil={perfil} />;

  const rol = perfil.rol;
  const dynamo = esDynamo(rol);
  const sp = await searchParams;
  const q = (sp.q ?? '').trim().slice(0, 200);
  const vista = await vistaDe(supabase, rol);
  // Buscador (todos los años): texto y/o fechas de carga, por páginas de 100.
  const fechaOk = (x?: string) => (/^\d{4}-\d{2}-\d{2}$/.test(x ?? '') ? x! : '');
  const desde = fechaOk(sp.desde), hasta = fechaOk(sp.hasta);
  const pb = Math.max(1, Math.floor(Number(sp.pb) || 1));
  const busca = !!(q || desde || hasta);
  let busqueda: { total: number; pagina: number; porPagina: number } | null = null;
  let idsBusqueda: string[] | null = null;
  let errorBusqueda: string | null = null;
  if (busca) {
    const POR = 100;
    const v: any = vista;
    const { data: res, error: eb } = await supabase.rpc('buscar_envios_pagina', {
      p_q: q || null, p_desde: desde || null, p_hasta: hasta || null, p_pagina: pb, p_por_pagina: POR,
      p_cliente: v.tipo === 'cliente' ? v.id : null, p_transportista: v.tipo === 'transportista' ? v.id : null,
    });
    if (eb) errorBusqueda = eb.message;
    const r = (res ?? []) as { id: string; total: number }[];
    idsBusqueda = r.map((x) => x.id);
    busqueda = { total: Number(r[0]?.total ?? 0), pagina: pb, porPagina: POR };
    // Un número GX exacto que solo da un envío: se abre directamente.
    if (/^#?\s*gx\s*\d{6,}$/i.test(q) && busqueda.total === 1 && !sp.ver) redirect(`/panel/envios?ver=${r[0].id}`);
  }

  // ---- Datos, según el rol (Dynamo lee la tabla; cliente y transportista, sus funciones)
  let filas: EnvioFila[] = [];
  const nombresCliente = new Map<string, string>();
  let error: string | null = null;
  let nota: string | null = null;
  if (errorBusqueda) error = errorBusqueda;
  if (dynamo) {
    const COLS = 'id, referencia_gx, referencia_cliente, estado, estado_asignacion, es_manual, transportista_id, ' +
      'fecha_carga_desde, fecha_carga_hasta, fecha_carga_real, fecha_entrega_estimada, descripcion_mercancia, ' +
      'toneladas, metros_lineales, tipo_carga, paletizado, poblacion_origen, codigo_postal_origen, poblacion_destino, codigo_postal_destino, ' +
      'importe_cliente, importe_transportista, precio_acordado_operador, precio_fijado_a_mano, matricula_camion, ' +
      'matricula_remolque, creado_en, modificado_en, creado_por, solicitud_estado, pago_previo, cambio_cliente_estado, precio_revisar, clientes(nombre_visible, cif), operadores(razon_social), ' +
      'envio_paradas(orden, tipo, nombre_empresa, direccion, codigo_postal, poblacion, provincia, pais_codigo_iso)';
    const TERMINADOS = 1000;
    let data: any[] = [];
    if (busca) {
      // Con búsqueda o fechas: la página de resultados que ha dado la base de datos.
      if (idsBusqueda!.length) {
        const r = await filtrarVista(supabase.from('envios').select(COLS), vista).in('id', idsBusqueda!);
        if (r.error) error = r.error.message;
        data = r.data ?? [];
      }
    } else {
      // Sin búsqueda: TODOS los vivos y los últimos terminados (entregados y cancelados).
      const [vivos, fin] = await Promise.all([
        leerTodo(filtrarVista(supabase.from('envios').select(COLS), vista).not('estado', 'in', '(entregado,cancelado)').order('creado_en', { ascending: false }), 5000),
        filtrarVista(supabase.from('envios').select(COLS), vista).in('estado', ['entregado', 'cancelado']).order('creado_en', { ascending: false }).limit(TERMINADOS),
      ]);
      error = vivos.error?.message ?? fin.error?.message ?? null;
      data = [...(vivos.data ?? []), ...(fin.data ?? [])];
      if ((fin.data ?? []).length >= TERMINADOS) nota = `Se ven los ${TERMINADOS.toLocaleString('es-ES')} últimos envíos entregados o cancelados. Para los anteriores, usa el buscador o las fechas (busca en todos los años).`;
    }
    filas = (data as any[]).map((x) => ({
      ...x, cliente: x.clientes?.nombre_visible ?? null, cliente_cif: x.clientes?.cif ?? null,
      operador: x.operadores?.razon_social ?? null, transportista_asignado: !!x.transportista_id,
      paradas: (x.envio_paradas ?? []) as Parada[],
    }));
  } else {
    const { data, error: e } = busca
      ? (idsBusqueda!.length ? await supabase.rpc(rol === 'transportista' ? 'mis_viajes_por_ids' : 'mis_envios_por_ids', { p_ids: idsBusqueda }) : { data: [], error: null })
      : await leerTodo(supabase.rpc(rol === 'transportista' ? 'mis_viajes' : 'mis_envios'), 5000);
    if (e) error = e.message;
    filas = ((data ?? []) as any[]).map((x) => ({
      ...x, cliente: null, cliente_cif: null, operador: null, creado_por: x.creado_por ?? null,
      transportista_asignado: !!x.asignado_en || x.estado_asignacion === 'confirmada',
      paradas: (x.paradas ?? []) as Parada[],
    }));
    // Quién creó cada envío (columna «Creado por» también para el cliente).
    if (rol === 'cliente') {
      const { data: au } = await supabase.rpc('autores_mis_envios');
      ((au ?? []) as { envio_id: string; creado_por: string | null; creado_email: string | null }[]).forEach((x) => {
        const f = filas.find((y) => y.id === x.envio_id);
        if (f && x.creado_por) { f.creado_por = `autor:${x.envio_id}`; nombresCliente.set(`autor:${x.envio_id}`, x.creado_email && x.creado_email !== x.creado_por ? `${x.creado_por} · ${x.creado_email}` : x.creado_por); }
      });
    }
    // Previo pago (el cliente no lee la tabla de envíos: lo trae pagos_envio()).
    if (rol === 'cliente') {
      const { data: pagos } = await supabase.rpc('pagos_envio');
      const pp = new Map(((pagos ?? []) as { envio_id: string; pago_previo: string }[]).map((x) => [x.envio_id, x.pago_previo]));
      filas.forEach((f) => { f.pago_previo = pp.get(f.id) ?? null; });
    }
    // Nombre del operador de los envíos manuales del cliente (su propio catálogo).
    const ids = [...new Set(filas.map((f: any) => f.operador_id).filter(Boolean))];
    if (ids.length) {
      const { data: ops } = await supabase.from('operadores').select('id, razon_social').in('id', ids);
      const mapa = new Map((ops ?? []).map((o) => [o.id, o.razon_social]));
      filas.forEach((f: any) => { f.operador = mapa.get(f.operador_id) ?? null; });
    }
  }
  if (idsBusqueda) { const pos = new Map(idsBusqueda.map((id, i) => [id, i])); filas.sort((a, b) => (pos.get(a.id) ?? 0) - (pos.get(b.id) ?? 0)); }
  else filas.sort((a, b) => (b.creado_en ?? '').localeCompare(a.creado_en ?? ''));

  // Quién creó cada envío (columna "Creado por"). Dynamo ve a todos los usuarios.
  const nombres = new Map<string, string>(nombresCliente);
  if (dynamo) {
    const ids = [...new Set(filas.map((f) => f.creado_por).filter(Boolean))] as string[];
    if (ids.length) {
      const { data: us } = await supabase.from('usuarios').select('id, nombre, email').in('id', ids);
      (us ?? []).forEach((u) => nombres.set(u.id, u.nombre || u.email));
    }
  }

  // Ficha de un envío (?ver=<id>), encima de la lista. Solo Dynamo por ahora (etapa A).
  let ficha = null, transportistas: Awaited<ReturnType<typeof cargarTransportistasParaAsignar>> = [], errorFicha: string | null = null;
  if (dynamo && sp.ver) {
    const [r, t] = await Promise.all([cargarFicha(supabase, sp.ver), cargarTransportistasParaAsignar(supabase)]);
    ficha = r.ficha ? { ...r.ficha, enVistaCliente: vista.tipo === 'cliente' } : null; errorFicha = r.error; transportistas = t;
  }
  // Ficha para el CLIENTE: con lo que ya trae mis_envios() (sin datos internos) y sus hitos visibles.
  let fichaCli: any = null;
  if (rol === 'cliente' && sp.ver) {
    fichaCli = filas.find((x) => x.id === sp.ver) ?? null;
    if (!fichaCli && /^[0-9a-f-]{36}$/i.test(sp.ver)) {
      const { data } = await supabase.rpc('mis_envios').eq('id', sp.ver).maybeSingle();
      fichaCli = data ?? null;
    }
    if (fichaCli) {
      const { data: hit } = await supabase.from('envio_hitos').select('id, hito, cuando').eq('envio_id', fichaCli.id).order('cuando', { ascending: false }).limit(100);
      const { data: val } = await supabase.rpc('mi_valoracion_envio', { p_envio: fichaCli.id }).maybeSingle();
      const { data: pg } = await supabase.rpc('pagos_envio', { p_envio: fichaCli.id }).maybeSingle();
      const { data: cf } = await supabase.rpc('mi_contraoferta', { p_envio: fichaCli.id }).maybeSingle();
      const { data: cb } = await supabase.rpc('mi_cambio_envio', { p_envio: fichaCli.id }).maybeSingle();
      const { data: rv } = await supabase.rpc('revision_precio_envio', { p_envio: fichaCli.id }).maybeSingle();
      // Hora límite para cancelar gratis (9:00 del día hábil anterior): sale en el aviso de «llámanos».
      const fc = fichaCli.fecha_carga_desde ?? fichaCli.fecha_carga_real;
      const { data: corte } = fc ? await supabase.rpc('corte_cancelacion', { p_fecha_carga: fc }) : { data: null };
      // Pago con tarjeta: solo si Stripe está conectado (claves en Vercel).
      fichaCli = { ...fichaCli, hitos: hit ?? [], valoracion: val ?? null, pago: pg ?? null, contraoferta: cf ?? null, cambio: cb ?? null, revision: rv ?? null, corte: (corte as string | null) ?? null,
        tarjeta: stripeListo(), pagoVuelta: sp.pago ?? null };
    }
  }
  // Etapa C: el TRANSPORTISTA, su ficha de viaje y sus ofertas abiertas.
  let fichaViaje: any = null, ofertas: Oferta[] = [];
  if (rol === 'transportista') {
    if (sp.ver) fichaViaje = filas.find((x) => x.id === sp.ver) ?? null;
    const { data } = await supabase.rpc('mis_ofertas');
    ofertas = (data ?? []) as Oferta[];
  }
  const sinVer = new URLSearchParams(Object.entries(sp).filter(([k, v]) => k !== 'ver' && v) as [string, string][]).toString();
  const cerrarHref = `/panel/envios${sinVer ? `?${sinVer}` : ''}`;

  return (
    <>
      {ofertas.length > 0 && <OfertasAbiertas ofertas={ofertas} />}
      <TablaEnvios filas={filas} nombres={Object.fromEntries(nombres)} rol={rol} f={sp.f} q={q} p={sp.p} desde={desde} hasta={hasta} busqueda={busqueda} error={error ?? errorFicha} nuevo={sp.nuevo} nota={nota} nuevoManual={!!sp.manual} />
      {ficha && <FichaEnvio key={ficha.envio.id} ficha={ficha} transportistas={transportistas} cerrarHref={cerrarHref} />}
      {fichaCli && <FichaEnvioCliente key={fichaCli.id} e={fichaCli} cerrarHref={cerrarHref} />}
      {fichaViaje && <FichaViaje key={fichaViaje.id} e={fichaViaje} cerrarHref={cerrarHref} />}
    </>
  );
}
