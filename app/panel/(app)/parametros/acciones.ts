'use server';

import { sesion } from '@/lib/sesion';

// Cambiar un parámetro de la plataforma (tabla `parametros`). Solo el rol ADMIN: cambian
// cómo funciona todo (precios, plazos, PIN, mantenimiento…). Queda en la auditoría.
export async function guardarParametro(clave: string, valor: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
  const s = await sesion();
  if (!s?.perfil || s.perfil.estado !== 'activa' || s.perfil.rol !== 'admin') return { ok: false, error: 'Solo un administrador cambia los parámetros.' };
  if (valor === undefined) return { ok: false, error: 'Falta el valor.' };
  const { error, count } = await s.supabase.from('parametros').update({ valor }, { count: 'exact' }).eq('clave', clave);
  if (error) return { ok: false, error: /permission|row-level/i.test(error.message) ? 'No tienes permiso para hacer esto.' : error.message };
  if (!count) return { ok: false, error: 'No existe ese parámetro.' };
  return { ok: true };
}

// Lanzar ya la suspensión automática (el proceso diario lo hace solo). Solo el Admin Master.
export async function lanzarAutosuspension(): Promise<{ ok: true; n: number } | { ok: false; error: string }> {
  const s = await sesion();
  if (!s?.perfil || s.perfil.estado !== 'activa' || s.perfil.rol !== 'admin') return { ok: false, error: 'Solo el Admin Master lanza la suspensión automática.' };
  const { data, error } = await s.supabase.rpc('autosuspender_cuentas');
  if (error) return { ok: false, error: /permission|42501/i.test(error.message) ? 'No tienes permiso para hacer esto.' : error.message };
  return { ok: true, n: Number(data ?? 0) };
}
