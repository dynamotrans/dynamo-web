import { eventoStripe, type SesionPagoStripe } from '@/lib/stripe';
import { supabaseServicio } from '@/lib/supabase/servicio';

// POST /api/stripe/webhook: Stripe avisa de que un pago se ha completado. Solo se fía de
// avisos FIRMADOS con STRIPE_WEBHOOK_SECRET; la base de datos comprueba además que el
// importe cobrado es exactamente el total del envío (pago_envio_stripe).
// En Stripe → Developers → Webhooks: esta URL, eventos checkout.session.completed y
// checkout.session.async_payment_succeeded.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const cuerpo = await req.text();
  const ev = eventoStripe(cuerpo, req.headers.get('stripe-signature'));
  if (!ev) return new Response('firma no válida', { status: 400 });
  if (ev.type !== 'checkout.session.completed' && ev.type !== 'checkout.session.async_payment_succeeded') return new Response('ignorado', { status: 200 });
  const s: SesionPagoStripe = ev.data?.object ?? {};
  if (s.payment_status !== 'paid') return new Response('aún sin pagar', { status: 200 });
  const envio = s.metadata?.envio_id ?? s.client_reference_id;
  const sb = supabaseServicio();
  if (!envio || !sb) return new Response('sin envío o sin conexión', { status: 500 });
  const { data, error } = await sb.rpc('pago_envio_stripe', { p_envio: envio, p_pago: String(s.payment_intent ?? s.id), p_centimos: Number(s.amount_total) });
  if (error) { console.error('[Stripe] registrar pago', envio, error.message); return new Response('error', { status: 500 }); }
  const r = (data as { resultado: string }).resultado;
  if (r !== 'ok' && r !== 'ya_registrado') console.error('[Stripe] pago NO aplicado', envio, data);   // p. ej. importe distinto: revisar a mano
  return new Response('ok', { status: 200 });
}
