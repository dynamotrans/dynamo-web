import type { SupabaseClient } from '@supabase/supabase-js';

// Todo lo que enseña la ficha de un envío (solo Dynamo, etapa A), leído en el servidor.
export type ParadaFicha = {
  id: string; orden: number; tipo: 'carga' | 'descarga'; lugar_id: string | null;
  nombre_empresa: string | null; direccion: string | null; codigo_postal: string | null;
  poblacion: string | null; provincia: string | null; pais_codigo_iso: string | null;
  referencia: string | null; anotaciones: string | null;
  // Del sitio de la agenda (si lo es): tipo, horario, notas, Maps y su persona de contacto.
  sitio: { tipo: string | null; horarios: string | null; anotaciones: string | null; url_google_maps: string | null;
           requiere_cita: boolean; tiene_medios_carga: boolean;
           contacto: { nombre: string | null; telefono: string | null; email: string | null } | null } | null;
};
export type HitoFicha = { id: string; hito: string; cuando: string; quien: string | null; origen: string | null; datos: any };
export type PenalizacionFicha = { id: string; codigo: string; tipo: string; descripcion: string | null; importe_cliente: number | null; importe_transportista: number | null; estado: string; generada_auto: boolean };
export type OfertaFicha = { id: string; token: string; canal: string; para: string | null; precio: number; banda_euros: number;
  banda_pct: number; pronto_pago: boolean; estado: string; enviada_en: string; caduca_en: string; aperturas: number; abierta_en: string | null };
export type FirmaCmrFicha = { rol: string; parada_id: string | null; nombre: string; documento: string; documento_pais: string; documento_validado: boolean; firmado_en: string };
export type ContraofertaFicha = { id: string; transportista: string | null; precio_propuesto: number; precio_base: number | null; desde: string;
  alta_online?: { id: string; cif: string; verificado: boolean } | null };   // transportista nuevo dado de alta desde el enlace
export type TransportistaOpcion = { id: string; nombre: string; cif: string; estado: string; nima: string | null;
  telefono: string | null; email: string | null;
  vehiculos: { matricula: string; tipo: string }[]; conductores: { nombre: string; telefono: string | null }[] };
export type Ficha = {
  envio: any; cliente: { id: string; nombre: string; cif: string } | null;
  transportista: { id: string; nombre: string; cif: string } | null; operador: string | null;
  creadoPor: string | null; paradas: ParadaFicha[]; hitos: HitoFicha[]; penalizaciones: PenalizacionFicha[];
  ofertas: OfertaFicha[]; contraofertas: ContraofertaFicha[];
  cmrEnlace: { id: string; token: string; caduca_en: string } | null;   // solo lo ve Dynamo
  firmasCmr: FirmaCmrFicha[];
  corte: string | null;   // hora límite para cancelar gratis (con camión asignado)
  // Previo pago (null = no lo necesita y nunca lo necesitó).
  pago: { estado: string; motivo: string | null; metodo: string | null; pagado_en: string | null; exento_motivo: string | null;
          base: number; iva: number; total: number; conCredito: boolean } | null;
};

