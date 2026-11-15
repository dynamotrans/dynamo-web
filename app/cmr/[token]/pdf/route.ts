import { supabasePublico } from '@/lib/supabase/publico';
import { pdfCmrPorToken } from '@/lib/pdf/generar';
import { programarCopiaDeca } from '@/lib/servidor/archivoDeca';

// PDF del e-CMR / DeCA por el ENLACE PÚBLICO del CMR digital (usuario, 2026-11-10):
// quien tiene el enlace de firma (o escanea el QR del impreso) puede abrir el documento
// relleno sin cuenta — es la verificación en línea que promete el propio PDF. La llave es
// el token (igual que cmr_publico): la base de datos lo valida en datos_cmr_por_token y,
// con enlace vivo, se genera el mismo CMR que ve Dynamo, al momento y sin guardar nada.
// Con la CLAVE PÚBLICA (2026-11-11): la clave de servicio no está en todos los
// despliegues (la preview) y aquí no hace falta.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const texto = (msg: string, status: number) => new Response(msg, { status, headers: { 'content-type': 'text/plain; charset=utf-8' } });

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(token)) return texto('Ese documento no existe.', 404);
  const sb = supabasePublico();
  if (!sb) return texto('La plataforma no está conectada.', 503);
  // SIN corte por mantenimiento (Resolución de 5-jun-2026, apdo. tercero.3): esta URL es
  // la del QR del DeCA y un agente debe poder descargar el PDF en una inspección en
  // carretera en cualquier momento. Es solo lectura: el mantenimiento no la afecta.
  const r = await pdfCmrPorToken(sb, token, new URL(req.url).origin);
  if ('error' in r) return texto(r.error, 404);
  // La versión que se sirve queda archivada si aún no lo estaba (conservación legal de un
  // año: Resolución de 5-jun-2026, apdo. segundo.4). Después de responder.
  await programarCopiaDeca({ token, origen: new URL(req.url).origin });
  return new Response(Buffer.from(r.bytes), {
    headers: { 'content-type': 'application/pdf', 'content-disposition': `inline; filename="${r.nombre}"`, 'cache-control': 'private, no-store' },
  });
}
