import { cortarEnlacesDePago } from '@/lib/servidor/stripeCorte';

// POST /api/stripe/caducar { envio }: «se acabó el plazo para pagar este envío: cierra su
// enlace de pago en Stripe». Lo llaman la ventana de pago cuando se le acaba el tiempo y la
// tarea automática de la base de datos (cada 5 minutos).
// Va SIN contraseña a propósito y no pasa nada: lo que llega aquí no decide nada. El servidor
// le pregunta a la base de datos si a ese envío ya le toca (plazo y margen vencidos) y solo
// entonces actúa; llamar antes de tiempo, o con un envío cualquiera, no hace nada. Tampoco
// cuenta nada a quien llama: contesta siempre lo mismo.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  let envio = '';
  try { envio = String(((await req.json()) as { envio?: unknown } | null)?.envio ?? ''); } catch { /* cuerpo no válido */ }
  if (/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(envio)) {
    try { await cortarEnlacesDePago(envio); } catch (e) { console.error('[Stripe] corte del enlace', e); }
  }
  return new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } });
}
