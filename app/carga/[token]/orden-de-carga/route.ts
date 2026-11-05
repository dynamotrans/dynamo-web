import { cookies } from 'next/headers';
import { supabasePublico } from '@/lib/supabase/publico';
import { cookieReserva } from '@/lib/cargaPublica';
import { cargarDatosDocPublica } from '@/lib/pdf/datos';
import { ordenDeCarga } from '@/lib/pdf/orden';

// /carga/<enlace>/orden-de-carga: la orden de carga en PDF para el transportista que
// aceptó desde el enlace (sin cuenta). La llave es su reserva aceptada (cookie de esta
// página); la base de datos comprueba que sigue siendo suya. Se ABRE en el visor (0-bis).
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const texto = (msg: string, status: number) => new Response(msg, { status, headers: { 'content-type': 'text/plain; charset=utf-8' } });

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(token)) return texto('Ese enlace no existe.', 404);
  const sb = supabasePublico();
  if (!sb) return texto('La plataforma no está conectada.', 503);
  const reserva = (await cookies()).get(cookieReserva(token))?.value;
  if (!reserva) return texto('La orden solo se abre desde el navegador con el que aceptaste el envío. Pídenosla al +34 955 225 945.', 403);
  const r = await cargarDatosDocPublica(sb, reserva);
  if (!r.datos) return texto('Esta orden de carga ya no está disponible. Llámanos al +34 955 225 945.', 403);
  const p = r.parametros;
  const bytes = await ordenDeCarga(r.datos, { pct: p.pronto_pago_pct ?? 3, minimo: p.pronto_pago_minimo ?? 20,
    dias: p.pronto_pago_dias ?? 5, plazo: p.plazo_pago_transportista_dias ?? 60 });
  const ref = String(r.datos.envio.referencia_gx ?? 'envio').replace(/[^A-Za-z0-9-]/g, '');
  return new Response(Buffer.from(bytes), { headers: { 'content-type': 'application/pdf',
    'content-disposition': `inline; filename="Orden-de-carga-${ref}.pdf"`, 'cache-control': 'private, no-store' } });
}
