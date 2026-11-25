import { supabasePublico } from '@/lib/supabase/publico';
import { supabaseServicio } from '@/lib/supabase/servicio';
import { clavePublicaStripe, crearPagoEnVentana, crearPagoStripe, stripeListo } from '@/lib/stripe';
import { caducidadEnlace } from '@/lib/stripeCaducidad';

// POST /api/pago/tarjeta: «Pagar con tarjeta» de la PÁGINA PÚBLICA de pago (/pago/<llave>;
// usuario, 2026-11-25). Lo mismo que /api/stripe/pago, pero quien llama no tiene sesión: lo
// único que vale es la llave del enlace. El importe lo pone la base de datos (lo que falta por
// pagar), nunca el navegador. Dos formas, como la otra: modo=incrustado (la ventana de pago
// dentro de la página) o formulario (lleva a la página de pago de Stripe, el respaldo).
// Límite: por cada envío no se abren más de 20 pagos (los que se apuntan para poder cerrarlos).
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TOPE_SESIONES = 20;

export async function POST(req: Request) {
  const origen = new URL(req.url).origin;
  const datos = await req.formData();
  const token = String(datos.get('token') ?? '');
  const enVentana = datos.get('modo') === 'incrustado';
  const valido = /^[0-9a-f-]{36}$/i.test(token);
  const no = (codigo: string, estado = 409) => enVentana
    ? Response.json({ ok: false, codigo }, { status: estado, headers: { 'cache-control': 'no-store' } })
    : Response.redirect(valido ? `${origen}/pago/${token}${codigo === 'ya' ? '' : `?pago=${codigo}`}` : `${origen}/panel/entrar`, 303);
  if (!valido) return no('error', 400);
  if (!stripeListo()) return no('no_disponible');
  const clave = enVentana ? clavePublicaStripe() : null;
  if (enVentana && !clave) return no('sin_ventana');
  const sb = supabasePublico();
  const sv = supabaseServicio();
  if (!sb || !sv) return no('no_disponible');
  const { data } = await sb.rpc('pago_publico', { p_token: token });
  const p = data as { resultado?: string; referencia?: string; pendiente?: number; pago_limite?: string | null; avisado_en?: string | null } | null;
  if (!p || p.resultado !== 'pendiente' || p.avisado_en) return no('ya');
  if (p.pago_limite && Date.parse(p.pago_limite) <= Date.now()) return no('caducado');
  const centimos = Math.round(Number(p.pendiente) * 100);
  if (!(centimos > 0) || !p.referencia) return no('error');
  // El envío de esa llave (con la clave del servidor: la llave no da acceso a la tabla).
  const { data: e } = await sv.from('envios').select('id, stripe_sesiones').eq('pago_token', token).maybeSingle();
  if (!e) return no('error');
  if ((e.stripe_sesiones ?? []).length >= TOPE_SESIONES) return no('no_disponible', 429);
  // El enlace de pago y el envío van a la par (igual que en la ficha): el enlace vive hasta el
  // final del plazo más el margen y antes de abrirlo se apunta esa hora en el envío.
  const ahora = Date.now();
  const limite = p.pago_limite ? new Date(p.pago_limite) : null;
  const { data: g } = await sv.from('parametros').select('valor').eq('clave', 'pago_previo_gracia_minutos').maybeSingle();
  const graciaMin = Number.isFinite(Number(g?.valor)) && Number(g?.valor) >= 0 ? Number(g?.valor) : 5;
  const { caduca } = caducidadEnlace(limite, ahora, graciaMin);
  if (caduca) {
    const { error } = await sv.rpc('pago_enlace_stripe', { p_envio: e.id, p_caduca: new Date(caduca).toISOString() });
    if (error) console.error('[Stripe] apuntar la caducidad del enlace (página pública)', e.id, error.message);
  }
  const pago = { envioId: e.id, referencia: p.referencia, centimos, email: null,
    vuelta: `${origen}/pago/${token}?v=1`, expiraEn: limite, graciaMin, ahora, descripcion: '' };
  try {
    const apuntar = async (sesion: string | null) => {
      if (!sesion) return;
      const { error } = await sv.rpc('pago_sesion_stripe', { p_envio: e.id, p_sesion: sesion });
      if (error) console.error('[Stripe] apuntar el enlace de pago (página pública)', e.id, error.message);
    };
    if (enVentana) {
      const { secreto, sesion } = await crearPagoEnVentana(pago);
      await apuntar(sesion);
      const quedan = limite ? Math.max(0, limite.getTime() + graciaMin * 60_000 - Date.now()) : null;
      return Response.json({ ok: true, secreto, clave, quedan, envio: e.id }, { headers: { 'cache-control': 'no-store' } });
    }
    const { url, sesion } = await crearPagoStripe(pago);
    await apuntar(sesion);
    return Response.redirect(url, 303);
  } catch (err) {
    console.error('[Stripe] crear pago (página pública)', err);
    return no('error', 502);
  }
}
