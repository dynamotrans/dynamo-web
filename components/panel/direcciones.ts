// Buscar DIRECCIONES (no empresas): con Google cuando la plataforma tiene sus claves (usuario,
// 2026-11-24: «todo entorno Google»), y con la reserva libre (OpenStreetMap) cuando no las hay
// —pruebas automáticas y local—, para poder probar sin gastar.
import { buscarDireccionesGoogle, detalleDireccionGoogle } from '@/app/panel/(app)/sitios/acciones';

export type Direccion = { etiqueta: string; direccion: string; codigo_postal: string; poblacion: string; provincia: string; pais: string;
  place_id?: string; lat?: number | null; lon?: number | null };

/** La plataforma tiene Google: no se enseña nada de OpenStreetMap. */
export const CON_GOOGLE = !!process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;

/** Un identificador de búsqueda para Google (factura juntas las sugerencias y el detalle). */
export const nuevaSesionGoogle = () => (globalThis.crypto?.randomUUID?.() ?? `s${Date.now()}${Math.random().toString(36).slice(2)}`).replace(/[^A-Za-z0-9_-]/g, '');

async function buscarLibre(q: string): Promise<Direccion[]> {
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=3&accept-language=es&q=${encodeURIComponent(q)}`);
    if (!r.ok) return [];
    const j = (await r.json()) as { display_name?: string; address?: Record<string, string> }[];
    return j.map((it) => {
      const a = it.address ?? {};
      const loc = a.city || a.town || a.village || a.municipality || '';
      return {
        etiqueta: (it.display_name ?? '').split(',').slice(0, 3).join(',').trim(),
        direccion: [a.road ?? a.pedestrian ?? '', a.house_number ?? ''].filter(Boolean).join(', '),
        codigo_postal: a.postcode ?? '', poblacion: loc,
        provincia: a.province || (a.state && a.state !== loc ? a.state : '') || '',
        pais: (a.country_code ?? 'es').toUpperCase(),
      };
    }).filter((x) => x.direccion || x.poblacion);
  } catch { return []; }
}

/** Sugerencias de dirección. Con Google traen solo el texto y su `place_id`: los datos se
 *  completan al elegir una (`completarDireccion`). */
export async function buscarDirecciones(q: string, sesion: string): Promise<Direccion[]> {
  if (CON_GOOGLE) {
    const r = await buscarDireccionesGoogle(q, sesion).catch(() => null);
    if (r?.activo) return r.lista.map((x) => ({ etiqueta: x.etiqueta, direccion: '', codigo_postal: '', poblacion: '', provincia: '', pais: 'ES', place_id: x.place_id }));
    return [];
  }
  return buscarLibre(q);
}

/** Los datos de la dirección elegida (con Google, una consulta; con la reserva ya vienen). */
export async function completarDireccion(d: Direccion, sesion: string): Promise<Direccion | null> {
  if (!d.place_id) return d;
  const r = await detalleDireccionGoogle(d.place_id, sesion).catch(() => null);
  return r ? { ...r, place_id: d.place_id } : null;
}
