import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

// ¿La sesión viene de canjear hace poco un enlace del email (invitación o «he olvidado mi
// contraseña»)? Solo entonces se puede poner contraseña SIN dar la actual. Si se entró con
// contraseña, para cambiarla se usa «Mi cuenta», que pide la actual (una sesión abierta en
// un ordenador ajeno no basta para quedarse con la cuenta).
// Lo dice el `amr` del token (método y hora de la última forma de entrar), verificado.
const MINUTOS = 30;
export async function vieneDeEnlace(sb: SupabaseClient): Promise<boolean> {
  const { data, error } = await sb.auth.getClaims();
  if (error || !data?.claims) return false;
  const amr = (data.claims as any).amr as { method?: string; timestamp?: number }[] | undefined;
  if (!Array.isArray(amr) || !amr.length) return false;
  const ultimo = [...amr].sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0))[0];
  if (!ultimo?.method || ultimo.method === 'password') return false;
  return Date.now() - (ultimo.timestamp ?? 0) * 1000 < MINUTOS * 60 * 1000;
}
