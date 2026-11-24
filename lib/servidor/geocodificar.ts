import 'server-only';
import { supabaseServicio } from '@/lib/supabase/servicio';
import { claveParada } from '@/lib/mapaEnvio';

// Centro de un código postal, SOLO desde el servidor y solo la primera vez: el resultado se
// guarda en geo_codigos_postales y no se vuelve a pedir. Nunca lanza.
//   · Con la clave de Google (GOOGLE_MAPS_API_KEY): Geocoding API, y nada de OpenStreetMap
//     (usuario, 2026-11-24: «todo entorno Google»). Tiene tope diario en Google Cloud.
//   · Sin clave (pruebas automáticas y local): la reserva libre, OpenStreetMap (Nominatim),
//     con sus normas: máximo 1 petición por segundo y una aplicación identificada.
const ESPERA_MS = 1100;
let ultima = 0;

export const geocodingGoogle = () => !!process.env.GOOGLE_MAPS_API_KEY;
/** De dónde sale una coordenada, para apuntarlo junto a ella. */
export const fuenteCoordenadas = (porCp: boolean) => (geocodingGoogle() ? (porCp ? 'google' : 'google_poblacion') : (porCp ? 'nominatim' : 'nominatim_poblacion'));

type RespuestaGoogle = { status?: string; error_message?: string;
  results?: { formatted_address?: string; geometry?: { location?: { lat?: number; lng?: number } } }[] };
// Una consulta a Geocoding. Si Google dice que no quedan consultas hoy, Dynamo se entera
// (campana y email, una vez al día) y la respuesta es «no encontrado».
async function consultaGoogle(parametros: Record<string, string>): Promise<RespuestaGoogle | null> {
  const clave = process.env.GOOGLE_MAPS_API_KEY;
  if (!clave) return null;
  try {
    const u = new URLSearchParams({ ...parametros, language: 'es', key: clave });
    const r = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?${u}`, { signal: AbortSignal.timeout(6000), cache: 'no-store' });
    const j = await r.json().catch(() => null) as RespuestaGoogle | null;
    const st = j?.status ?? String(r.status);
    if (st === 'OK' || st === 'ZERO_RESULTS') return j;
    console.error(`[google] direcciones: ${st} ${(j?.error_message ?? '').slice(0, 200)}`);
    if (st === 'OVER_QUERY_LIMIT' || st === 'OVER_DAILY_LIMIT' || r.status === 429) {
      await supabaseServicio()?.rpc('aviso_limite_api', { p_api: 'direcciones' }).then(() => null, () => null);
    }
    return null;
  } catch { console.error('[google] direcciones: sin conexión'); return null; }
}
const punto = (j: RespuestaGoogle | null) => {
  const l = j?.results?.[0]?.geometry?.location;
  return l && Number.isFinite(l.lat) && Number.isFinite(l.lng) ? { lat: l.lat!, lon: l.lng! } : null;
};

/** La dirección aproximada de unas coordenadas (para la firma del CMR con ubicación). Con
 *  Google; sin clave devuelve null y quien llama usa su reserva. */
export async function direccionDeCoordenadas(lat: number, lon: number): Promise<string | null> {
  if (!geocodingGoogle() || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const j = await consultaGoogle({ latlng: `${lat},${lon}` });
  const d = j?.results?.[0]?.formatted_address;
  return d ? String(d).slice(0, 300) : null;
}

export async function centroCodigoPostal(pais: string, cp: string, poblacion?: string | null): Promise<{ lat: number; lon: number } | null> {
  const c = (cp ?? '').replace(/\s/g, '');
  const p = (pais || 'ES').slice(0, 2).toLowerCase();
  if (c.length < 3) return null;
  if (geocodingGoogle()) {
    const comp = `postal_code:${c}|country:${p.toUpperCase()}`;
    // Con la población primero (afina en países donde un código cubre varias); si no casa, solo el código.
    return (poblacion ? punto(await consultaGoogle({ address: poblacion, components: comp })) : null)
      ?? punto(await consultaGoogle({ components: comp }));
  }
  const espera = ultima + ESPERA_MS - Date.now();
  if (espera > 0) await new Promise((r) => setTimeout(r, espera));
  ultima = Date.now();
  const q = new URLSearchParams({ format: 'jsonv2', limit: '1', postalcode: c, countrycodes: p });
  if (poblacion) q.set('city', poblacion);
  try {
    let r = await fetch(`https://nominatim.openstreetmap.org/search?${q}`, {
      headers: { 'User-Agent': 'Dynamotrans-plataforma/1.0 (+https://www.dynamotrans.com)', 'Accept-Language': 'es' },
      signal: AbortSignal.timeout(6000), cache: 'no-store',
    });
    let j = r.ok ? await r.json() as { lat?: string; lon?: string }[] : [];
    // Con la población a veces no casa (nombres en otro idioma): se repite solo con el CP.
    if (!j.length && poblacion) {
      q.delete('city');
      await new Promise((ok) => setTimeout(ok, ESPERA_MS)); ultima = Date.now();
      r = await fetch(`https://nominatim.openstreetmap.org/search?${q}`, {
        headers: { 'User-Agent': 'Dynamotrans-plataforma/1.0 (+https://www.dynamotrans.com)', 'Accept-Language': 'es' },
        signal: AbortSignal.timeout(6000), cache: 'no-store',
      });
      j = r.ok ? await r.json() as { lat?: string; lon?: string }[] : [];
    }
    const lat = Number(j[0]?.lat), lon = Number(j[0]?.lon);
    return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;
  } catch { return null; }
}

