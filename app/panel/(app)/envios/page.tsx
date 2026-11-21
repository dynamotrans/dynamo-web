import { redirect } from 'next/navigation';
import { hoyMadrid, textoBusqueda } from '@/lib/formato';
import { esPendientePago, colocarEnEspera } from '@/lib/envios';
import { filtroFechaValido, rangoFiltroFecha } from '@/lib/filtroFechas';
import { sesion, esDynamo, sinAcceso } from '@/lib/sesion';
import { stripeListo } from '@/lib/stripe';
import { vistaDe, filtrarVista } from '@/lib/vista';
import type { CambioPendiente, EnEspera, EnvioFila, Parada, Pestana } from '@/lib/envios';
import TablaEnvios, { pestanaElegida, POR_PAGINA_ENVIOS } from '@/components/panel/TablaEnvios';
import AvisoCuenta from '@/components/panel/AvisoCuenta';
import FichaEnvio from '@/components/panel/FichaEnvio';
import { cargarFicha } from '@/lib/fichaEnvio';
import FichaEnvioCliente, { type EnvioCliente, type EnvioClienteBase } from '@/components/panel/FichaEnvioCliente';
import FichaViaje, { type Viaje, type ParadaViaje, type CambioViaje } from '@/components/panel/FichaViaje';
import OfertasAbiertas, { type Oferta } from '@/components/panel/OfertasAbiertas';

export const dynamic = 'force-dynamic';
// Lo que llega de la tabla (Dynamo) y de mis_envios/mis_viajes_por_ids() (cliente y transportista).
type FilaDynamo = Omit<EnvioFila, 'cliente' | 'cliente_cif' | 'operador' | 'transportista_asignado' | 'paradas'> & {
  transportista_id: string | null; clientes: { nombre_visible: string | null; cif: string } | null;
  transportistas: { nombre_visible: string | null } | null;
  operadores: { razon_social: string } | null; envio_paradas: Parada[] | null };
// Las funciones no traen todas las columnas de EnvioFila: las que faltan llegan sin valor.
type FilaMia = Omit<EnvioFila, 'cliente' | 'cliente_cif' | 'operador' | 'transportista_asignado' | 'paradas' | 'creado_por'> & {
  creado_por?: string | null; asignado_en?: string | null; operador_id?: string | null; paradas: Parada[] | null };
