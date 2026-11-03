'use server';

import { sesion, esDynamo } from '@/lib/sesion';

export type ParadaNueva = {
  tipo: 'carga' | 'descarga';
  lugar_id?: string | null;
  nombre_empresa?: string; direccion?: string; codigo_postal?: string; poblacion?: string;
  provincia?: string; pais_codigo_iso?: string; tipo_lugar?: string; horarios?: string;
  guardar_en_agenda?: boolean;
  referencia?: string; anotaciones?: string;
};
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
  const fila = (Array.isArray(data) ? data[0] : data) as { referencia_gx: string } | undefined;
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
  return error ? { ok: false, error: traducir(error.message) } : { ok: true };
}