export async function cargarFicha(sb: SupabaseClient, id: string): Promise<{ ficha: Ficha | null; error: string | null }> {
  const { data: e, error } = await sb.from('envios')
    .select('*, clientes(id, nombre_visible, cif, riesgo_efectivo_euros), transportistas(id, nombre_visible, cif), operadores(razon_social)')
    .eq('id', id).maybeSingle();
  if (error) return { ficha: null, error: error.message };
  if (!e) return { ficha: null, error: 'Ese envío no existe.' };

  const [par, hit, pen, ofe, res, enl, fir, pag] = await Promise.all([
    sb.from('envio_paradas').select('id, orden, tipo, lugar_id, nombre_empresa, direccion, codigo_postal, poblacion, provincia, pais_codigo_iso, referencia, anotaciones, lugares(tipo, horarios, anotaciones, url_google_maps, requiere_cita, tiene_medios_carga)').eq('envio_id', id).order('orden'),
    sb.from('envio_hitos').select('id, hito, cuando, quien, quien_origen, datos').eq('envio_id', id).order('cuando', { ascending: false }).limit(200),
    sb.from('penalizaciones').select('id, codigo, descripcion, importe_cliente, importe_transportista, estado, generada_auto, tipos_penalizacion(nombre)').eq('envio_id', id).order('creado_en'),
    sb.from('envio_ofertas').select('id, token, canal, precio_ofertado, banda_euros, banda_pct, pronto_pago, estado, enviada_en, caduca_en, aperturas, abierta_en, transportistas(nombre_visible)').eq('envio_id', id).order('enviada_en', { ascending: false }),
    sb.from('envio_reservas').select('id, precio_propuesto, desde, oferta_id, transportistas(id, nombre_visible, cif, tags, estado_operativo), envio_ofertas(precio_ofertado)').eq('envio_id', id).eq('estado', 'pendiente_revision'),
    sb.from('cmr_enlaces').select('id, token, caduca_en').eq('envio_id', id).eq('revocado', false).gt('caduca_en', new Date().toISOString()).maybeSingle(),
    sb.from('firmas_cmr').select('rol, parada_id, nombre, documento, documento_pais, documento_validado, firmado_en').eq('envio_id', id).order('firmado_en'),
    sb.rpc('pagos_envio', { p_envio: id }).maybeSingle(),
  ]);
  const pg = pag.data as any;

  const lugarIds = (par.data ?? []).map((p: any) => p.lugar_id).filter(Boolean);
  const contactos = new Map<string, any>();
  if (lugarIds.length) {
    const { data } = await sb.from('contactos').select('lugar_id, nombre, telefono, email').in('lugar_id', lugarIds).eq('es_principal', true);
    (data ?? []).forEach((c) => contactos.set(c.lugar_id as string, c));
  }
  const usuarios = [...new Set([e.creado_por, ...(hit.data ?? []).map((h: any) => h.quien)].filter(Boolean))] as string[];
  const nombres = new Map<string, string>();
  if (usuarios.length) {
    const { data } = await sb.from('usuarios').select('id, nombre, email').in('id', usuarios);
    (data ?? []).forEach((u) => nombres.set(u.id, u.nombre || u.email));
  }
  let corte: string | null = null;
  const fechaCarga = e.fecha_carga_desde ?? e.fecha_carga_real;
  if (fechaCarga) {
    const { data } = await sb.rpc('corte_cancelacion', { p_fecha_carga: fechaCarga });
    corte = (data as string) ?? null;
  }

  return {
    error: null,
    ficha: {
      envio: e,
      cliente: e.clientes ? { id: e.clientes.id, nombre: e.clientes.nombre_visible, cif: e.clientes.cif } : null,
      transportista: e.transportistas ? { id: e.transportistas.id, nombre: e.transportistas.nombre_visible, cif: e.transportistas.cif } : null,
      operador: e.operadores?.razon_social ?? null,
      creadoPor: e.creado_por ? nombres.get(e.creado_por) ?? null : null,
      paradas: (par.data ?? []).map((p: any) => ({
        ...p,
        sitio: p.lugares ? { ...p.lugares, contacto: p.lugar_id ? contactos.get(p.lugar_id) ?? null : null } : null,
      })),
      hitos: (hit.data ?? []).map((h: any) => ({ id: h.id, hito: h.hito, cuando: h.cuando, quien: h.quien ? nombres.get(h.quien) ?? null : null, origen: h.quien_origen, datos: h.datos })),
      penalizaciones: (pen.data ?? []).map((p: any) => ({ ...p, tipo: p.tipos_penalizacion?.nombre ?? 'Penalización' })),
      ofertas: (ofe.data ?? []).map((o: any) => ({ id: o.id, token: o.token, canal: o.canal, para: o.transportistas?.nombre_visible ?? null,
        precio: Number(o.precio_ofertado), banda_euros: Number(o.banda_euros), banda_pct: o.banda_pct, pronto_pago: o.pronto_pago,
        estado: o.estado, enviada_en: o.enviada_en, caduca_en: o.caduca_en, aperturas: o.aperturas, abierta_en: o.abierta_en })),
      contraofertas: (res.data ?? []).map((r: any) => ({ id: r.id, transportista: r.transportistas?.nombre_visible ?? null,
        precio_propuesto: Number(r.precio_propuesto), precio_base: r.envio_ofertas?.precio_ofertado != null ? Number(r.envio_ofertas.precio_ofertado) : (e.importe_transportista != null ? Number(e.importe_transportista) : null), desde: r.desde,
        alta_online: (r.transportistas?.tags ?? []).includes('alta_online') ? { id: r.transportistas.id, cif: r.transportistas.cif, verificado: r.transportistas.estado_operativo === 'activo' } : null })),
      cmrEnlace: (enl.data as any) ?? null,
      firmasCmr: ((fir.data ?? []) as any[]).map((f) => ({ ...f, documento: `•••${String(f.documento).slice(-4)}` })),
      corte,
      pago: pg ? { estado: pg.pago_previo, motivo: pg.pago_motivo, metodo: pg.pago_metodo, pagado_en: pg.pagado_en, exento_motivo: e.pago_exento_motivo ?? null,
        base: Number(pg.base), iva: Number(pg.iva), total: Number(pg.total), conCredito: Number(e.clientes?.riesgo_efectivo_euros ?? 0) > 0 } : null,
    },
  };
}

// Transportistas para "Asignar transportista", con su flota y conductores para sugerir.
export async function cargarTransportistasParaAsignar(sb: SupabaseClient): Promise<TransportistaOpcion[]> {
  const [tra, veh, con, cto] = await Promise.all([
    sb.from('transportistas').select('id, nombre_visible, cif, estado_operativo, nima').order('nombre_visible').limit(10000),
    sb.from('vehiculos').select('transportista_id, matricula, tipo').eq('activo', true).limit(50000),
    sb.from('conductores').select('transportista_id, nombre, telefono').eq('activo', true).limit(50000),
    sb.from('contactos').select('transportista_id, telefono, email').eq('funcion', 'trafico').eq('es_principal', true).not('transportista_id', 'is', null).limit(50000),
  ]);
  const trafico = new Map((cto.data ?? []).map((x: any) => [x.transportista_id as string, x]));
  const v = new Map<string, { matricula: string; tipo: string }[]>();
  (veh.data ?? []).forEach((x: any) => v.set(x.transportista_id, [...(v.get(x.transportista_id) ?? []), { matricula: x.matricula, tipo: x.tipo }]));
  const c = new Map<string, { nombre: string; telefono: string | null }[]>();
  (con.data ?? []).forEach((x: any) => c.set(x.transportista_id, [...(c.get(x.transportista_id) ?? []), { nombre: x.nombre, telefono: x.telefono }]));
  return (tra.data ?? []).map((t: any) => ({ id: t.id, nombre: t.nombre_visible, cif: t.cif, estado: t.estado_operativo, nima: t.nima,
    telefono: trafico.get(t.id)?.telefono ?? null, email: trafico.get(t.id)?.email ?? null,
    vehiculos: v.get(t.id) ?? [], conductores: c.get(t.id) ?? [] }));
}
