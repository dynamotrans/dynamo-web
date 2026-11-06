'use server';

import { mensajeError } from '@/lib/mensajeError';
import { revalidatePath } from 'next/cache';
import { sesion } from '@/lib/sesion';
import { comprobarEntrada } from '@/lib/entradas/comprobar';

// Bultos, embalaje y volumen (casillas 7, 8 y 12 del CMR). Los límites (quién y hasta
// cuándo) los pone la base de datos: poner_datos_cmr().
export type DatosCmr = { num_bultos: number | null; embalaje: string | null; volumen_m3: number | null; firmado: boolean };

export async function leerDatosCmr(envioId: string): Promise<DatosCmr | null> {
  comprobarEntrada("app/panel/(app)/envios/acciones-cmr#leerDatosCmr", [envioId]);
  const s = await sesion();
  if (!s?.perfil || s.perfil.estado !== 'activa') return null;
  const { data } = await s.supabase.rpc('datos_cmr_envio', { p_envio: envioId });
  return (data as DatosCmr) ?? null;
}

export async function guardarDatosCmr(envioId: string, bultos: string, embalaje: string, volumen: string): Promise<{ error: string | null }> {
  comprobarEntrada("app/panel/(app)/envios/acciones-cmr#guardarDatosCmr", [envioId, bultos, embalaje, volumen]);
  const s = await sesion();
  if (!s?.perfil || s.perfil.estado !== 'activa') return { error: 'Tu sesión ha caducado o tu cuenta no está activa.' };
  const b = bultos.trim() ? Number(bultos.replace(/\D/g, '')) : null;
  const v = volumen.trim() ? Number(volumen.replace(',', '.')) : null;
  if (b != null && (!Number.isInteger(b) || b < 1 || b > 99999)) return { error: 'El número de bultos tiene que ser un número entero (1 o más).' };
  if (v != null && (!Number.isFinite(v) || v <= 0 || v > 500)) return { error: 'El volumen tiene que estar entre 0 y 500 m³.' };
  const { error } = await s.supabase.rpc('poner_datos_cmr', { p_envio: envioId, p_bultos: b, p_embalaje: embalaje.slice(0, 60), p_volumen: v });
  if (error) return { error: mensajeError(error.message) };
  revalidatePath('/panel/envios');
  return { error: null };
}
