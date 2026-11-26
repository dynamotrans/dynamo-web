'use server';

// BAJA DE UN COMPAÑERO (usuario, 2026-11-26): un usuario no borra a otro; pide su baja, la
// cuenta queda sin acceso al momento y Dynamo decide. Las reglas están en la base de datos.
import { sesion, esDynamo } from '@/lib/sesion';
import { mensajeError } from '@/lib/mensajeError';
import { comprobarEntrada } from '@/lib/entradas/comprobar';
import { comprobarMiClave } from '@/lib/servidor/miClave';

type Res = { ok: true } | { ok: false; error: string };
const limpia = (m: string) => mensajeError(m.replace(/^.*?ERROR:\s*/i, ''));
export type Companero = { id: string; nombre: string | null; email: string | null; estado: string; soy_yo: boolean; baja_pendiente: boolean };

export async function misCompaneros(): Promise<Companero[]> {
  comprobarEntrada("app/panel/(app)/equipo/acciones#misCompaneros", []);
  const s = await sesion();
  if (!s?.perfil) return [];
  const { data } = await s.supabase.rpc('mis_companeros');
  return (data ?? []) as Companero[];
}

export async function pedirBajaCompanero(usuario: string, motivo: string, clave: string): Promise<Res> {
  comprobarEntrada("app/panel/(app)/equipo/acciones#pedirBajaCompanero", [usuario, motivo, clave]);
  const s = await sesion();
  if (!s?.perfil) return { ok: false, error: 'Tu sesión ha caducado. Vuelve a entrar.' };
  if (motivo.trim().length < 5) return { ok: false, error: 'Escribe el motivo (p. ej. «ya no trabaja con nosotros»).' };
  const mal = await comprobarMiClave(s.supabase, clave);
  if (mal) return { ok: false, error: mal };
  const { data, error } = await s.supabase.rpc('solicitar_baja_companero', { p_usuario: usuario, p_motivo: motivo.trim() });
  if (error) return { ok: false, error: limpia(error.message) };
  const txt: Record<string, string> = { eres_tu: 'Para darte de baja tú, usa «Darme de baja» en Mi cuenta.', ya_pedida: 'Su baja ya está pedida: la está revisando Dynamo.', no_activa: 'Esa cuenta ya no está activa.' };
  return data === 'ok' ? { ok: true } : { ok: false, error: txt[String(data)] ?? 'No se ha podido pedir la baja.' };
}

export async function resolverBaja(solicitud: string, decision: 'baja' | 'rehabilitar', nota: string, clave: string): Promise<Res> {
  comprobarEntrada("app/panel/(app)/equipo/acciones#resolverBaja", [solicitud, decision, nota, clave]);
  const s = await sesion();
  if (!s?.perfil || !esDynamo(s.perfil.rol)) return { ok: false, error: 'Solo el equipo de Dynamo.' };
  if (nota.trim().length < 5) return { ok: false, error: 'Escribe qué has comprobado (llamada, email…).' };
  const mal = await comprobarMiClave(s.supabase, clave);
  if (mal) return { ok: false, error: mal };
  const { data, error } = await s.supabase.rpc('resolver_baja', { p_solicitud: solicitud, p_decision: decision, p_nota: nota.trim() });
  if (error) return { ok: false, error: limpia(error.message) };
  return data === 'ok' ? { ok: true } : { ok: false, error: 'Esa baja ya estaba resuelta.' };
}
