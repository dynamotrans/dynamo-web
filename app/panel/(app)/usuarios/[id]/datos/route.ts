import { hoyMadrid } from '@/lib/formato';
import { sesion, esDynamo } from '@/lib/sesion';

// RGPD: Dynamo descarga lo que la plataforma guarda de una persona, para responder a su
// petición de acceso. La base de datos solo lo permite al equipo de Dynamo.
export const dynamic = 'force-dynamic';

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await sesion();
  if (!s?.perfil || s.perfil.estado !== 'activa' || !esDynamo(s.perfil.rol)) return new Response('No autorizado', { status: 403 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response('No encontrado', { status: 404 });
  const { data, error } = await s.supabase.rpc('exportar_datos_usuario', { p_usuario: id });
  if (error || !data) return new Response('No se han podido preparar los datos.', { status: 500 });
  const hoy = hoyMadrid();
  return new Response(JSON.stringify(data, null, 2), {
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': `attachment; filename="datos-usuario-${id.slice(0, 8)}-${hoy}.json"`, 'Cache-Control': 'no-store' },
  });
}
