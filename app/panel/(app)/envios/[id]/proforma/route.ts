import { supabaseServidor } from '@/lib/supabase/server';
import { esDynamo } from '@/lib/sesion';
import { proformaDeEnvio } from '@/lib/servidor/proformaEnvio';

// /panel/envios/<id>/proforma: la factura proforma del PREVIO PAGO de un envío. Se ABRE
// en el visor (regla 0-bis). Dynamo, cualquiera; el cliente, solo las suyas (pagos_envio()
// solo le devuelve las de su empresa). Solo existe si el envío lleva pago previo.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const texto = (msg: string, status: number) => new Response(msg, { status, headers: { 'content-type': 'text/plain; charset=utf-8' } });

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return texto('Ese envío no existe.', 404);
  const sb = await supabaseServidor();
  if (!sb) return texto('La plataforma no está conectada.', 503);
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return Response.redirect(new URL('/panel/entrar', req.url), 302);
  const { data: yo } = await sb.from('usuarios').select('rol, estado').eq('id', user.id).maybeSingle<{ rol: string; estado: string }>();
  if (!yo || yo.estado !== 'activa' || !(esDynamo(yo.rol) || yo.rol === 'cliente')) return texto('No tienes permiso para ver este documento.', 403);

  const r = await proformaDeEnvio(sb, id, esDynamo(yo.rol));
  if (!r.ok) return texto(r.error, r.status);
  return new Response(Buffer.from(r.bytes), { headers: { 'content-type': 'application/pdf',
    'content-disposition': `inline; filename="${r.nombre}"`, 'cache-control': 'private, no-store' } });
}
