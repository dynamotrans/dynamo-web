import { supabaseServidor } from '@/lib/supabase/server';
import { clavePublicaStripe, crearPagoEnVentana, crearPagoStripe, stripeListo } from '@/lib/stripe';

// POST /api/stripe/pago («Pagar con tarjeta» de la ficha del envío): prepara el pago en
// Stripe con LO QUE FALTA POR PAGAR según la base de datos (nunca el del navegador): el
// total, o solo la diferencia si ya pagó y el precio subió al modificarlo. Solo el cliente
// dueño (o Dynamo) y solo si está pendiente. Dos formas:
//  · modo=incrustado → responde en JSON con lo necesario para pintar el pago en una VENTANA
//    de la plataforma (usuario, 2026-11-23: «la ventana de pago me saca de la plataforma»).
//    Si falta la clave pública de Stripe, dice «sin_ventana» y el navegador usa la otra.
//  · sin modo (formulario) → manda al cliente a la página de pago de Stripe (el respaldo).
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const origen = new URL(req.url).origin;
  const datos = await req.formData();
  const id = String(datos.get('envio') ?? '');
  const enVentana = datos.get('modo') === 'incrustado';
  const idValido = /^[0-9a-f-]{36}$/i.test(id);
  // Cómo se contesta cuando no se puede: en JSON (ventana) o volviendo a la ficha (formulario).
  const no = (codigo: string, estado = 409) => enVentana
    ? Response.json({ ok: false, codigo }, { status: estado, headers: { 'cache-control': 'no-store' } })
    : Response.redirect(!idValido ? `${origen}/panel/envios` : codigo === 'sesion' ? `${origen}/panel/entrar`
      : `${origen}/panel/envios?ver=${encodeURIComponent(id)}${codigo === 'ya' ? '' : `&pago=${codigo}`}`, 303);
  if (!idValido) return no('error', 400);
  if (!stripeListo()) return no('no_disponible');
  const clave = enVentana ? clavePublicaStripe() : null;
  if (enVentana && !clave) return no('sin_ventana');
  const sb = await supabaseServidor();
  if (!sb) return no('error', 500);
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return no('sesion', 401);
  const { data: p } = await sb.rpc('pagos_envio', { p_envio: id }).maybeSingle();
  if (!p || p.estado_pago_previo !== 'pendiente' || p.estado !== 'programado' || p.precio_provisional) return no('ya');
  // Pasado el plazo para pagar ya no se abre el pago (el envío se anula en unos minutos).
  if (p.pago_limite && Date.parse(p.pago_limite) <= Date.now()) return no('caducado');
  const centimos = Math.round(Number(p.pendiente) * 100);
  if (!(centimos > 0)) return no('error');
  const pago = { envioId: id, referencia: p.referencia_gx, centimos, email: user.email ?? null,
    vuelta: `${origen}/panel/envios?ver=${id}`, expiraEn: p.pago_limite ? new Date(p.pago_limite) : null,
    descripcion: p.referencia_cliente ? `Tu referencia: ${p.referencia_cliente}` : '' };
  try {
    if (enVentana) {
      const secreto = await crearPagoEnVentana(pago);
      return Response.json({ ok: true, secreto, clave }, { headers: { 'cache-control': 'no-store' } });
    }
    return Response.redirect(await crearPagoStripe(pago), 303);
  } catch (e) {
    console.error('[Stripe] crear pago', e);
    return no('error', 502);
  }
}
