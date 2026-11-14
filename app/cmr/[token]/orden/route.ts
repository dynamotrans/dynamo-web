import { supabasePublico } from '@/lib/supabase/publico';
import { cargarDatosDocPorCmr } from '@/lib/pdf/datos';
import { ordenCompuesta, type QueOrden } from '@/lib/pdf/orden';

// ORDEN DE CARGA por el enlace público del envío (usuario, 2026-11-10): el enlace que
// Dynamo comparte con el transportista por email o WhatsApp desde la ficha. La llave es
// el token del CMR del envío (cmr_enlaces, como /cmr/<token>/pdf). La variante va en
// ?copia= (conjunta | operativa | economica) y, para las que llevan el precio, hace
// falta además ?clave= (el id del transportista asignado: solo lo tiene quien recibió
// el enlace de Dynamo; la operativa no lleva economía y no la necesita).
// Con la CLAVE PÚBLICA y la función datos_orden_por_cmr (2026-11-11): la clave de
// servicio no está en todos los despliegues (la preview) y aquí no hace falta — la
// base de datos valida el token y aplica las reglas (ni revocados, ni cancelados, ni
// manuales, ni envíos sin transportista).
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const texto = (msg: string, status: number) => new Response(msg, { status, headers: { 'content-type': 'text/plain; charset=utf-8' } });

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(token)) return texto('Ese documento no existe.', 404);
  const sb = supabasePublico();
  if (!sb) return texto('La plataforma no está conectada.', 503);
  const { data: mant } = await sb.rpc('mantenimiento_activo');
  if (mant) return texto('Plataforma en mantenimiento. Vuelve a intentarlo en un rato.', 503);

  const url = new URL(req.url);
  // UNA sola orden (usuario, 2026-11-14): el documento completo («economica») es el que
  // se comparte. «conjunta» de los enlaces viejos pasa a ser lo mismo; «operativa» (la
  // copia del conductor, sin precios) sigue funcionando para los enlaces ya enviados.
  let copia = url.searchParams.get('copia') ?? 'economica';
  if (copia === 'conjunta') copia = 'economica';
  if (!['operativa', 'economica', 'cliente'].includes(copia)) return texto('Esa variante no existe.', 404);

  // La clave viaja en el enlace y la valida la BD (2026-11-14): con la del transportista
  // el JSON trae su importe (rol transportista); con la del cliente, el suyo con IVA
  // (rol cliente). Sin la clave buena no llega ninguna economía.
  const clave = url.searchParams.get('clave');
  const r = await cargarDatosDocPorCmr(sb, token, clave && /^[0-9a-f-]{36}$/i.test(clave) ? clave : null);
  if (!r.datos) return texto(r.error ?? 'Este enlace no es válido: ha caducado o se ha retirado.', 404);
  if (copia === 'economica' && r.rol !== 'transportista') {
    return texto('Esta variante lleva información económica: hace falta el enlace completo que te mandó Dynamo.', 403);
  }
  if (copia === 'cliente' && r.rol !== 'cliente') {
    return texto('Esta copia lleva el precio del cliente: hace falta el enlace completo que te mandó Dynamo.', 403);
  }
  // El QR del e-CMR/DeCA en la tarjeta de la orden (2026-11-11): esta ruta ABRE por el
  // propio enlace del CMR, así que el deca siempre se puede montar — sin él, la orden
  // salía con el hueco «Pendiente de asignar transporte» aunque hubiera matrículas.
  r.datos.deca = { url: `${url.origin}/cmr/${token}`, creado_en: new Date().toISOString() };

  const p = r.parametros;
  const bytes = await ordenCompuesta(r.datos, { pct: p.pronto_pago_pct ?? 3, minimo: p.pronto_pago_minimo ?? 20,
    dias: p.pronto_pago_dias ?? 5, plazo: p.plazo_pago_transportista_dias ?? 60 }, copia as QueOrden);
  const ref = String(r.datos.envio.referencia_gx ?? 'envio').replace(/[^A-Za-z0-9-]/g, '');
  const apellido = copia === 'operativa' ? '-conductor' : copia === 'cliente' ? '-cliente' : copia === 'economica' ? '-administracion' : '';
  return new Response(Buffer.from(bytes), {
    headers: { 'content-type': 'application/pdf', 'content-disposition': `inline; filename="Orden-de-carga-${ref}${apellido}.pdf"`, 'cache-control': 'private, no-store' },
  });
}
