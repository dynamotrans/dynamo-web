import 'server-only';
import { supabaseServicio } from '@/lib/supabase/servicio';
import { cerrarSesionStripe } from '@/lib/stripe';
import { decisionCorte } from '@/lib/stripeCaducidad';

// CORTE DEL ENLACE DE PAGO AL ACABAR EL PLAZO (usuario, 2026-11-24: «corte duro del enlace de
// Stripe al minuto 65»). La base de datos dice si a este envío ya le toca (plazo y margen
// vencidos, y solo sigue vivo porque espera a un enlace abierto) y qué enlaces tiene. Se le
// ordena a Stripe cerrarlos y, solo si TODOS quedan cerrados, el envío deja de esperar y se
// anula en el momento. Si alguno resulta estar pagado, no se toca nada.
export async function cortarEnlacesDePago(envioId: string): Promise<'anulado' | 'pagado' | 'esperar' | 'nada'> {
  const sv = supabaseServicio();
  if (!sv || !process.env.STRIPE_SECRET_KEY) return 'nada';
  const { data: sesiones, error } = await sv.rpc('pago_sesiones_por_cerrar', { p_envio: envioId });
  if (error) { console.error('[Stripe] corte del enlace', envioId, error.message); return 'nada'; }
  if (!sesiones) return 'nada';   // no toca: en plazo, ya pagado, ya anulado…
  const decision = decisionCorte(await Promise.all(sesiones.map(cerrarSesionStripe)));
  if (decision !== 'anular') return decision;
  const { error: e1 } = await sv.rpc('pago_enlace_cerrado', { p_envio: envioId });
  if (e1) { console.error('[Stripe] dar por cerrado el enlace', envioId, e1.message); return 'esperar'; }
  const { error: e2 } = await sv.rpc('caducar_pagos_pendientes');
  if (e2) console.error('[Stripe] anular tras el corte', envioId, e2.message);   // lo hará la tarea automática
  return 'anulado';
}
