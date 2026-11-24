// GOOGLE ROUTES: kilómetros y tiempo por carretera entre dos puntos (usuario, 2026-11-24:
// «distancias, rutas pintadas… todo entorno Google»). Cada ruta se pide UNA vez y se guarda
// (distancias_sitios / distancias_cp): el mismo origen-destino no se vuelve a consultar. La
// consulta es la básica (sin tráfico) y tiene tope diario puesto en Google Cloud.
// Ojo: Google calcula la ruta de un turismo; el tiempo de un camión lo sigue poniendo el
// seguimiento de la plataforma (velocidad media y pausas), no este dato.
export const googleRutasListo = () => !!process.env.GOOGLE_MAPS_API_KEY;

export type PuntoRuta = { lat?: number | null; lon?: number | null; direccion?: string | null };
export type RutaGoogle = { ok: true; km: number; minutos: number; linea: string | null } | { ok: false; limite: boolean };

const PAIS: Record<string, string> = { ES: 'España', PT: 'Portugal', FR: 'Francia', DE: 'Alemania', IT: 'Italia', CH: 'Suiza', NL: 'Países Bajos',
  BE: 'Bélgica', LU: 'Luxemburgo', AT: 'Austria', PL: 'Polonia', CZ: 'República Checa', GB: 'Reino Unido', AD: 'Andorra' };
/** La dirección en una línea, como la entiende Google. */
export function direccionEnLinea(p: { direccion?: string | null; codigo_postal?: string | null; poblacion?: string | null; pais?: string | null }): string {
  const iso = (p.pais || 'ES').toUpperCase();
  return [p.direccion?.trim(), [p.codigo_postal?.trim(), p.poblacion?.trim()].filter(Boolean).join(' '), PAIS[iso] ?? iso].filter(Boolean).join(', ');
}

// Cada extremo se manda por sus COORDENADAS si las tiene (usuario, 2026-11-24: un envío salía
// pintado Madrid → Murcia cuando iba de Granada a Castellón). Antes mandaba el texto de la
// dirección, y con una dirección rara o incompleta Google elegía por su cuenta otro sitio
// distinto del punto que enseñamos en el mapa: los kilómetros y la ruta salían de ahí. El
// texto solo se usa cuando no hay coordenadas (p. ej. un código postal suelto).
const conCoordenadas = (p: PuntoRuta) => typeof p.lat === 'number' && typeof p.lon === 'number'
  && Number.isFinite(p.lat) && Number.isFinite(p.lon) && Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180 && !(p.lat === 0 && p.lon === 0);
export const escala = (p: PuntoRuta) => (conCoordenadas(p)
  ? { location: { latLng: { latitude: p.lat!, longitude: p.lon! } } }
  : p.direccion && p.direccion.trim().length >= 3 ? { address: p.direccion.trim().slice(0, 300) } : null);

/** Lee la respuesta de Google (se prueba aparte). */
export function leerRuta(j: { routes?: { distanceMeters?: number; duration?: string; polyline?: { encodedPolyline?: string } }[] } | null): { km: number; minutos: number; linea: string | null } | null {
  const r = j?.routes?.[0];
  if (!r || !Number.isFinite(r.distanceMeters) || r.distanceMeters! <= 0) return null;
  const seg = Number(String(r.duration ?? '').replace(/s$/, ''));
  return { km: Math.round(r.distanceMeters! / 10) / 100, minutos: Number.isFinite(seg) ? Math.round(seg / 60) : 0, linea: r.polyline?.encodedPolyline ?? null };
}

export async function rutaGoogle(a: PuntoRuta, b: PuntoRuta): Promise<RutaGoogle> {
  const clave = process.env.GOOGLE_MAPS_API_KEY;
  const o = escala(a), d = escala(b);
  if (!clave || !o || !d) return { ok: false, limite: false };
  try {
    const r = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST', cache: 'no-store', signal: AbortSignal.timeout(8000),
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': clave,
        'X-Goog-FieldMask': 'routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline' },
      body: JSON.stringify({ origin: o, destination: d, travelMode: 'DRIVE', routingPreference: 'TRAFFIC_UNAWARE',
        polylineQuality: 'OVERVIEW', languageCode: 'es', regionCode: 'es', units: 'METRIC' }),
    });
    const j = await r.json().catch(() => null);
    if (!r.ok) {
      const st = j?.error?.status ?? '';
      console.error(`[google] kilómetros: ${r.status} ${st} ${String(j?.error?.message ?? '').slice(0, 300)}`);
      return { ok: false, limite: r.status === 429 || st === 'RESOURCE_EXHAUSTED' };
    }
    const ruta = leerRuta(j);
    return ruta ? { ok: true, ...ruta } : { ok: false, limite: false };
  } catch {
    console.error('[google] kilómetros: sin conexión');
    return { ok: false, limite: false };
  }
}