// Búsqueda libre (población y provincia, o la dirección): para las paradas sin código postal o
// cuyo código no encuentra OpenStreetMap. No se guarda (la caché es por código postal).
async function buscarTexto(pais: string, q: string): Promise<{ lat: number; lon: number } | null> {
  if (q.trim().length < 3) return null;
  if (geocodingGoogle()) return punto(await consultaGoogle({ address: q, components: `country:${(pais || 'ES').slice(0, 2).toUpperCase()}` }));
  const espera = ultima + ESPERA_MS - Date.now();
  if (espera > 0) await new Promise((r) => setTimeout(r, espera));
  ultima = Date.now();
  try {
    const u = new URLSearchParams({ format: 'jsonv2', limit: '1', q, countrycodes: (pais || 'ES').slice(0, 2).toLowerCase() });
    const r = await fetch(`https://nominatim.openstreetmap.org/search?${u}`, {
      headers: { 'User-Agent': 'Dynamotrans-plataforma/1.0 (+https://www.dynamotrans.com)', 'Accept-Language': 'es' },
      signal: AbortSignal.timeout(6000), cache: 'no-store',
    });
    if (!r.ok) { console.error('[mapa] el buscador de coordenadas responde', r.status); return null; }
    const j = await r.json() as { lat?: string; lon?: string }[];
    const lat = Number(j[0]?.lat), lon = Number(j[0]?.lon);
    return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;
  } catch { return null; }
}

/** Sitúa una parada sin coordenadas: por su código postal (y lo devuelve para guardarlo); si
 *  no, por población y provincia; si no, por su dirección completa. */
export async function situarParada(p: { pais: string | null; codigo_postal: string | null; poblacion: string | null; provincia: string | null; direccion?: string | null }):
  Promise<{ lat: number; lon: number; porCp: boolean } | null> {
  const pais = p.pais || 'ES';
  if (p.codigo_postal && p.codigo_postal.replace(/\s/g, '').length >= 3) {
    const c = await centroCodigoPostal(pais, p.codigo_postal, p.poblacion);
    if (c) return { ...c, porCp: true };
  }
  const lugar = [p.poblacion, p.provincia].filter((x) => x && x.trim()).join(', ');
  const c2 = lugar ? await buscarTexto(pais, lugar) : null;
  if (c2) return { ...c2, porCp: false };
  const dir = [p.direccion, p.codigo_postal, p.poblacion].filter((x) => x && x.trim()).join(', ');
  const c3 = dir && dir !== lugar ? await buscarTexto(pais, dir) : null;
  if (c3) return { ...c3, porCp: false };
  console.error('[mapa] parada sin situar', { pais, cp: p.codigo_postal, poblacion: p.poblacion });
  return null;
}

type ParadaBuscar = { pais: string | null; codigo_postal: string | null; poblacion: string | null; provincia: string | null; direccion?: string | null };
/** Sitúa como mucho `max` paradas (1 por segundo, norma de OpenStreetMap), sin repetir las que
 *  se buscaron sin éxito en los últimos 7 días (geo_no_encontrados). Lo encontrado se guarda por
 *  su código postal; lo no encontrado se apunta. Devuelve las coordenadas por claveParada. */
export async function situarConCache(paradas: ParadaBuscar[], max = 4): Promise<Map<string, { lat: number; lon: number }>> {
  const hallados = new Map<string, { lat: number; lon: number }>();
  const unicas = new Map<string, ParadaBuscar>();
  for (const p of paradas) if (p.codigo_postal || p.poblacion) unicas.set(claveParada(p), p);
  if (!unicas.size) return hallados;
  const srv = supabaseServicio();
  const desde = new Date(Date.now() - 7 * 864e5).toISOString();
  // Sin la clave de servicio se busca igual, pero sin apuntar nada.
  const { data: neg } = srv ? await srv.from('geo_no_encontrados').select('clave').in('clave', [...unicas.keys()]).gte('buscado_en', desde) : { data: [] };
  const evitar = new Set((neg ?? []).map((x) => x.clave));
  let n = 0;
  for (const [k, p] of unicas) {
    if (evitar.has(k)) continue;
    if (n++ >= max) break;
    const c = await situarParada(p);
    if (!c) { if (srv) await srv.from('geo_no_encontrados').upsert({ clave: k, buscado_en: new Date().toISOString() }); continue; }
    hallados.set(k, { lat: c.lat, lon: c.lon });
    // Por su código postal (aunque saliera por la población: es el mismo sitio aproximado).
    if (p.codigo_postal && srv) await srv.rpc('guardar_geo_cp', { p_pais: p.pais ?? 'ES', p_cp: p.codigo_postal, p_lat: c.lat, p_lon: c.lon, p_fuente: fuenteCoordenadas(c.porCp) });
  }
  return hallados;
}
