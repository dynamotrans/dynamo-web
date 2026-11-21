import { supabaseServidor } from '@/lib/supabase/server';
import { esDynamo } from '@/lib/sesion';
import { pdfProformaCalculo } from '@/lib/servidor/proformaCalculo';

// Proforma ORIENTATIVA de «Crear varios envíos» (usuario, 2026-11-21): la lista de precios
// de la tabla en un solo PDF, un concepto por envío, ANTES de crearlos. Mismo documento que
// la de Nuevo envío (sin numerar, sin datos de pago, no vinculante). Máximo 20 envíos.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const texto = (msg: string, status: number) => new Response(msg, { status, headers: { 'content-type': 'text/plain; charset=utf-8' } });

export async function POST(req: Request) {
  const sb = await supabaseServidor();
  if (!sb) return texto('La plataforma no está conectada.', 503);
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return texto('Inicia sesión.', 401);
  const { data: yo } = await sb.from('usuarios').select('rol, estado').eq('id', user.id).maybeSingle<{ rol: string; estado: string }>();
  if (!yo || yo.estado !== 'activa' || !(esDynamo(yo.rol) || yo.rol === 'cliente')) return texto('No tienes permiso para ver este documento.', 403);

  let cuerpo: unknown;
  try { cuerpo = await req.json(); } catch { return texto('Petición no válida.', 400); }
  const c = cuerpo as { cliente?: unknown; envios?: unknown };
  if (!Array.isArray(c.envios) || c.envios.length < 1 || c.envios.length > 20) return texto('La proforma lleva de 1 a 20 envíos.', 400);
  const varios = (c.envios as { titulo?: unknown; lineas?: unknown; base?: unknown }[]).map((x, i) => ({
    titulo: typeof x.titulo === 'string' ? x.titulo : `Envío ${i + 1}`,
    lineas: Array.isArray(x.lineas) ? (x.lineas as unknown[]).filter((t): t is string => typeof t === 'string') : [],
    base: Number(x.base),
  }));
  const r = await pdfProformaCalculo(sb, yo.rol, {
    base: 0, ruta: [], det: [], varios,
    cliente: typeof c.cliente === 'string' && c.cliente ? c.cliente : null,
  });
  if ('error' in r) return texto(r.error, r.status);
  return new Response(Buffer.from(r.bytes), { headers: { 'content-type': 'application/pdf',
    'content-disposition': 'inline; filename="Proforma-varios-envios.pdf"', 'cache-control': 'private, no-store' } });
}
