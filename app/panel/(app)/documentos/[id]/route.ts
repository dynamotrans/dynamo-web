import { contenidoDeUrl } from '@/lib/servidor/contenidoArchivo';
import { supabaseServidor } from '@/lib/supabase/server';

// Abrir un documento: /panel/documentos/<id>. Si quien lo pide puede ver su fila (lo
// decide la base de datos), se le manda a un enlace firmado del bucket privado que
// caduca en 60 segundos, y el navegador lo abre en su visor (regla 0-bis).
export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const texto = (m: string, status: number) => new Response(m, { status, headers: { 'content-type': 'text/plain; charset=utf-8' } });
  if (!/^[0-9a-f-]{36}$/i.test(id)) return texto('Ese documento no existe.', 404);
  const sb = await supabaseServidor();
  if (!sb) return texto('La plataforma no está conectada.', 503);
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return Response.redirect(new URL('/panel/entrar', req.url), 302);
  const { data: doc } = await sb.from('documentos').select('storage_bucket, storage_ruta, nombre_archivo').eq('id', id).eq('borrado', false).maybeSingle();
  if (!doc) return texto('Ese documento no existe o no tienes permiso para verlo.', 404);
  const { data, error } = await sb.storage.from(doc.storage_bucket).createSignedUrl(doc.storage_ruta, 60);
  if (error || !data?.signedUrl) return texto('No se ha podido abrir el documento. Vuelve a intentarlo.', 502);
  // ANTES de abrirlo se mira qué ES de verdad (sus primeros bytes), no lo que dice ser: el
  // almacén solo admite PDF e imágenes, pero el tipo lo declara quien sube. Lo que no sea
  // una cosa ni otra no se abre a nadie, venga de donde venga (usuario, 2026-11-18).
  const contenido = await contenidoDeUrl(data.signedUrl);
  if (contenido.estado === 'malo') {
    console.error('[documentos] contenido no válido: no se abre', { id, ruta: doc.storage_ruta, nombre: doc.nombre_archivo, pide: user.id });
    return texto('Este archivo no se puede abrir: su contenido no es una imagen ni un PDF, aunque el nombre lo diga. No lo descargues por otros medios y avisa al equipo de Dynamo.', 415);
  }
  if (contenido.estado === 'sin_leer') return texto('No se ha podido abrir el documento. Vuelve a intentarlo.', 502);
  return new Response(null, { status: 302, headers: { location: data.signedUrl, 'cache-control': 'private, no-store' } });
}
