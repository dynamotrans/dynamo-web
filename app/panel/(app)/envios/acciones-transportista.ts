'use server';

import { mensajeError } from '@/lib/mensajeError';
import { sesion } from '@/lib/sesion';
import { soloTransportista } from '@/lib/guardia';
import { comprobarEntrada } from '@/lib/entradas/comprobar';

// Lo que el TRANSPORTISTA hace con SUS viajes. Todo pasa por funciones de la base de datos
// que comprueban que el viaje es suyo.
type Res = { ok: true; aviso?: string } | { ok: false; error: string };
const limpio = (m: string) => mensajeError(m);
const TEXTO: Record<string, string> = {
  hacia_la_carga: 'Hecho: vas hacia la carga.', cargando: 'Hecho: estás cargando.',
  en_ruta: 'Hecho: cargado y en ruta.', entregado: 'Hecho: envío entregado. Sube el albarán firmado para cobrarlo.',
};

export async function marcarViaje(envio: string, estado: string): Promise<Res> {
  comprobarEntrada("app/panel/(app)/envios/acciones-transportista#marcarViaje", [envio, estado]);
  const s = await soloTransportista();
  if (!s) return { ok: false, error: 'Solo el transportista del envío lo marca.' };
  const { error } = await s.supabase.rpc('marcar_mi_viaje', { p_envio: envio, p_estado: estado });
  return error ? { ok: false, error: limpio(error.message) } : { ok: true, aviso: TEXTO[estado] ?? 'Hecho.' };
}

// El enlace del CMR digital del envío (lo crea si no hay). Lo usan el transportista y el cliente.
export async function enlaceCmrPropio(envio: string): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
  comprobarEntrada("app/panel/(app)/envios/acciones-transportista#enlaceCmrPropio", [envio]);
  const s = await sesion();
  if (!s?.perfil || s.perfil.estado !== 'activa') return { ok: false, error: 'Tu sesión ha caducado. Vuelve a entrar.' };
  const { data, error } = await s.supabase.rpc('mi_enlace_cmr', { p_envio: envio });
  return error || !data ? { ok: false, error: limpio(error?.message ?? 'No se ha podido abrir el CMR.') } : { ok: true, token: data as string };
}
