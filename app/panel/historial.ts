'use server';

// Historial de un registro (quién hizo qué y cuándo). Los permisos y lo que ve cada uno
// los decide la base de datos (historial_registro).
import { sesion } from '@/lib/sesion';

export type EntradaHistorial = { cuando: string; accion: 'alta' | 'modificacion' | 'baja'; campos: string[]; cambios: Record<string, { antes: unknown; despues: unknown }> | null;
  quien_nombre: string; quien_email: string | null; quien_tipo: string };

export async function historialDe(tabla: 'envios' | 'incidencias' | 'almacenamientos' | 'lugares' | 'operadores', id: string): Promise<{ ok: true; filas: EntradaHistorial[] } | { ok: false; error: string }> {
  const s = await sesion();
  if (!s?.perfil || s.perfil.estado !== 'activa') return { ok: false, error: 'Tu cuenta no está activa.' };
  const { data, error } = await s.supabase.rpc('historial_registro', { p_tabla: tabla, p_id: id });
  if (error) return { ok: false, error: 'No se ha podido cargar el historial.' };
  return { ok: true, filas: (data ?? []) as EntradaHistorial[] };
}
