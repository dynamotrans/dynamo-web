import { supabaseServidor } from '@/lib/supabase/server';
import { crearPagoStripe, stripeListo } from '@/lib/stripe';

// POST /api/stripe/pago (formulario «Pagar con tarjeta» de la ficha del envío): crea la
// página de pago de Stripe con el TOTAL que dice la base de datos (nunca el del navegador)
// y manda allí al cliente. Solo el cliente dueño (o Dynamo) y solo si está pendiente.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const origen = new URL(req.url).origin;
  const datos = await req.formData();
  const id = String(datos.get('envio') ?? '');
  const volver = (q: string) => Response.redirect(`${origen}/panel/envios?ver=${encodeURIComponent(id)}${q}`, 303);
  if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.redirect(`${origen}/panel/envios`, 303);
  if (!stripeListo()) return volver('&pago=no_disponible');
  const sb = await supabaseServidor();
  if (!sb) return volver('&pago=error');
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return Response.redirect(`${origen}/panel/entrar`, 303);
  const { data: p } = await sb.rpc('pagos_envio', { p_envio: id }).maybeSingle<any>();
  if (!p || p.pago_previo !== 'pendiente' || p.estado !== 'programado') return volver('');
  // Pasado el plazo para pagar ya no se abre el pago (el envío se anula en unos minutos).
  if (p.pago_limite && Date.parse(p.pago_limite) <= Date.now()) return volver('&pago=caducado');
  const centimos = Math.round(Number(p.total) * 100);
  if (!(centimos > 0)) return volver('&pago=error');
  try {
    const url = await crearPagoStripe({ envioId: id, referencia: p.referencia_gx, centimos, email: user.email ?? null,
      vuelta: `${origen}/panel/envios?ver=${id}`, expiraEn: p.pago_limite ? new Date(p.pago_limite) : null, descripcion: p.referencia_cliente ? `Tu referencia: ${p.referencia_cliente}` : '' });
    return Response.redirect(url, 303);
  } catch (e) {
    console.error('[Stripe] crear pago', e);
    return volver('&pago=error');
  }
}