export default async function PaginaEnvios({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const s = await sesion();
  if (!s) return null;
  const { supabase, perfil } = s;
  if (sinAcceso(perfil)) return <AvisoCuenta perfil={perfil} />;

  const rol = perfil.rol;
  const dynamo = esDynamo(rol);
  const sp = await searchParams;
  const q = (sp.q ?? '').trim().slice(0, 200);
  const qb = textoBusqueda(q);   // lo que se manda a buscar: sin la «#» de «#GX…»
  const vista = await vistaDe(supabase, rol);
  // Buscador (todos los años): texto y/o fechas de carga, por páginas de 100.
  const fechaOk = (x?: string) => (/^\d{4}-\d{2}-\d{2}$/.test(x ?? '') ? x! : '');
  const desde = fechaOk(sp.desde), hasta = fechaOk(sp.hasta);
  const pb = Math.max(1, Math.floor(Number(sp.pb) || 1));
  // ---- La barra de filtros del mockup: operador, creado por, estado y «Fecha» rápida;
  // y la vista (lista o calendario con su mes, acotado a ±3 meses del actual).
  const hoy = hoyMadrid();
  const uuidOk = (x?: string) => (/^[0-9a-f-]{36}$/i.test(x ?? '') ? x! : '');
  const op = sp.op === 'dynamo' ? 'dynamo' : uuidOk(sp.op);
  const por = uuidOk(sp.por);
  const est = ['programado', 'hacia_la_carga', 'cargando', 'en_ruta', 'veh:confirmada', 'veh:sin_asignar'].includes(sp.est ?? '') ? sp.est! : '';
  // «Fecha» de la barra: el filtro único de los listados; en «entre», sus dos días (fd y fh).
  const fr = sp.fr && filtroFechaValido(sp.fr) ? sp.fr : '';
  const fd = fechaOk(sp.fd), fh = fechaOk(sp.fh);
  const rangoFr = rangoFiltroFecha(fr, hoy, fd, fh);
  const vistaCal = sp.vista === 'calendario';
  const mes = (() => {
    const pedido = /^\d{4}-\d{2}$/.test(sp.mes ?? '') ? sp.mes! : hoy.slice(0, 7);
    const [a, m] = pedido.split('-').map(Number); const [ha, hm] = hoy.split('-').map(Number);
    const off = Math.max(-3, Math.min(3, (a - ha) * 12 + (m - hm)));
    const d = new Date(ha, hm - 1 + off, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  })();
  const fDesde = desde || rangoFr?.desde || '', fHasta = hasta || rangoFr?.hasta || '';
  const busca = !vistaCal && !!(q || desde || hasta);
  let busqueda: { total: number; pagina: number; porPagina: number } | null = null;
  let idsBusqueda: string[] | null = null;
  let errorBusqueda: string | null = null;
  if (busca) {
    const POR = 100;
    const v = vista;
    const { data: res, error: eb } = await supabase.rpc('buscar_envios_pagina', {
      p_q: qb || null, p_desde: fDesde || null, p_hasta: fHasta || null, p_pagina: pb, p_por_pagina: POR,
      p_cliente: v.tipo === 'cliente' ? v.id : null, p_transportista: v.tipo === 'transportista' ? v.id : null,
      p_operador: op || null, p_creado_por: por || null, p_estado: est || null,
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
  const nota: string | null = null;
  if (errorBusqueda) error = errorBusqueda;
  // Sin búsqueda: la base de datos cuenta cada pestaña y da los ids de la página que toca (antes
  // se leían hasta 6.000 envíos con sus paradas para enseñar 20).
  let conteos: Record<string, number> | null = null, pestana: Pestana | undefined, pagina = 1, totalPestana = 0;
  let idsPagina: string[] | null = idsBusqueda;
  let enEspera: EnEspera[] = [];
  let idsLeer: string[] | null = null;   // los de la página + los que tienen el contador corriendo
  if (vistaCal) {
    // VISTA CALENDARIO: todos los envíos del mes pintado (por fecha de carga), con el
    // buscador y los filtros de operador y creador. Tope prudente de 500 fichitas.
    const [ma, mm] = mes.split('-').map(Number);
    const d2 = `${mes}-${String(new Date(ma, mm, 0).getDate()).padStart(2, '0')}`;
    const v = vista;
    const { data: res, error: eb } = await supabase.rpc('buscar_envios_pagina', {
      p_q: qb || null, p_desde: `${mes}-01`, p_hasta: d2, p_pagina: 1, p_por_pagina: 500,
      p_cliente: v.tipo === 'cliente' ? v.id : null, p_transportista: v.tipo === 'transportista' ? v.id : null,
      p_operador: op || null, p_creado_por: por || null, p_estado: null,
    });
    if (eb) error = eb.message;
    idsPagina = ((res ?? []) as { id: string }[]).map((x) => x.id);
  } else if (!busca) {
    const v = vista;
    const filtro = { p_cliente: v.tipo === 'cliente' ? v.id : null, p_transportista: v.tipo === 'transportista' ? v.id : null };
    const { data: cts, error: ec } = await supabase.rpc('envios_pestanas', filtro);
    if (ec) error = ec.message;
    conteos = Object.fromEntries(((cts ?? []) as { pestana: string; total: number }[]).map((x) => [x.pestana, Number(x.total)]));
    pestana = pestanaElegida(dynamo, sp.f, (p) => conteos![p] ?? 0);
    totalPestana = conteos[pestana] ?? 0;
    pagina = Math.min(Math.max(1, Math.floor(Number(sp.p) || 1)), Math.max(1, Math.ceil(totalPestana / POR_PAGINA_ENVIOS)));
    const { data: pg, error: ep } = await supabase.rpc('envios_pagina', { p_pestana: pestana, p_pagina: pagina, p_por_pagina: POR_PAGINA_ENVIOS, ...filtro,
      p_operador: op || null, p_creado_por: por || null, p_estado: est || null,
      p_desde: rangoFr?.desde ?? null, p_hasta: rangoFr?.hasta ?? null });
    if (ep) error = ep.message;
    const pgRows = (pg ?? []) as { id: string; total: number }[];
    idsPagina = pgRows.map((x) => x.id);
    // Con filtros de barra puestos, el total real es el FILTRADO (lo trae la propia página).
    if (op || por || est || rangoFr) totalPestana = Number(pgRows[0]?.total ?? 0);
    // Contador de 30 s: los envíos con un cambio corriendo siguen en su pestaña de antes,
    // arriba del todo, hasta que acaba el plazo (usuario, 2026-11-20). Sin filtros de barra.
    if (!(op || por || est || rangoFr)) {
      const { data: esp } = await supabase.rpc('cambios_en_espera', filtro);
      enEspera = (esp ?? []) as EnEspera[];
      idsLeer = [...new Set([...enEspera.map((x) => x.envio_id), ...idsPagina])];
    }
  }
  if (dynamo) {
    const COLS = 'id, referencia_gx, referencia_cliente, estado, estado_asignacion, es_manual, transportista_id, ' +
      'fecha_carga_desde, fecha_carga_hasta, fecha_carga_real, fecha_entrega_estimada, descripcion_mercancia, ' +
      'toneladas, metros_lineales, tipo_carga, requiere_plataforma_elevadora, paletizado, poblacion_origen, codigo_postal_origen, poblacion_destino, codigo_postal_destino, ' +
      'importe_cliente, importe_transportista, precio_acordado_operador, precio_fijado_a_mano, matricula_camion, conductor_nombre, conductor_telefono, transportistas(nombre_visible), ' +
      'matricula_remolque, creado_en, modificado_en, creado_por, estado_solicitud, estado_pago_previo, estado_cambio_cliente, requiere_revision_precio, clientes(nombre_visible, cif), operadores(razon_social), ' +
      'envio_paradas(orden, tipo, nombre_empresa, direccion, codigo_postal, poblacion, provincia, pais_codigo_iso, sitios(tipo))';
    let data: FilaDynamo[] = [];
    if ((idsLeer ?? idsPagina!).length) {
      const r = await filtrarVista(supabase.from('envios').select(COLS), vista).in('id', idsLeer ?? idsPagina!).overrideTypes<FilaDynamo[], { merge: false }>();
      if (r.error) error = r.error.message;
      data = r.data ?? [];
    }
    filas = data.map((x) => ({
      ...x, cliente: x.clientes?.nombre_visible ?? null, cliente_cif: x.clientes?.cif ?? null,
      transportista: x.transportistas?.nombre_visible ?? null,
      operador: x.operadores?.razon_social ?? null, transportista_asignado: !!x.transportista_id,
      paradas: ((x.envio_paradas ?? []) as (Parada & { sitios?: { tipo: string } | null })[]).map(({ sitios, ...p }) => ({ ...p, tipo_sitio: sitios?.tipo ?? null })),
    }));
    // El plazo de los pendientes de pago de ESTA página, para su temporizador (son pocos: se
    // pide uno a uno a la misma función que usa la ficha).
    const pend = filas.filter((f) => esPendientePago(f));
    const plazos = await Promise.all(pend.map((f) => supabase.rpc('pagos_envio', { p_envio: f.id }).maybeSingle()));
    pend.forEach((f, i) => { f.pago_limite = plazos[i].data?.pago_limite ?? null; f.pago_avisado_en = plazos[i].data?.pago_avisado_en ?? null; });
  } else {
    const { data, error: e } = (idsLeer ?? idsPagina!).length
      ? await supabase.rpc(rol === 'transportista' ? 'mis_viajes_por_ids' : 'mis_envios_por_ids', { p_ids: idsLeer ?? idsPagina })
      : { data: [], error: null };
    if (e) error = e.message;
    const mias: (EnvioFila & { operador_id?: string | null })[] = ((data ?? []) as unknown as FilaMia[]).map((x) => ({
      ...x, cliente: null, cliente_cif: null, operador: null, creado_por: x.creado_por ?? null,
      transportista_asignado: !!x.asignado_en || x.estado_asignacion === 'confirmada',
      paradas: (x.paradas ?? []) as Parada[],
    }));
    filas = mias;
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
      const pp = new Map(((pagos ?? []) as { envio_id: string; estado_pago_previo: string; pago_limite: string | null; pago_avisado_en: string | null }[]).map((x) => [x.envio_id, x]));
      filas.forEach((f) => { f.estado_pago_previo = pp.get(f.id)?.estado_pago_previo ?? null; f.pago_limite = pp.get(f.id)?.pago_limite ?? null; f.pago_avisado_en = pp.get(f.id)?.pago_avisado_en ?? null; });
    }
    // Nombre del operador de los envíos manuales del cliente (su propio catálogo).
    const ids = [...new Set(mias.map((f) => f.operador_id).filter(Boolean))] as string[];
    if (ids.length) {
      const { data: ops } = await supabase.from('operadores').select('id, razon_social').in('id', ids);
      const mapa = new Map((ops ?? []).map((o) => [o.id, o.razon_social]));
      mias.forEach((f) => { f.operador = mapa.get(f.operador_id as string) ?? null; });
    }
  }
  // Seguimiento: en qué parada está cada uno y si un programado sin camión ya está «Asignando
  // transportista» (a menos de 36 h de poder cargar). Lo calcula la base de datos.
  if (filas.length) {
    const { data: seg } = await supabase.rpc('seguimiento_envios', { p_ids: filas.map((f) => f.id) });
    const m = new Map((seg ?? []).map((x) => [x.envio_id, x]));
    filas.forEach((f) => {
      const x = m.get(f.id);
      if (x) Object.assign(f, { parada_actual: x.parada_actual, tipo_parada: x.tipo_parada, asignando: x.asignando, fecha_carga_prevista: x.fecha_carga_prevista, automatico: x.automatico });
    });
    // Entrega estimada: la fijada o, sin ella, la ventana desde la recogida (usuario, 2026-11-19).
    const { data: ent } = await supabase.rpc('entregas_estimadas', { p_ids: filas.map((f) => f.id) });
    const me = new Map((ent ?? []).map((x) => [x.envio_id, x]));
    filas.forEach((f) => { const x = me.get(f.id); if (x) Object.assign(f, { entrega_desde: x.desde, entrega_hasta: x.hasta }); });
    // Contador de 30 s: cambios recientes y emails que esperan para salir (usuario, 2026-11-20).
    const { data: pen } = await supabase.rpc('pendientes_envios', { p_ids: filas.map((f) => f.id) });
    const mp = new Map((pen ?? []).map((x) => [x.envio_id, x]));
    filas.forEach((f) => { const x = mp.get(f.id); f.pendiente = x ? { vence_en: x.vence_en, tipo: x.tipo, autor: x.autor, puede_anular: x.puede_anular, emails: x.emails } : null; });
  }
  // El mismo contador para la ficha abierta.
  let pendienteVer: CambioPendiente | null = null;
  if (sp.ver && /^[0-9a-f-]{36}$/i.test(sp.ver)) {
    const { data: pv } = await supabase.rpc('pendientes_envios', { p_ids: [sp.ver] }).maybeSingle();
    if (pv) pendienteVer = { vence_en: pv.vence_en, tipo: pv.tipo, autor: pv.autor, puede_anular: pv.puede_anular, emails: pv.emails };
  }
  // Etapas del envío abierto (cliente y transportista; la ficha de Dynamo las trae con ella).
  const etapasVer = !dynamo && sp.ver && /^[0-9a-f-]{36}$/i.test(sp.ver)
    ? ((await supabase.rpc('etapas_envio', { p_envio: sp.ver })).data ?? []) : [];

  // En el orden que ha dado la base de datos.
  const pos = new Map((idsPagina ?? []).map((id, i) => [id, i]));
  filas.sort((a, b) => (pos.get(a.id) ?? 0) - (pos.get(b.id) ?? 0));
  if (idsLeer && pestana) filas = colocarEnEspera(filas, idsPagina ?? [], enEspera, pestana, pagina, conteos);

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
  let ficha = null, errorFicha: string | null = null;
  if (dynamo && sp.ver) {
    const r = await cargarFicha(supabase, sp.ver);
    // La entrega estimada (fijada o la ventana desde la recogida), como en la lista.
    const { data: ent } = r.ficha ? await supabase.rpc('entregas_estimadas', { p_ids: [r.ficha.envio.id] }).maybeSingle() : { data: null };
    ficha = r.ficha ? { ...r.ficha, enVistaCliente: vista.tipo === 'cliente', entrega: ent ? { desde: ent.desde, hasta: ent.hasta } : null } : null; errorFicha = r.error;
    // Red de seguridad del archivo de copias del DeCA: si la versión de ahora no está
    // guardada (p. ej. una firma hecha sin clave de servicio), se guarda al abrir la ficha.
    if (r.ficha && /^[0-9a-f-]{36}$/i.test(sp.ver)) {
      const { programarCopiaDeca } = await import('@/lib/servidor/archivoDeca');
      await programarCopiaDeca({ envioId: sp.ver, sbDynamo: supabase });
    }
  }
  // Ficha para el CLIENTE: con lo que ya trae mis_envios() (sin datos internos) y sus hitos visibles.
  let fichaCli: EnvioCliente | null = null;
  if (rol === 'cliente' && sp.ver) {
    let base: EnvioClienteBase | null = filas.find((x) => x.id === sp.ver) ?? null;
    if (!base && /^[0-9a-f-]{36}$/i.test(sp.ver)) {
      const { data } = await supabase.rpc('mis_envios').eq('id', sp.ver).maybeSingle();
      base = (data as EnvioClienteBase | null) ?? null;
    }
    // Abierta por enlace directo (no viene de la lista): falta el nombre de su transportista propio.
    // Y su email, para enviarle la orden de carga desde la ficha.
    if (base && base.operador_id) {
      const { data: o } = await supabase.from('operadores').select('razon_social, email').eq('id', base.operador_id).maybeSingle();
      base = { ...base, operador: base.operador ?? o?.razon_social ?? null, operador_email: o?.email ?? null };
    }
    if (base && base.entrega_desde === undefined) {
      const { data: ent } = await supabase.rpc('entregas_estimadas', { p_ids: [base.id] }).maybeSingle();
      base = { ...base, entrega_desde: ent?.desde ?? null, entrega_hasta: ent?.hasta ?? null };
    }
    if (base) {
      const { data: hit } = await supabase.rpc('mis_hitos', { p_envio: base.id }).limit(100);
      const { data: val } = await supabase.rpc('mi_valoracion_envio', { p_envio: base.id }).maybeSingle();
      const { data: pg } = await supabase.rpc('pagos_envio', { p_envio: base.id }).maybeSingle();
      const { data: cb } = await supabase.rpc('mi_cambio_envio', { p_envio: base.id }).maybeSingle();
      const { data: rv } = await supabase.rpc('ver_revision_precio_envio', { p_envio: base.id }).maybeSingle();
      // Hora límite para cancelar gratis (9:00 del día hábil anterior): sale en el aviso de «llámanos».
      // «La carga» es la fecha ASIGNADA si ya la hay; sin asignar, el primer día de la
      // ventana (usuario, 2026-11-18: con carga asignada el viernes, el plazo no puede
      // contarse desde el miércoles en que empezaba la ventana).
      const fc = base.fecha_carga_prevista ?? base.fecha_carga_desde ?? base.fecha_carga_real;
      const { data: corte } = fc ? await supabase.rpc('corte_cancelacion', { p_fecha_carga: fc }) : { data: null };
      // ¿Hay un transportista asignándose ahora mismo? Mientras dura, ni modificar ni cancelar.
      const { data: asig } = await supabase.rpc('mi_envio_asignandose', { p_envio: base.id });
      // Pago con tarjeta: solo si Stripe está conectado (claves en Vercel).
      fichaCli = { ...base, asignandose: asig === true, hitos: hit ?? [], valoracion: val ?? null, pago: pg ?? null, cambio: cb ?? null, revision: rv ?? null, corte: (corte as string | null) ?? null,
        tarjeta: stripeListo(), pagoVuelta: sp.pago ?? null };
    }
  }
  // Etapa C: el TRANSPORTISTA, su ficha de viaje y sus ofertas abiertas.
  let fichaViaje: Viaje | null = null, ofertas: Oferta[] = [];
  let cambioViaje: CambioViaje | null = null;
  if (rol === 'transportista') {
    if (sp.ver) {
      fichaViaje = filas.find((x) => x.id === sp.ver) ?? null;
      // El viaje abierto puede no estar en la página que se ve.
      if (!fichaViaje && /^[0-9a-f-]{36}$/i.test(sp.ver)) {
        const { data } = await supabase.rpc('mis_viajes_por_ids', { p_ids: [sp.ver] });
        const x = (data ?? [])[0];
        fichaViaje = x ? { ...x, paradas: (x.paradas ?? []) as ParadaViaje[] } as Viaje : null;
      }
      // Propuesta de cambios de Dynamo PENDIENTE de aceptar (usuario, 2026-11-10).
      if (fichaViaje) {
        const { data: cv } = await supabase.from('envio_cambios_transportista')
          .select('id, precio_antes, precio_ahora, detalle, creado_en')
          .eq('envio_id', fichaViaje.id).eq('estado', 'pendiente')
          .order('creado_en', { ascending: false }).limit(1).maybeSingle();
        cambioViaje = cv ? { ...cv, precio_antes: cv.precio_antes != null ? Number(cv.precio_antes) : null,
          precio_ahora: cv.precio_ahora != null ? Number(cv.precio_ahora) : null } : null;
      }
    }
    const { data } = await supabase.rpc('mis_ofertas');
    ofertas = (data ?? []) as Oferta[];
  }
  const sinVer = new URLSearchParams(Object.entries(sp).filter(([k, v]) => k !== 'ver' && v) as [string, string][]).toString();
  const cerrarHref = `/panel/envios${sinVer ? `?${sinVer}` : ''}`;

  // Opciones de los desplegables de la barra: Operador = Dynamo + los operadores que ve
  // quien mira (RLS los acota); Creado por = los usuarios de la empresa (o el equipo de
  // Dynamo en su vista de gestión). El transportista no lleva estos filtros.
  let opcOperadores: { id: string; nombre: string }[] = [];
  let opcCreadores: { id: string; nombre: string }[] = [];
  if (rol !== 'transportista') {
    const [opsQ, creQ] = await Promise.all([
      supabase.from('operadores').select('id, razon_social').eq('borrado', false).order('razon_social').limit(200),
      vista.tipo === 'cliente'
        ? supabase.from('usuarios').select('id, nombre, email').eq('cliente_id', vista.id).eq('estado', 'activa').order('email').limit(100)
        : dynamo
          ? supabase.from('usuarios').select('id, nombre, email').in('rol', ['admin', 'empleado', 'admin_lectura', 'empleado_lectura']).eq('estado', 'activa').order('email').limit(100)
          : supabase.from('usuarios').select('id, nombre, email').eq('cliente_id', perfil.cliente_id ?? '00000000-0000-0000-0000-000000000000').eq('estado', 'activa').order('email').limit(100),
    ]);
    opcOperadores = ((opsQ.data ?? []) as { id: string; razon_social: string }[]).map((o) => ({ id: o.id, nombre: o.razon_social }));
    opcCreadores = ((creQ.data ?? []) as { id: string; nombre: string | null; email: string }[]).map((u) => ({ id: u.id, nombre: u.nombre || u.email }));
  }

  return (
    <>
      {ofertas.length > 0 && <OfertasAbiertas ofertas={ofertas} />}
      <TablaEnvios filas={filas} nombres={Object.fromEntries(nombres)} rol={rol} f={sp.f} q={q} p={sp.p} desde={desde} hasta={hasta} busqueda={busqueda} conteos={conteos} pestana={pestana} pagina={pagina} totalPestana={totalPestana} error={error ?? errorFicha} nuevo={sp.nuevo} nota={nota} nuevoManual={!!sp.manual}
        op={op} por={por} est={est} fr={fr} fd={fd} fh={fh} operadores={opcOperadores} creadores={opcCreadores}
        vista={vistaCal ? 'calendario' : 'lista'} mes={mes} hoy={hoy} vistaTransportista={vista.tipo === 'transportista'} />
      {ficha && <FichaEnvio key={ficha.envio.id} ficha={ficha} cerrarHref={cerrarHref} pendiente={pendienteVer} />}
      {fichaCli && <FichaEnvioCliente key={fichaCli.id} e={fichaCli} etapas={etapasVer} cerrarHref={cerrarHref} pendiente={pendienteVer} />}
      {fichaViaje && <FichaViaje key={fichaViaje.id} e={fichaViaje} etapas={etapasVer} cerrarHref={cerrarHref} cambio={cambioViaje} />}
    </>
  );
}
