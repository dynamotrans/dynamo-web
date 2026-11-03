'use server';

import { sesion, esDynamo } from '@/lib/sesion';

export type ParadaNueva = {
  tipo: 'carga' | 'descarga';
  lugar_id?: string | null;
  nombre_empresa?: string; direccion?: string; codigo_postal?: string; poblacion?: string;
  provincia?: string; pais_codigo_iso?: string; tipo_lugar?: string; horarios?: string;
  guardar_en_agenda?: boolean;
  contacto_nombre?: string; contacto_telefono?: string;   // del sitio nuevo que se guarda en la agenda
  referencia?: string; anotaciones?: string;
};

// Persona y teléfono del sitio nuevo guardado en la agenda: como contacto PRINCIPAL del
// sitio (el que sale en la orden de carga y en el CMR). Se busca el sitio que acaba de
// crear la base de datos por la posición de la parada en la ruta.
async function contactosDeSitiosNuevos(sb: any, envioId: string, paradas: ParadaNueva[]) {
  const con = paradas.map((p, i) => ({ p, i })).filter(({ p }) => p.guardar_en_agenda && !p.lugar_id && (p.contacto_telefono || '').replace(/[^\d]/g, '').length >= 6);
  if (!con.length) return;
  const { data } = await sb.from('envio_paradas').select('orden, lugar_id').eq('envio_id', envioId).order('orden');
  const filas = (data ?? []) as { orden: number; lugar_id: string | null }[];
  for (const { p, i } of con) {
    const lugar = filas[i]?.lugar_id;
    if (!lugar) continue;
    const tel = (p.contacto_telefono ?? '').replace(/[^\d+]/g, '');
    await sb.from('contactos').insert({ lugar_id: lugar, nombre: (p.contacto_nombre ?? '').trim() || null, telefono: tel, es_principal: true });
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
};

// Mensajes de la base de datos → frase entendible. Lo que no se reconoce se enseña tal
// cual (son nuestros propios mensajes, ya en castellano).
function traducir(msg: string): string {
  if (/duplicate key|ux_clientes_cif|unique/i.test(msg)) return 'Ya existe un cliente con ese CIF/NIF.';
  if (/permission denied|42501|row-level security/i.test(msg)) return 'No tienes permiso para hacer esto.';
  return msg;
}

export async function crearEnvio(envio: EnvioNuevo, paradas: ParadaNueva[]):
  Promise<{ ok: true; referencia_gx: string } | { ok: false; error: string }> {
  const s = await sesion();
  if (!s?.perfil || s.perfil.estado !== 'activa' || !esDynamo(s.perfil.rol)) {
    return { ok: false, error: 'Solo el equipo de Dynamo puede crear envíos por ahora.' };
  }
  // Comprobaciones básicas aquí también (la base de datos vuelve a comprobarlo todo).
  if (!envio.cliente_id) return { ok: false, error: 'Elige el cliente.' };
  if (!(envio.importe_cliente > 0)) return { ok: false, error: 'Pon el precio del cliente (base sin IVA).' };
  if (paradas.length < 2) return { ok: false, error: 'Falta la recogida o la entrega.' };

  const { data, error } = await s.supabase.rpc('crear_envio', { p_envio: envio, p_paradas: paradas });
  if (error) return { ok: false, error: traducir(error.message) };
  const fila = (Array.isArray(data) ? data[0] : data) as { id: string; referencia_gx: string } | undefined;
  if (fila?.id) await contactosDeSitiosNuevos(s.supabase, fila.id, paradas);
  return { ok: true, referencia_gx: fila?.referencia_gx ?? '' };
}

// Alta rápida de cliente desde el envío (la ficha completa llegará con la pantalla de
// Clientes). La base de datos impide CIF repetidos (regla 10).
export async function crearClienteRapido(razon_social: string, cif: string, pais_codigo_iso: string):
  Promise<{ ok: true; cliente: { id: string; nombre: string; cif: string } } | { ok: false; error: string }> {
  const s = await sesion();
  if (!s?.perfil || s.perfil.estado !== 'activa' || !esDynamo(s.perfil.rol)) {
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
  if (!s?.perfil || s.perfil.estado !== 'activa' || !esDynamo(s.perfil.rol)) return { ok: false, error: 'Solo el equipo de Dynamo puede cambiar la ruta.' };
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
  const fila = (Array.isArray(data) ? data[0] : data) as { referencia_gx: string } | undefined;
  return { ok: true, referencia_gx: fila?.referencia_gx ?? '' };
}

// Dynamo pone precio a la solicitud de un cliente (el cliente lo acepta después).
export async function proponerPrecio(envio: string, importe: number, importeT: number | null): Promise<{ ok: true; aviso?: string } | { ok: false; error: string }> {
  const s = await sesion();
  if (!s?.perfil || s.perfil.estado !== 'activa' || !esDynamo(s.perfil.rol)) return { ok: false, error: 'Solo Dynamo pone precio.' };
  if (!(importe > 0)) return { ok: false, error: 'Pon el precio del cliente (base sin IVA).' };
  if (importeT != null && !(importeT >= 0)) return { ok: false, error: 'El precio del transportista no es válido.' };
  const { error } = await s.supabase.rpc('proponer_precio_solicitud', { p_envio: envio, p_importe: importe, p_importe_transportista: importeT });
  return error ? { ok: false, error: traducir(error.message) } : { ok: true, aviso: 'Precio enviado al cliente: lo verá en su panel para aceptarlo.' };
}
