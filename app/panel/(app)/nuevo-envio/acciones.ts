'use server';

import { mensajeError } from '@/lib/mensajeError';
import { sesion, esGestor } from '@/lib/sesion';

export type ParadaNueva = {
  tipo: 'carga' | 'descarga';
  lugar_id?: string | null;
  nombre_empresa?: string; direccion?: string; codigo_postal?: string; poblacion?: string;
  provincia?: string; pais_codigo_iso?: string; tipo_lugar?: string; horarios?: string;
  guardar_en_agenda?: boolean;
  contacto_nombre?: string; contacto_telefono?: string;   // del sitio nuevo que se guarda en la agenda
  horario_tramos?: { dia: number; abre: string; cierra: string }[];   // su horario, si no es el de por defecto
  referencia?: string; anotaciones?: string;
};

// Persona y teléfono del sitio nuevo guardado en la agenda: como contacto PRINCIPAL del
// sitio (el que sale en la orden de carga y en el CMR). Se busca el sitio que acaba de
// crear la base de datos por la posición de la parada en la ruta.
// Y su horario, si se cambió (si no, la base de datos le pone el de por defecto). Va
// después de crear el envío, que es cuando existe el sitio.
async function contactosDeSitiosNuevos(sb: any, envioId: string, paradas: ParadaNueva[], esCliente = false) {
  const nuevos = paradas.map((p, i) => ({ p, i })).filter(({ p }) => p.guardar_en_agenda && !p.lugar_id);
  const conContacto = nuevos.filter(({ p }) => (p.contacto_telefono || '').replace(/[^\d]/g, '').length >= 6);
  const conHorario = nuevos.filter(({ p }) => p.horario_tramos?.length);
  if (!conContacto.length && !conHorario.length) return;
  // Dynamo lee las paradas; el cliente no puede (solo con mis_envios(), que las trae).
  let filas: { orden: number; lugar_id: string | null }[] = [];
  if (esCliente) {
    const { data } = await sb.rpc('mis_envios').eq('id', envioId).maybeSingle();
    filas = (((data as any)?.paradas ?? []) as { orden: number; lugar_id: string | null }[]).sort((a, b) => a.orden - b.orden);
  } else {
    const { data } = await sb.from('envio_paradas').select('orden, lugar_id').eq('envio_id', envioId).order('orden');
    filas = (data ?? []) as { orden: number; lugar_id: string | null }[];
  }
  for (const { p, i } of conContacto) {
    const lugar = filas[i]?.lugar_id;
    if (!lugar) continue;
    const tel = (p.contacto_telefono ?? '').replace(/[^\d+]/g, '');
    await sb.from('contactos').insert({ lugar_id: lugar, nombre: (p.contacto_nombre ?? '').trim() || null, telefono: tel, es_principal: true });
  }
  for (const { p, i } of conHorario) {
    const lugar = filas[i]?.lugar_id;
    if (lugar) await sb.rpc('guardar_horario', { p_lugar: lugar, p_tramos: p.horario_tramos });
  }
}
export type EnvioNuevo = {
  cliente_id: string; referencia_cliente?: string;
  fecha_carga_desde: string; fecha_carga_hasta: string;
  descripcion_mercancia?: string; toneladas: number; metros_lineales: number;
  paletizado: boolean; carga_lateral: boolean; carga_trasera: boolean; carga_superior: boolean;
  plataforma_elevadora: boolean; nima_requerido: boolean; adr: boolean;
  importe_cliente: number; importe_transportista?: number | null;
  discrecion_comercial: boolean; anotaciones_cliente?: string;
  negociacion_pct?: number | null;   // banda de negociación por defecto al ofertar (0/5/10/30)
};

// Mensajes de la base de datos → frase entendible. Lo que no se reconoce se enseña tal
// cual (son nuestros propios mensajes, ya en castellano).
function traducir(msg: string): string {
  if (/duplicate key|ux_clientes_cif|unique/i.test(msg)) return 'Ya existe un cliente con ese CIF/NIF.';
  if (/permission denied|42501|row-level security/i.test(msg)) return 'No tienes permiso para hacer esto.';
  return mensajeError(msg);   // los de las reglas de la base de datos ya vienen en castellano
}

