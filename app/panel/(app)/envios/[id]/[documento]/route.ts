import { supabaseServidor } from '@/lib/supabase/server';
import { esDynamo } from '@/lib/sesion';
import { cargarDatosDoc } from '@/lib/pdf/datos';
import { ordenDeCarga } from '@/lib/pdf/orden';
import { cmr } from '@/lib/pdf/cmr';

// PDF de un envío: /panel/envios/<id>/orden-de-carga y /panel/envios/<id>/cmr.
// Se generan al momento con los datos de ahora y se ABREN en el visor (regla 0-bis:
// `inline`, nunca descarga forzada). Solo Dynamo (etapa A).
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const texto = (msg: string, status: number) => new Response(msg, { status, headers: { 'content-type': 'text/plain; charset=utf-8' } });

export async function GET(req: Request, { params }: { params: Promise<{ id: string; documento: string }> }) {
  const { id, documento } = await params;
  if (!['orden-de-carga', 'cmr'].includes(documento) || !/^[0-9a-f-]{36}$/i.test(id)) return texto('Ese documento no existe.', 404);
  const sb = await supabaseServidor();
  if (!sb) return texto('La plataforma no está conectada.', 503);
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return Response.redirect(new URL('/panel/entrar', req.url), 302);
  const { data: yo } = await sb.from('usuarios').select('rol, estado').eq('id', user.id).maybeSingle<{ rol: string; estado: string }>();
  if (!yo || yo.estado !== 'activa' || !esDynamo(yo.rol)) return texto('No tienes permiso para ver este documento.', 403);

  const { datos, error } = await cargarDatosDoc(sb, id, user.id);
  if (!datos) return texto(error ?? 'No se ha podido leer el envío.', 404);

  let bytes: Uint8Array;
  if (documento === 'cmr') bytes = await cmr(datos);
  else {
    const { data: ps } = await sb.from('parametros').select('clave, valor')
      .in('clave', ['pronto_pago_pct', 'pronto_pago_minimo', 'pronto_pago_dias', 'plazo_pago_transportista_dias']);
    const p = new Map((ps ?? []).map((x: any) => [x.clave, Number(x.valor)]));
    bytes = await ordenDeCarga(datos, { pct: p.get('pronto_pago_pct') ?? 3, minimo: p.get('pronto_pago_minimo') ?? 20,
      dias: p.get('pronto_pago_dias') ?? 5, plazo: p.get('plazo_pago_transportista_dias') ?? 60 });
  }
  const ref = String(datos.envio.referencia_gx ?? 'envio').replace(/[^A-Za-z0-9-]/g, '');
  const nombre = documento === 'cmr' ? `CMR-${ref}.pdf` : `${datos.manual ? 'Orden-de-transporte' : 'Orden-de-carga'}-${ref}.pdf`;
  return new Response(Buffer.from(bytes), {
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `inline; filename="${nombre}"`,
      'cache-control': 'private, no-store',
    },
  });
}
