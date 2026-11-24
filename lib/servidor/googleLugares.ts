// GOOGLE PLACES (New) para el buscador de sitios (usuario, 2026-11-23/24). Dos consultas, las
// dos con tope diario puesto en Google Cloud:
//   · autocompletar: las sugerencias mientras se escribe (barata);
//   · ficha del sitio: dirección, teléfono, horario y enlace de Maps del elegido (la cara:
//     solo se pide al ELEGIR un sitio, una por sitio creado).
// Las dos van con la misma «sesión» (un identificador por búsqueda), como pide Google para
// facturarlas juntas. La clave (GOOGLE_MAPS_API_KEY) solo vive en el servidor.
import { tipoPorGoogle, type TipoPropuesto } from '@/lib/tipoSitioAuto';
import { horarioDeGoogle, type GrupoHorario, type PeriodoGoogle } from '@/lib/horarios';

const BASE = 'https://places.googleapis.com/v1';
// Los países donde trabaja Dynamo (Google admite hasta 15 en el filtro).
const PAISES = ['es', 'pt', 'fr', 'de', 'it', 'ch', 'nl', 'be', 'lu', 'at', 'pl', 'cz', 'gb', 'ad'];
export const SESION_GOOGLE = /^[A-Za-z0-9_-]{8,64}$/;
export const LUGAR_GOOGLE = /^[A-Za-z0-9_-]{10,300}$/;

export const googleLugaresListo = () => !!process.env.GOOGLE_MAPS_API_KEY;

/** `es_direccion`: una calle, un número, un código postal o una población (no una empresa). */
export type Sugerencia = { place_id: string; titulo: string; detalle: string; es_direccion: boolean };
const NEGOCIO = ['establishment', 'point_of_interest'];
// Sin tipos no se sabe: se trata como empresa (lo normal en este buscador).
const esDireccion = (tipos: string[] | undefined) => !!tipos?.length && !tipos.some((t) => NEGOCIO.includes(t));
// Solo direcciones (para situar una parada sin empresa): Google admite hasta 5 tipos.
const TIPOS_DIRECCION = ['street_address', 'route', 'premise', 'postal_code', 'locality'];
export type FichaGoogle = {
  empresa: string; direccion: string; codigo_postal: string; poblacion: string; provincia: string;
  pais_codigo_iso: string; telefono: string; url_google_maps: string; etiqueta: string;
  horario: GrupoHorario[] | null;
  es_direccion: boolean; lat: number | null; lon: number | null;
  tipo_sugerido: TipoPropuesto | null;   // el tipo de sitio que se propone solo (ver lib/tipoSitioAuto)
};
/** `limite`: Google dice que no quedan consultas hoy (hay que avisar a Dynamo). */
type Fallo = { ok: false; limite: boolean };

async function fallo(r: Response, que: string): Promise<Fallo> {
  const j = await r.json().catch(() => null) as { error?: { status?: string; message?: string } } | null;
  const limite = r.status === 429 || j?.error?.status === 'RESOURCE_EXHAUSTED';
  // Al registro del servidor (nunca la clave): para ver desde Vercel por qué no contesta.
  console.error(`[google] ${que}: ${r.status} ${j?.error?.status ?? ''} ${(j?.error?.message ?? '').slice(0, 300)}`);
  return { ok: false, limite };
}

export async function autocompletarLugares(q: string, sesion: string, soloDirecciones = false): Promise<{ ok: true; lista: Sugerencia[] } | Fallo> {
  const clave = process.env.GOOGLE_MAPS_API_KEY;
  if (!clave) return { ok: false, limite: false };
  try {
    const r = await fetch(`${BASE}/places:autocomplete`, {
      method: 'POST', cache: 'no-store',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': clave,
        'X-Goog-FieldMask': 'suggestions.placePrediction.placeId,suggestions.placePrediction.structuredFormat,suggestions.placePrediction.text,suggestions.placePrediction.types' },
      body: JSON.stringify({ input: q, languageCode: 'es', regionCode: 'es', includedRegionCodes: PAISES, sessionToken: sesion,
        ...(soloDirecciones ? { includedPrimaryTypes: TIPOS_DIRECCION } : {}) }),
    });
    if (!r.ok) return fallo(r, 'autocompletar');
    const j = await r.json() as { suggestions?: { placePrediction?: { placeId?: string; text?: { text?: string }; types?: string[];
      structuredFormat?: { mainText?: { text?: string }; secondaryText?: { text?: string } } } }[] };
    const lista = (j.suggestions ?? []).map((s) => s.placePrediction).filter((p): p is NonNullable<typeof p> => !!p?.placeId)
      .map((p) => ({ place_id: p.placeId!, titulo: p.structuredFormat?.mainText?.text ?? p.text?.text ?? '', detalle: p.structuredFormat?.secondaryText?.text ?? '',
        es_direccion: esDireccion(p.types) }))
      .filter((p) => p.titulo && LUGAR_GOOGLE.test(p.place_id)).slice(0, soloDirecciones ? 5 : 4);
    return { ok: true, lista };
  } catch {
    console.error('[google] autocompletar: sin conexión');
    return { ok: false, limite: false };
  }
}

