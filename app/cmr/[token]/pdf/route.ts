import { supabaseServicio } from '@/lib/supabase/servicio';
import { pdfDeEnvioDynamo } from '@/lib/pdf/generar';

// PDF del e-CMR / DeCA por el ENLACE PÚBLICO del CMR digital (usuario, 2026-11-10):
// quien tiene el enlace de firma (o escanea el QR del impreso) puede abrir el documento
// relleno sin cuenta — es la verificación en línea que promete el propio PDF. La llave es
// el token (igual que cmr_publico): se comprueba contra cmr_enlaces y, con enlace vivo,
// se genera el mismo CMR que ve Dynamo, al momento y sin guardar nada.
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
  const { data: env } = await sv.from('envios').select('estado').eq('id', enl.envio_id).maybeSingle<{ estado: string }>();
  if (!env || env.estado === 'cancelado') return texto('Este envío está cancelado: ya no hace falta su CMR.', 404);

  // El gestor no sale en el CMR (solo en la orden de carga): id nulo a propósito.
  const r = await pdfDeEnvioDynamo(sv, enl.envio_id, 'cmr', '00000000-0000-0000-0000-000000000000', new URL(req.url).origin);
  if ('error' in r) return texto(r.error, 404);
  return new Response(Buffer.from(r.bytes), {
    headers: { 'content-type': 'application/pdf', 'content-disposition': `inline; filename="${r.nombre}"`, 'cache-control': 'private, no-store' },
  });
}
