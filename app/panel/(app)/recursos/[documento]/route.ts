import { supabaseServidor } from '@/lib/supabase/server';
import { cmrEnBlanco, cartaPorteEnBlanco } from '@/lib/pdf/modelos';

// /panel/recursos/cmr y /panel/recursos/carta-de-porte: los modelos EN BLANCO para
// imprimir. Se ABREN en el visor (regla 0-bis). Cualquier cuenta activa.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const texto = (msg: string, status: number) => new Response(msg, { status, headers: { 'content-type': 'text/plain; charset=utf-8' } });
const MODELOS = {
  cmr: { hacer: cmrEnBlanco, nombre: 'CMR-modelo-en-blanco.pdf' },
  'carta-de-porte': { hacer: cartaPorteEnBlanco, nombre: 'Carta-de-porte-nacional.pdf' },
} as const;

export async function GET(req: Request, { params }: { params: Promise<{ documento: string }> }) {
  const { documento } = await params;
  const m = MODELOS[documento as keyof typeof MODELOS];
  if (!m) return texto('Ese documento no existe.', 404);
  const sb = await supabaseServidor();
  if (!sb) return texto('La plataforma no está conectada.', 503);
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return Response.redirect(new URL('/panel/entrar', req.url), 302);
  const { data: yo } = await sb.from('usuarios').select('estado').eq('id', user.id).maybeSingle<{ estado: string }>();
  if (!yo || yo.estado !== 'activa') return texto('No tienes permiso para ver este documento.', 403);
  const bytes = await m.hacer();
  return new Response(Buffer.from(bytes), {
    headers: { 'content-type': 'application/pdf', 'content-disposition': `inline; filename="${m.nombre}"`, 'cache-control': 'private, max-age=3600' },
  });
}
