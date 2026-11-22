import { supabaseServidor } from '@/lib/supabase/server';
import { supabaseServicio } from '@/lib/supabase/servicio';
import { tipoReal } from '@/lib/contenidoArchivo';

// El archivo de un albarán de la bandeja «Verificación de albaranes», para dibujarlo en la
// pantalla de revisión. Solo para el equipo de Dynamo: si la fila no se ve con su sesión (la
// tabla solo deja verla a Dynamo), no hay archivo. Se mira que sea un PDF o una imagen de verdad.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const no = (s: number) => new Response(null, { status: s, headers: { 'cache-control': 'no-store' } });
  if (!/^[0-9a-f-]{36}$/i.test(id)) return no(404);
  const sb = await supabaseServidor();
  if (!sb) return no(503);
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return no(401);
  const { data: fila } = await sb.from('documentos_entrada').select('storage_ruta').eq('id', id).in('estado', ['pendiente']).maybeSingle();
  if (!fila) return no(404);
  const srv = supabaseServicio() ?? sb;
  const { data: blob } = await srv.storage.from('documentos').download(fila.storage_ruta);
  if (!blob) return no(404);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const tipo = tipoReal(bytes.subarray(0, 64));
  if (!tipo) return no(415);
  return new Response(bytes, { headers: { 'content-type': tipo, 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' } });
}
