import { supabasePublico } from '@/lib/supabase/publico';
import { pdfDecaPorToken } from '@/lib/pdf/generar';
import { programarCopiaDeca } from '@/lib/servidor/archivoDeca';

// EL DeCA EN PDF por su dirección pública (usuario, 2026-11-15): /deca/<nº único> es la
// dirección que lleva el QR del documento de control. Descarga DIRECTA del PDF, sin
// cuenta, sin botones y sin corte por mantenimiento (Resolución de 5-jun-2026, apdo.
// tercero): un agente debe poder abrirlo en una inspección en carretera en cualquier
// momento. Es solo el DeCA: el CMR y sus firmas son otro documento (/cmr/<nº>/pdf).
// La llave es el nº único del envío (el mismo enlace que valida datos_cmr_por_token); se
// genera al momento con los datos de ahora, así que siempre está al día, con su histórico.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const texto = (msg: string, status: number) => new Response(msg, { status, headers: { 'content-type': 'text/plain; charset=utf-8' } });

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(token)) return texto('Ese documento no existe.', 404);
  const sb = supabasePublico();
  if (!sb) return texto('La plataforma no está conectada.', 503);
  const origen = new URL(req.url).origin;
  const r = await pdfDecaPorToken(sb, token, origen);
  if ('error' in r) return texto(r.error, 404);
  // La versión que se sirve queda archivada si aún no lo estaba (conservación legal de un
  // año: Resolución de 5-jun-2026, apdo. segundo.4). Después de responder.
  await programarCopiaDeca({ token, origen });
  return new Response(Buffer.from(r.bytes), {
    headers: { 'content-type': 'application/pdf', 'content-disposition': `inline; filename="${r.nombre}"`, 'cache-control': 'private, no-store', 'x-robots-tag': 'noindex, nofollow' },
  });
}
