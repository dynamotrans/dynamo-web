// Duración de la sesión (Parámetros: sesion_recordar_dias y sesion_dias; 0 = sin límite).
// Cuenta desde la última vez que se escribió la contraseña (o se entró con el enlace del
// email): Supabase lo guarda firmado en el token («amr», con la hora de cada forma de
// entrar) y no cambia al renovarse la sesión. Pasado el plazo, el middleware cierra la
// sesión de ese dispositivo y lleva a la entrada.
import type { SupabaseClient } from '@supabase/supabase-js';

type Duracion = { recordar_dias: number; dias: number };
const RECARGA_MS = 5 * 60 * 1000;           // los parámetros se vuelven a leer cada 5 minutos
let enMemoria: { valor: Duracion; leido: number } | null = null;

async function duracion(sb: SupabaseClient): Promise<Duracion | null> {
  if (enMemoria && Date.now() - enMemoria.leido < RECARGA_MS) return enMemoria.valor;
  const { data, error } = await sb.rpc('duracion_sesion');
  if (error || !data) return enMemoria?.valor ?? null;   // sin respuesta: no se echa a nadie
  enMemoria = { valor: data as Duracion, leido: Date.now() };
  return enMemoria.valor;
}

// Segundos (epoch) de la última vez que el usuario se identificó, sacados del token.
function ultimaEntrada(token: string): number | null {
  try {
    const cuerpo = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const datos = JSON.parse(atob(cuerpo + '='.repeat((4 - (cuerpo.length % 4)) % 4)));
    const marcas = (Array.isArray(datos.amr) ? datos.amr : []).map((a: { timestamp?: number }) => Number(a?.timestamp)).filter(Number.isFinite);
    return marcas.length ? Math.max(...marcas) : null;
  } catch {
    return null;
  }
}

// ¿Ha pasado el plazo sin volver a escribir la contraseña?
export async function sesionCaducada(sb: SupabaseClient, recordar: boolean): Promise<boolean> {
  const { data: { session } } = await sb.auth.getSession();
  if (!session?.access_token) return false;
  const desde = ultimaEntrada(session.access_token);
  if (!desde) return false;
  const d = await duracion(sb);
  const dias = d ? Number(recordar ? d.recordar_dias : d.dias) : 0;
  if (!dias || dias <= 0) return false;
  return Date.now() / 1000 - desde > dias * 86400;
}
