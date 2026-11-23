import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';

// Stripe sin librería: dos llamadas (crear la página de pago y comprobar la firma del
// aviso). Claves SOLO en Vercel: STRIPE_SECRET_KEY y STRIPE_WEBHOOK_SECRET (nunca en el
// chat ni con NEXT_PUBLIC_). Sin ellas, el pago con tarjeta no aparece.
export const stripeListo = () => !!process.env.STRIPE_SECRET_KEY && !!process.env.STRIPE_WEBHOOK_SECRET && !!process.env.SUPABASE_SERVICE_ROLE_KEY;

/** Crea una sesión de Stripe Checkout y devuelve su URL. */
export async function crearPagoStripe(p: { envioId: string; referencia: string; centimos: number; email: string | null; vuelta: string; descripcion: string; expiraEn?: Date | null }): Promise<string> {
  const f = new URLSearchParams({
    mode: 'payment', locale: 'es', client_reference_id: p.envioId,
    success_url: `${p.vuelta}&pago=ok`, cancel_url: `${p.vuelta}&pago=cancelado`,
    'line_items[0][quantity]': '1',
    'line_items[0][price_data][currency]': 'eur',
    'line_items[0][price_data][unit_amount]': String(p.centimos),
    'line_items[0][price_data][product_data][name]': `Transporte ${p.referencia} (IVA incluido)`,
    'line_items[0][price_data][product_data][description]': p.descripcion.slice(0, 300) || `Envío ${p.referencia}`,
    'metadata[envio_id]': p.envioId, 'payment_intent_data[metadata][envio_id]': p.envioId,
    'payment_intent_data[description]': `Dynamo · envío ${p.referencia}`,
  });
  if (p.email) f.set('customer_email', p.email);
  // La página de pago caduca con el plazo para pagar (Stripe admite entre 30 min y 24 h).
  // Los topes se calculan desde el inicio de la tanda de 10 min de la clave de idempotencia:
  // dos clics seguidos mandan exactamente lo mismo (si no, Stripe rechaza el segundo).
  const tanda = Math.floor(Date.now() / 600000) * 600000;
  if (p.expiraEn) {
    const t = Math.min(Math.max(p.expiraEn.getTime(), tanda + 41 * 60000), tanda + 23.5 * 3600000);
    f.set('expires_at', String(Math.floor(t / 1000)));
  }
  const r = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST', body: f,
    headers: { authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`, 'content-type': 'application/x-www-form-urlencoded',
      // Mismo envío e importe en 10 minutos → la misma sesión (dos clics no crean dos pagos).
      'idempotency-key': `envio-${p.envioId}-${p.centimos}-${tanda / 600000}` },
  });
  const j = await r.json();
  if (!r.ok || !j.url) throw new Error(j?.error?.message ?? 'Stripe no ha devuelto la página de pago.');
  return j.url as string;
}

/** Comprueba la firma del aviso de Stripe (cabecera Stripe-Signature) y devuelve el evento. */
// Lo que se usa del evento de Stripe (checkout.session.*).
export type SesionPagoStripe = { id?: string; payment_status?: string; metadata?: { envio_id?: string } | null;
  client_reference_id?: string | null; payment_intent?: string | null; amount_total?: number | null };
export type EventoStripe = { type: string; data?: { object?: SesionPagoStripe } };
export function eventoStripe(cuerpo: string, firma: string | null, toleranciaSeg = 300): EventoStripe | null {
  const secreto = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secreto || !firma) return null;
  const partes = firma.split(',').map((x) => x.split('=') as [string, string]);
  const t = partes.find(([k]) => k === 't')?.[1];
  const v1 = partes.filter(([k]) => k === 'v1').map(([, v]) => v);
  if (!t || !v1.length || Math.abs(Date.now() / 1000 - Number(t)) > toleranciaSeg) return null;
  const esperada = createHmac('sha256', secreto).update(`${t}.${cuerpo}`).digest();
  const vale = v1.some((v) => { const b = Buffer.from(v, 'hex'); return b.length === esperada.length && timingSafeEqual(b, esperada); });
  if (!vale) return null;
  try { return JSON.parse(cuerpo); } catch { return null; }
}

// ---- Devoluciones (usuario, 2026-11-23: «devolver importe» desde la plataforma) -----------
// Lo cobrado y lo ya devuelto de un pago, en céntimos, según Stripe (él manda: es su dinero).
export async function pagoStripe(ref: string): Promise<{ ok: true; cobrado: number; devuelto: number } | { ok: false; error: string }> {
  if (!process.env.STRIPE_SECRET_KEY) return { ok: false, error: 'El pago con tarjeta no está conectado en este entorno.' };
  if (!/^pi_[A-Za-z0-9_]+$/.test(ref)) return { ok: false, error: 'Este pago no tiene una referencia de Stripe que se pueda devolver desde aquí.' };
  try {
    const r = await fetch(`https://api.stripe.com/v1/payment_intents/${ref}?expand[]=latest_charge`, {
      headers: { authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` }, cache: 'no-store' });
    const j = await r.json();
    if (!r.ok) return { ok: false, error: j?.error?.message ?? 'Stripe no ha devuelto los datos del pago.' };
    const cargo = j.latest_charge && typeof j.latest_charge === 'object' ? j.latest_charge as { amount_refunded?: number } : null;
    return { ok: true, cobrado: Number(j.amount_received ?? 0), devuelto: Number(cargo?.amount_refunded ?? 0) };
  } catch { return { ok: false, error: 'No se ha podido hablar con Stripe. Prueba otra vez en un momento.' }; }
}

/** Pide a Stripe la devolución. `clave` (el id de nuestra devolución) evita repetirla: dos
    llamadas con la misma clave son una sola devolución. `dudoso`: no se sabe si se hizo. */
export async function devolverStripe(p: { ref: string; centimos: number; clave: string; envioId: string }):
  Promise<{ ok: true; id: string } | { ok: false; error: string; dudoso?: boolean }> {
  try {
    const f = new URLSearchParams({ payment_intent: p.ref, amount: String(p.centimos), reason: 'requested_by_customer',
      'metadata[envio_id]': p.envioId, 'metadata[devolucion_id]': p.clave });
    const r = await fetch('https://api.stripe.com/v1/refunds', {
      method: 'POST', body: f,
      headers: { authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`, 'content-type': 'application/x-www-form-urlencoded',
        'idempotency-key': `devolucion-${p.clave}` },
    });
    const j = await r.json().catch(() => null) as { id?: string; status?: string; error?: { message?: string } } | null;
    if (r.ok && j?.id && j.status !== 'failed' && j.status !== 'canceled') return { ok: true, id: j.id };
    // 5xx: Stripe puede haberla hecho o no; con la misma clave, reintentar no la duplica.
    if (r.status >= 500 || !j) return { ok: false, dudoso: true, error: 'Stripe no ha contestado bien.' };
    return { ok: false, error: j?.error?.message ?? 'Stripe no ha aceptado la devolución.' };
  } catch { return { ok: false, dudoso: true, error: 'Se ha cortado la conexión con Stripe.' }; }
}
