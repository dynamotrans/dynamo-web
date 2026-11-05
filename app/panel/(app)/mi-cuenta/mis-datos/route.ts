import { hoyMadrid } from '@/lib/formato';
import { sesion } from '@/lib/sesion';

// RGPD — derecho de acceso y portabilidad: descarga en JSON de lo que la plataforma
// guarda de quien lo pide (exportar_datos_usuario()).
export const dynamic = 'force-dynamic';

export async function GET() {
  const s = await sesion();
  if (!s?.perfil) return new Response('Sin sesión', { status: 401 });
  const { data, error } = await s.supabase.rpc('exportar_datos_usuario');
  if (error || !data) return new Response('No se han podido preparar tus datos.', { status: 500 });
  const hoy = hoyMadrid();
  return new Response(JSON.stringify(data, null, 2), {
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': `attachment; filename="mis-datos-dynamo-${hoy}.json"`, 'Cache-Control': 'no-store' },
  });
}
