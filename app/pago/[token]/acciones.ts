'use server';

import { supabasePublico } from '@/lib/supabase/publico';
import { comprobarEntrada } from '@/lib/entradas/comprobar';

type Res = { ok: true; aviso: string } | { ok: false; error: string };

// «Ya he hecho la transferencia» desde la página pública de pago: para el plazo del envío y
// avisa a Dynamo, que la valida en el banco. Solo hace falta la llave del enlace.
export async function avisarTransferenciaPublica(token: string): Promise<Res> {
  comprobarEntrada("app/pago/[token]/acciones#avisarTransferenciaPublica", [token]);
  if (!/^[0-9a-f-]{36}$/i.test(token)) return { ok: false, error: 'Este enlace de pago no es válido.' };
  const sb = supabasePublico();
  if (!sb) return { ok: false, error: 'No se ha podido conectar. Prueba otra vez en un momento.' };
  const { data, error } = await sb.rpc('pago_publico_avisar', { p_token: token });
  if (error) return { ok: false, error: 'No se ha podido registrar el aviso. Prueba otra vez en un momento.' };
  const r = (data as { resultado?: string } | null)?.resultado;
  if (r === 'ok') return { ok: true, aviso: 'Aviso recibido: estamos validando la transferencia. El plazo para pagar queda parado.' };
  if (r === 'ya_avisado') return { ok: true, aviso: 'La transferencia ya estaba avisada: la estamos validando.' };
  if (r === 'precio_provisional') return { ok: false, error: 'El precio de este envío todavía es provisional: aún no se puede pagar.' };
  return { ok: false, error: 'Este envío ya no está pendiente de pago.' };
}
