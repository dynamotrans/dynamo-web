import 'server-only';
import { supabaseServicio } from '@/lib/supabase/servicio';
import { coordenadasDeDireccion } from './geocodificar';

// LA UBICACIÓN DE UN SITIO (usuario, 2026-11-24): al crearlo o al cambiarle la dirección, el
// servidor busca sus coordenadas en Google y las guarda. Con ellas la base de datos le pone su
// enlace de Google Maps si no trae uno propio (fn_sitios_ubicacion), y los mapas y las rutas lo
// sitúan en su punto exacto en vez de en el centro de su código postal. Nunca lanza: si Google
// no contesta, el sitio se queda sin coordenadas y se reintenta la próxima vez que se guarde.
export async function situarSitio(id: string): Promise<void> {
  try {
    const srv = supabaseServicio();
    if (!srv) return;
    const { data: s } = await srv.from('sitios').select('id, direccion, codigo_postal, poblacion, provincia, pais_codigo_iso, lat, lon').eq('id', id).maybeSingle();
    if (!s || (s.lat != null && s.lon != null)) return;
    const c = await coordenadasDeDireccion(s);
    if (c) await srv.from('sitios').update({ lat: Math.round(c.lat * 1e6) / 1e6, lon: Math.round(c.lon * 1e6) / 1e6 }).eq('id', id);
  } catch { /* sin ubicación por ahora */ }
}
