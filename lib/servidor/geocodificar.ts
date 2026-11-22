import 'server-only';

// Centro de un código postal con OpenStreetMap (Nominatim), SOLO desde el servidor y solo la
// primera vez: el resultado se guarda en geo_codigos_postales y no se vuelve a pedir. Normas de
// Nominatim: máximo 1 petición por segundo y una aplicación identificada. Nunca lanza.
const ESPERA_MS = 1100;
let ultima = 0;

export async function centroCodigoPostal(pais: string, cp: string, poblacion?: string | null): Promise<{ lat: number; lon: number } | null> {
  const c = (cp ?? '').replace(/\s/g, '');
  const p = (pais || 'ES').slice(0, 2).toLowerCase();
  if (c.length < 3) return null;
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
