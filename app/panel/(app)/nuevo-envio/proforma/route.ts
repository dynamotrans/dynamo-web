import { supabaseServidor } from '@/lib/supabase/server';
import { esDynamo } from '@/lib/sesion';
import { pdfProformaCalculo, lineasProforma } from '@/lib/servidor/proformaCalculo';

// Proforma ORIENTATIVA de la calculadora de Nuevo envío (usuario, 2026-11-11): el precio
// calculado, en PDF, ANTES de crear el envío. El documento lo arma
// lib/servidor/proformaCalculo (lo comparte con el envío por email, que lo adjunta).
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const texto = (msg: string, status: number) => new Response(msg, { status, headers: { 'content-type': 'text/plain; charset=utf-8' } });

export async function GET(req: Request) {
  const sb = await supabaseServidor();
  if (!sb) return texto('La plataforma no está conectada.', 503);
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return Response.redirect(new URL('/panel/entrar', req.url), 302);
  const { data: yo } = await sb.from('usuarios').select('rol, estado').eq('id', user.id).maybeSingle<{ rol: string; estado: string }>();
  if (!yo || yo.estado !== 'activa' || !(esDynamo(yo.rol) || yo.rol === 'cliente')) return texto('No tienes permiso para ver este documento.', 403);

  const u = new URL(req.url);
  // Ruta y detalle vienen en LÍNEAS (una parada por línea; fecha+ventana, camión y
  // medidas), el mismo estilo que el email de la proforma (usuario, 2026-11-13).
  const r = await pdfProformaCalculo(sb, yo.rol, {
    base: Number((u.searchParams.get('base') ?? '').replace(',', '.')),
    ruta: lineasProforma(u.searchParams.get('ruta') ?? '', 600, 6), det: lineasProforma(u.searchParams.get('det') ?? '', 400, 4),
    cliente: u.searchParams.get('cliente') || null,
  });
  if ('error' in r) return texto(r.error, r.status);
  return new Response(Buffer.from(r.bytes), { headers: { 'content-type': 'application/pdf',
    'content-disposition': 'inline; filename="Proforma-calculo.pdf"', 'cache-control': 'private, no-store' } });
}
