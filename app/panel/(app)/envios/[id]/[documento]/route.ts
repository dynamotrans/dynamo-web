import { supabaseServidor } from '@/lib/supabase/server';
import { esDynamo } from '@/lib/sesion';
import { cargarDatosDocTransportista, cargarDatosDocManual, cargarLogoOperador, datosDynamo } from '@/lib/pdf/datos';
import { pdfDeEnvioDynamo } from '@/lib/pdf/generar';
import { ordenDeCarga } from '@/lib/pdf/orden';

// PDF de un envío: /panel/envios/<id>/orden-de-carga y /panel/envios/<id>/cmr.
// Se generan al momento con los datos de ahora y se ABREN en el visor (regla 0-bis:
// `inline`, nunca descarga forzada). Dynamo, y el transportista la orden de SU viaje.
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
  if (!yo || yo.estado !== 'activa') return texto('No tienes permiso para ver este documento.', 403);

  // El TRANSPORTISTA: solo la orden de carga de SU viaje (sin datos del cliente de Dynamo).
  if (yo.rol === 'transportista') {
    if (documento !== 'orden-de-carga') return texto('No tienes permiso para ver este documento.', 403);
    const r = await cargarDatosDocTransportista(sb, id);
    if (!r.datos) return texto(r.error ?? 'No se ha podido leer el envío.', 404);
    const p = r.parametros;
    const bytesT = await ordenDeCarga({ ...r.datos, dynamo: await datosDynamo(sb) }, { pct: p.pronto_pago_pct ?? 3, minimo: p.pronto_pago_minimo ?? 20,
      dias: p.pronto_pago_dias ?? 5, plazo: p.plazo_pago_transportista_dias ?? 60 });
    const refT = String(r.datos.envio.referencia_gx ?? 'envio').replace(/[^A-Za-z0-9-]/g, '');
    return new Response(Buffer.from(bytesT), { headers: { 'content-type': 'application/pdf', 'content-disposition': `inline; filename="Orden-de-carga-${refT}.pdf"`, 'cache-control': 'private, no-store' } });
  }
  // El CLIENTE: la orden de carga de SUS envíos manuales (sin nada de Dynamo).
  if (yo.rol === 'cliente') {
    if (documento !== 'orden-de-carga') return texto('No tienes permiso para ver este documento.', 403);
    const r = await cargarDatosDocManual(sb, id);
    if (!r.datos) return texto(r.error ?? 'No se ha podido leer el envío.', 404);
    const { data: mio } = await sb.rpc('mis_envios').eq('id', id).maybeSingle<{ operador_id: string | null }>();
    const bytesC = await ordenDeCarga({ ...r.datos, logoPorteador: await cargarLogoOperador(sb, mio?.operador_id) }, { pct: 0, minimo: 0, dias: 0, plazo: 0 });
    const refC = String(r.datos.envio.referencia_gx ?? 'envio').replace(/[^A-Za-z0-9-]/g, '');
    return new Response(Buffer.from(bytesC), { headers: { 'content-type': 'application/pdf', 'content-disposition': `inline; filename="Orden-de-transporte-${refC}.pdf"`, 'cache-control': 'private, no-store' } });
  }
  if (!esDynamo(yo.rol)) return texto('No tienes permiso para ver este documento.', 403);

  const r = await pdfDeEnvioDynamo(sb, id, documento as 'orden-de-carga' | 'cmr', user.id, new URL(req.url).origin);
  if ('error' in r) return texto(r.error, 404);
  const { bytes, nombre } = r;
  return new Response(Buffer.from(bytes), {
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `inline; filename="${nombre}"`,
      'cache-control': 'private, no-store',
    },
  });
}
