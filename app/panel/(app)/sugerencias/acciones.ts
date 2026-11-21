'use server';

// Sugerencias y fallos (usuario, 2026-11-21): cualquiera las manda desde Soporte; Dynamo las
// revisa en Gestión interna → Sugerencias. Las reglas (quién manda, quién ve, quién revisa)
// las impone la base de datos (enviar_sugerencia / revisar_sugerencia).
import { revalidatePath } from 'next/cache';
import { mensajeError } from '@/lib/mensajeError';
import { sesion } from '@/lib/sesion';
import { comprobarEntrada } from '@/lib/entradas/comprobar';

type Res<T = Record<never, never>> = ({ ok: true } & T) | { ok: false; error: string };

export async function enviarSugerencia(texto: string, pagina: string, navegador: string): Promise<Res<{ id: string }>> {
  comprobarEntrada("app/panel/(app)/sugerencias/acciones#enviarSugerencia", [texto, pagina, navegador]);
  const s = await sesion();
  if (!s?.perfil || s.perfil.estado !== 'activa') return { ok: false, error: 'Tu sesión ha caducado. Vuelve a entrar.' };
  if (texto.trim().length < 3) return { ok: false, error: 'Escribe la sugerencia o el fallo.' };
  const { data, error } = await s.supabase.rpc('enviar_sugerencia', { p_texto: texto.slice(0, 4000), p_pagina: pagina.slice(0, 300), p_navegador: navegador.slice(0, 300) });
  if (error) return { ok: false, error: mensajeError(error.message) };
  revalidatePath('/panel/sugerencias');
  return { ok: true, id: data as string };
}

export async function revisarSugerencia(id: string, estado: 'activa' | 'desestimada' | 'realizada', nota: string): Promise<Res> {
  comprobarEntrada("app/panel/(app)/sugerencias/acciones#revisarSugerencia", [id, estado, nota]);
  const s = await sesion();
  if (!s?.perfil || s.perfil.estado !== 'activa') return { ok: false, error: 'Tu sesión ha caducado. Vuelve a entrar.' };
  const { error } = await s.supabase.rpc('revisar_sugerencia', { p_sugerencia: id, p_estado: estado, p_nota: nota.slice(0, 2000) });
  if (error) return { ok: false, error: /42501|permiso/i.test(`${error.code} ${error.message}`) ? 'Solo el equipo de Dynamo revisa las sugerencias.' : mensajeError(error.message) };
  revalidatePath('/panel/sugerencias');
  return { ok: true };
}
