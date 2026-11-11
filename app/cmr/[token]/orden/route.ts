import { supabaseServicio } from '@/lib/supabase/servicio';
import { pdfOrdenCompuesta } from '@/lib/pdf/generar';
import type { QueOrden } from '@/lib/pdf/orden';

// ORDEN DE CARGA por el enlace público del envío (usuario, 2026-11-10): el enlace que
// Dynamo comparte con el transportista por email o WhatsApp desde la ficha. La llave es
// el token del CMR del envío (cmr_enlaces, como /cmr/<token>/pdf). La variante va en
// ?copia= (conjunta | operativa | economica) y, para las que llevan el precio, hace
// falta además ?clave= (el id del transportista asignado: solo lo tiene quien recibió
// el enlace de Dynamo; la operativa no lleva economía y no la necesita).
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const texto = (msg: string, status: number) => new Response(msg, { status, headers: { 'content-type': 'text/plain; charset=utf-8' } });

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(token)) return texto('Ese documento no existe.', 404);
  const sv = supabaseServicio();
  if (!sv) return texto('La plataforma no está conectada.', 503);
  const { data: mant } = await sv.rpc('mantenimiento_activo');
  if (mant) return texto('Plataforma en mantenimiento. Vuelve a intentarlo en un rato.', 503);
  const { data: enl } = await sv.from('cmr_enlaces').select('envio_id').eq('token', token).eq('revocado', false).maybeSingle<{ envio_id: string }>();
  if (!enl) return texto('Este enlace no es válido: ha caducado o se ha retirado.', 404);
  const { data: env } = await sv.from('envios').select('estado, es_manual, transportista_id').eq('id', enl.envio_id)
    .maybeSingle<{ estado: string; es_manual: boolean; transportista_id: string | null }>();
  if (!env || env.estado === 'cancelado') return texto('Este envío está cancelado: ya no hace falta su orden.', 404);
  if (env.es_manual) return texto('Los envíos manuales no tienen orden de Dynamo.', 404);
  if (!env.transportista_id) return texto('Este envío aún no tiene transportista asignado.', 404);

  const url = new URL(req.url);
  const copia = url.searchParams.get('copia') ?? 'conjunta';
  if (!['conjunta', 'operativa', 'economica'].includes(copia)) return texto('Esa variante no existe.', 404);
  if (copia !== 'operativa' && url.searchParams.get('clave') !== env.transportista_id) {
    return texto('Esta variante lleva información económica: hace falta el enlace completo que te mandó Dynamo.', 403);
  }

  const r = await pdfOrdenCompuesta(sv, enl.envio_id, copia as QueOrden);
  if ('error' in r) return texto(r.error, 404);
  return new Response(Buffer.from(r.bytes), {
    headers: { 'content-type': 'application/pdf', 'content-disposition': `inline; filename="${r.nombre}"`, 'cache-control': 'private, no-store' },
  });
}