type Componente = { longText?: string; shortText?: string; types?: string[] };
export type LugarGoogle = {
  displayName?: { text?: string }; formattedAddress?: string; addressComponents?: Componente[];
  nationalPhoneNumber?: string; internationalPhoneNumber?: string; googleMapsUri?: string;
  regularOpeningHours?: { periods?: PeriodoGoogle[] };
  types?: string[]; location?: { latitude?: number; longitude?: number };
};
/** La respuesta de Google en los campos de nuestra ficha de sitio. */
export function fichaDeLugar(p: LugarGoogle): FichaGoogle {
  const comp = (tipo: string, corto = false) => {
    const c = (p.addressComponents ?? []).find((x) => x.types?.includes(tipo));
    return (corto ? c?.shortText : c?.longText) ?? '';
  };
  const pais = (comp('country', true) || 'ES').toUpperCase();
  const tel = p.internationalPhoneNumber || p.nationalPhoneNumber || '';
  const direccion = [comp('route'), comp('street_number')].filter(Boolean).join(', ');
  return {
    empresa: p.displayName?.text ?? '',
    direccion,
    codigo_postal: comp('postal_code'),
    poblacion: comp('locality') || comp('postal_town') || comp('administrative_area_level_3') || comp('sublocality'),
    provincia: comp('administrative_area_level_2') || comp('administrative_area_level_1'),
    pais_codigo_iso: pais,
    telefono: tel.replace(/[^\d+]/g, ''),
    url_google_maps: p.googleMapsUri ?? '',
    etiqueta: p.formattedAddress ?? '',
    horario: horarioDeGoogle(p.regularOpeningHours?.periods),
    es_direccion: esDireccion(p.types),
    lat: Number.isFinite(p.location?.latitude) ? p.location!.latitude! : null,
    lon: Number.isFinite(p.location?.longitude) ? p.location!.longitude! : null,
    tipo_sugerido: tipoPorGoogle({ tipos: p.types, empresa: p.displayName?.text, direccion: `${direccion} · ${p.formattedAddress ?? ''}`, esDireccion: esDireccion(p.types) }),
  };
}

// Campos de la ficha. Una DIRECCIÓN solo necesita los básicos (la consulta barata); teléfono,
// horario y enlace son la consulta cara y solo se piden para una empresa.
const CAMPOS_DIRECCION = 'displayName,formattedAddress,addressComponents,types,location';
const CAMPOS_EMPRESA = `${CAMPOS_DIRECCION},nationalPhoneNumber,internationalPhoneNumber,googleMapsUri,regularOpeningHours.periods`;

export async function fichaLugar(placeId: string, sesion: string, soloDireccion = false): Promise<{ ok: true; ficha: FichaGoogle } | Fallo> {
  const clave = process.env.GOOGLE_MAPS_API_KEY;
  if (!clave) return { ok: false, limite: false };
  try {
    const r = await fetch(`${BASE}/places/${encodeURIComponent(placeId)}?languageCode=es&regionCode=ES&sessionToken=${encodeURIComponent(sesion)}`, {
      cache: 'no-store',
      headers: { 'X-Goog-Api-Key': clave, 'X-Goog-FieldMask': soloDireccion ? CAMPOS_DIRECCION : CAMPOS_EMPRESA },
    });
    if (!r.ok) return fallo(r, 'ficha del sitio');
    const ficha = fichaDeLugar(await r.json() as LugarGoogle);
    return ficha.empresa || ficha.etiqueta ? { ok: true, ficha } : { ok: false, limite: false };
  } catch {
    console.error('[google] ficha del sitio: sin conexión');
    return { ok: false, limite: false };
  }
}
