import 'server-only';
import { usosDeRespuesta } from '@/lib/tipoSitioAuto';

// EL TIPO DE SUELO de un punto (industrial, agrícola, viviendas…), para proponer el tipo de
// sitio cuando Google no lo aclara. Google no lo da: sale de los datos abiertos de
// OpenStreetMap (consulta Overpass), SOLO desde el servidor y sin que se vea nada suyo en
// pantalla. Es una consulta por sitio creado (pocas al día). Nunca lanza: si no contesta,
// no hay propuesta y el tipo lo elige quien crea el sitio.
const URL_OVERPASS = process.env.OVERPASS_URL || 'https://overpass-api.de/api/interpreter';

export async function usosDelSuelo(lat: number, lon: number): Promise<string[]> {
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return [];
  const consulta = `[out:json][timeout:5];is_in(${lat.toFixed(6)},${lon.toFixed(6)})->.a;area.a[landuse];out tags;`;
  try {
    const r = await fetch(URL_OVERPASS, {
      method: 'POST', cache: 'no-store', signal: AbortSignal.timeout(6000),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'Dynamotrans-plataforma/1.0 (+https://www.dynamotrans.com)' },
      body: `data=${encodeURIComponent(consulta)}`,
    });
    if (!r.ok) { console.error(`[suelo] ${r.status}`); return []; }
    return usosDeRespuesta(await r.json().catch(() => null));
  } catch { console.error('[suelo] sin respuesta'); return []; }
}
