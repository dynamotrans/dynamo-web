import 'server-only';
import { supabaseServicio } from '@/lib/supabase/servicio';
import { consultasPorApuntar, leerHolded } from '@/lib/servidor/holded';
import { usoDeHolded } from '@/lib/holdedFacturas';

// CONTADOR DE CONSULTAS A LA FACTURACIÓN (usuario, 2026-11-26: «8565/30.000 con barra de
// progreso y fecha de renovación»). Dos cifras:
//   · las que cuenta la plataforma (cada petición que sale por lib/servidor/holded.ts);
//   · la OFICIAL: la facturación dice el gasto del mes de toda la cuenta y el tope del plan
//     («Get API usage»). Si la clave no deja leerlo, queda solo la nuestra.
// SOLO LECTURA de la facturación: aquí solo se escribe en nuestra base de datos.
const REAL_CADA_MS = 60 * 60_000;          // la cifra oficial, como mucho una vez por hora
const REAL_FORZADA_MS = 3 * 60_000;        // con «Actualizar ahora», cada 3 minutos
const REAL_SIN_PERMISO_MS = 24 * 3_600_000; // si la clave no deja leerla, un intento al día

export type UsoFacturacion = { usadas: number; limite: number; oficial: boolean; renueva: string };

/** Apunta en la base de datos las consultas hechas desde la última vez. Nunca rompe a quien llama. */
export async function apuntarConsultas(): Promise<void> {
  const n = consultasPorApuntar();
  if (!n) return;
  try { const sv = supabaseServicio(); if (sv) await sv.rpc('holded_contar', { p_n: n }); }
  catch (e) { console.error('[Holded] contar consultas', e instanceof Error ? e.message : 'fallo'); }
}

/** El gasto del mes según la base de datos (lo último que se sabe). */
export async function usoDelMes(): Promise<UsoFacturacion | null> {
  const sv = supabaseServicio();
  if (!sv) return null;
  const { data } = await sv.rpc('holded_uso_mes');
  const u = data as { usadas?: number; limite?: number; oficial?: boolean; renueva?: string } | null;
  return u ? { usadas: Number(u.usadas ?? 0), limite: Number(u.limite ?? 30000), oficial: u.oficial === true, renueva: String(u.renueva ?? '') } : null;
}

/** Pregunta a la facturación su cifra oficial, si toca (cuesta una consulta). */
export async function refrescarUsoReal(forzar = false): Promise<void> {
  const sv = supabaseServicio();
  if (!sv) return;
  try {
    const { data } = await sv.rpc('holded_uso_mes');
    const u = data as { real?: number | null; real_en?: string | null } | null;
    const hace = u?.real_en ? Date.now() - Date.parse(u.real_en) : Infinity;
    const espera = u?.real == null && u?.real_en ? REAL_SIN_PERMISO_MS : forzar ? REAL_FORZADA_MS : REAL_CADA_MS;
    if (hace < espera) return;
    const r = await leerHolded('/usage/automation_token');
    const d = r.ok ? usoDeHolded(r.datos) : null;
    if (!r.ok) console.error('[Holded] gasto del mes', r.error);
    await sv.rpc('holded_uso_real', { p_periodo: d?.periodo ?? '', p_real: d?.usadas ?? -1, p_limite: d?.limite ?? -1 });
  } catch (e) { console.error('[Holded] gasto del mes', e instanceof Error ? e.message : 'fallo'); }
}
