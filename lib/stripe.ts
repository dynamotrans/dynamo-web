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
export function eventoStripe(cuerpo: string, firma: string | null, toleranciaSeg = 300): any | null {
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