export async function crearEnvio(envio: EnvioNuevo, paradas: ParadaNueva[]):
  Promise<{ ok: true; referencia_gx: string } | { ok: false; error: string }> {
  const s = await sesion();
  if (!s?.perfil || s.perfil.estado !== 'activa' || !esGestor(s.perfil.rol)) {
    return { ok: false, error: 'Solo el equipo de Dynamo puede crear envíos por ahora.' };
  }
  // Comprobaciones básicas aquí también (la base de datos vuelve a comprobarlo todo).
  if (!envio.cliente_id) return { ok: false, error: 'Elige el cliente.' };
  if (!(envio.importe_cliente > 0)) return { ok: false, error: 'Pon el precio del cliente (base sin IVA).' };
  if (paradas.length < 2) return { ok: false, error: 'Falta la recogida o la entrega.' };

  const { negociacion_pct, ...resto } = envio;
  if (negociacion_pct != null && ![0, 5, 10, 30].includes(negociacion_pct)) return { ok: false, error: 'La negociación del precio no es válida.' };
  const { data, error } = await s.supabase.rpc('crear_envio', { p_envio: resto, p_paradas: paradas });
  if (error) return { ok: false, error: traducir(error.message) };
  const fila = (Array.isArray(data) ? data[0] : data) as { id: string; referencia_gx: string } | undefined;
  if (fila?.id && negociacion_pct != null) {
    await s.supabase.from('envios').update({ negociacion_pct }).eq('id', fila.id);
  }
  if (fila?.id) await contactosDeSitiosNuevos(s.supabase, fila.id, paradas);
  return { ok: true, referencia_gx: fila?.referencia_gx ?? '' };
}

// Alta rápida de cliente desde el envío (la ficha completa llegará con la pantalla de
// Clientes). La base de datos impide CIF repetidos (regla 10).
export async function crearClienteRapido(razon_social: string, cif: string, pais_codigo_iso: string):
  Promise<{ ok: true; cliente: { id: string; nombre: string; cif: string } } | { ok: false; error: string }> {
  const s = await sesion();
  if (!s?.perfil || s.perfil.estado !== 'activa' || !esGestor(s.perfil.rol)) {
    return { ok: false, error: 'Solo el equipo de Dynamo puede dar de alta clientes.' };
  }
  const rs = razon_social.trim(), c = cif.trim().toUpperCase();
  if (!rs || !c) return { ok: false, error: 'Escribe la razón social y el CIF/NIF.' };
  const { data, error } = await s.supabase.from('clientes')
    .insert({ razon_social: rs, cif: c, pais_codigo_iso: pais_codigo_iso || 'ES' })
    .select('id, nombre_visible, cif').single();
  if (error) return { ok: false, error: traducir(error.message) };
  return { ok: true, cliente: { id: data.id, nombre: data.nombre_visible, cif: data.cif } };
}

// Cambiar la ruta de un envío ya creado (antes de cargar). Las paradas con `id` se
// mantienen; las demás se crean; las que no vienen se quitan. Lo comprueba la base de datos.
export async function cambiarRuta(envio: string, paradas: (ParadaNueva & { id?: string })[]): Promise<{ ok: true } | { ok: false; error: string }> {
  const s = await sesion();
  if (!s?.perfil || s.perfil.estado !== 'activa' || !esGestor(s.perfil.rol)) return { ok: false, error: 'Solo el equipo de Dynamo puede cambiar la ruta.' };
  if (paradas.length < 2) return { ok: false, error: 'Falta la recogida o la entrega.' };
  const { error } = await s.supabase.rpc('cambiar_ruta_envio', { p_envio: envio, p_paradas: paradas.map((p) => (p.id ? { id: p.id } : p)) });
  if (error) return { ok: false, error: traducir(error.message) };
  await contactosDeSitiosNuevos(s.supabase, envio, paradas);
  return { ok: true };
}

// Etapa B: el CLIENTE pide un envío (solicitud). Sin precio: Dynamo se lo pone y él lo
// acepta desde su panel. La base de datos fuerza que sea de SU empresa y con SUS sitios.
export async function crearSolicitud(envio: Omit<EnvioNuevo, 'cliente_id' | 'importe_cliente' | 'importe_transportista'>, paradas: ParadaNueva[]):
  Promise<{ ok: true; referencia_gx: string } | { ok: false; error: string }> {
  const s = await sesion();
  if (!s?.perfil || s.perfil.estado !== 'activa' || s.perfil.rol !== 'cliente') return { ok: false, error: 'Tu cuenta no puede pedir envíos todavía.' };
  if (paradas.length < 2) return { ok: false, error: 'Falta la recogida o la entrega.' };
  const { data, error } = await s.supabase.rpc('crear_solicitud_envio', { p_envio: envio, p_paradas: paradas });
  if (error) return { ok: false, error: traducir(error.message) };
  const fila = (Array.isArray(data) ? data[0] : data) as { id?: string; referencia_gx: string } | undefined;
  if (fila?.id) await contactosDeSitiosNuevos(s.supabase, fila.id, paradas, true);
  return { ok: true, referencia_gx: fila?.referencia_gx ?? '' };
}

// Dynamo pone precio a la solicitud de un cliente (el cliente lo acepta después).
export async function proponerPrecio(envio: string, importe: number, importeT: number | null): Promise<{ ok: true; aviso?: string } | { ok: false; error: string }> {
  const s = await sesion();
  if (!s?.perfil || s.perfil.estado !== 'activa' || !esGestor(s.perfil.rol)) return { ok: false, error: 'Solo Dynamo pone precio.' };
  if (!(importe > 0)) return { ok: false, error: 'Pon el precio del cliente (base sin IVA).' };
  if (importeT != null && !(importeT >= 0)) return { ok: false, error: 'El precio del transportista no es válido.' };
  const { error } = await s.supabase.rpc('proponer_precio_solicitud', { p_envio: envio, p_importe: importe, p_importe_transportista: importeT });
  return error ? { ok: false, error: traducir(error.message) } : { ok: true, aviso: 'Precio enviado al cliente: lo verá en su panel para aceptarlo.' };
}

// El CLIENTE crea un envío con SU propio operador (manual): Dynamo no interviene.
export async function crearEnvioManual(envio: Omit<EnvioNuevo, 'cliente_id' | 'importe_cliente' | 'importe_transportista'> & { operador_id: string; precio_acordado_operador: number | null }, paradas: ParadaNueva[]):
  Promise<{ ok: true; referencia_gx: string } | { ok: false; error: string }> {
  const s = await sesion();
  if (!s?.perfil || s.perfil.estado !== 'activa' || s.perfil.rol !== 'cliente') return { ok: false, error: 'Tu cuenta no puede crear envíos todavía.' };
  if (!envio.operador_id) return { ok: false, error: 'Elige tu operador de transporte.' };
  if (paradas.length < 2) return { ok: false, error: 'Falta la recogida o la entrega.' };
  const { data, error } = await s.supabase.rpc('crear_envio_manual', { p_envio: envio, p_paradas: paradas });
  if (error) return { ok: false, error: traducir(error.message) };
  const fila = (Array.isArray(data) ? data[0] : data) as { id?: string; referencia_gx: string } | undefined;
  if (fila?.id) await contactosDeSitiosNuevos(s.supabase, fila.id, paradas, true);
  return { ok: true, referencia_gx: fila?.referencia_gx ?? '' };
}

// Días de la semana en que abre cada sitio, en su horario general y en el de verano (para
// avisar si la recogida cae en día cerrado y del horario de verano), y las fechas genéricas
// del verano de los almacenes (Parámetros). Solo los sitios que el usuario puede ver: lo
// filtra la seguridad por filas.
export type HorarioSitioAviso = { general: number[]; verano: { activo: boolean; desde: string | null; hasta: string | null; dias: number[]; resumen: string | null } };
export async function diasAbiertosDe(ids: string[]): Promise<{ sitios: Record<string, HorarioSitioAviso>; generico: { desde: string; hasta: string } }> {
  const s = await sesion();
  const limpios = [...new Set(ids)].filter((x) => /^[0-9a-f-]{36}$/i.test(x)).slice(0, 20);
  const generico = { desde: '05-25', hasta: '09-15' };
  if (!s?.perfil) return { sitios: {}, generico };
  const [{ data: pv }, h, l] = await Promise.all([
    s.supabase.rpc('verano_sitios_fechas'),
    limpios.length ? s.supabase.from('lugar_horarios').select('lugar_id, temporada, dia_semana').in('lugar_id', limpios) : Promise.resolve({ data: [] as any[] }),
    limpios.length ? s.supabase.from('lugares').select('id, verano_activo, verano_desde, verano_hasta, horarios_verano').in('id', limpios) : Promise.resolve({ data: [] as any[] }),
  ]);
  // Las fechas genéricas, con una función: Parámetros solo lo lee Dynamo.
  const g = pv as { desde?: string; hasta?: string } | null;
  if (g?.desde) generico.desde = g.desde;
  if (g?.hasta) generico.hasta = g.hasta;
  const sitios: Record<string, HorarioSitioAviso> = {};
  (l.data ?? []).forEach((x: any) => { sitios[x.id] = { general: [], verano: { activo: !!x.verano_activo, desde: x.verano_desde, hasta: x.verano_hasta, dias: [], resumen: x.horarios_verano } }; });
  (h.data ?? []).forEach((r: any) => {
    const x = sitios[r.lugar_id]; if (!x) return;
    const lista = r.temporada === 'verano' ? x.verano.dias : x.general;
    if (!lista.includes(r.dia_semana)) lista.push(r.dia_semana);
  });
  return { sitios, generico };
}

// ¿Se hace esta ruta? La misma comprobación que al confirmar (países en los que
// trabajamos y excepciones), pero antes, para avisar en cuanto se pone la ruta. Devuelve
// los motivos de lo que no se puede (vacío = se puede).
export async function comprobarCobertura(paradas: { orden: number; tipo: 'carga' | 'descarga'; pais: string; codigo_postal: string; nombre: string }[],
  tipoCarga: 'completa' | 'grupaje' | null): Promise<{ punto: string; efecto: string; mensaje: string }[]> {
  const s = await sesion();
  if (!s?.perfil) return [];
  const { data } = await s.supabase.rpc('comprobar_cobertura', { p_paradas: paradas.slice(0, 20), p_tipo_carga: tipoCarga });
  return ((data ?? []) as any[]).map((x) => ({ punto: x.punto, efecto: x.efecto, mensaje: x.mensaje }));
}
