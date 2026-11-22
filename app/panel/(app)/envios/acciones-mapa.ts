'use server';

import { sesion } from '@/lib/sesion';
import { supabaseServicio } from '@/lib/supabase/servicio';
import { comprobarEntrada } from '@/lib/entradas/comprobar';
import { centroCodigoPostal } from '@/lib/servidor/geocodificar';
import type { MapaEnvio } from '@/lib/mapaEnvio';

// Mapa del envío (usuario, 2026-11-22): lo puede abrir quien ve el envío (Dynamo, el cliente
// dueño o su transportista; lo comprueba la base de datos). Si alguna parada no tiene
// coordenadas, se busca el centro de su código postal (solo la primera vez: queda guardado).
export async function mapaDelEnvio(envio: string): Promise<{ ok: true; mapa: MapaEnvio } | { ok: false; error: string }> {
  comprobarEntrada("app/panel/(app)/envios/acciones-mapa#mapaDelEnvio", [envio]);
  const s = await sesion();
  if (!s) return { ok: false, error: 'No se ha podido conectar.' };
  const { data, error } = await s.supabase.rpc('mapa_envio', { p_envio: envio });
  const m = (error ? null : data) as MapaEnvio | null;
  if (!m || m.resultado !== 'ok') return { ok: false, error: 'No se puede ver el mapa de este envío.' };
  const faltan = m.paradas.filter((p) => (p.lat == null || p.lon == null) && p.codigo_postal).slice(0, 4);
  const srv = faltan.length ? supabaseServicio() : null;
  for (const p of srv ? faltan : []) {
    const c = await centroCodigoPostal(p.pais ?? 'ES', p.codigo_postal!, p.poblacion);
    if (!c) continue;
    p.lat = c.lat; p.lon = c.lon; p.coord = 'codigo_postal';
    await srv!.rpc('guardar_geo_cp', { p_pais: p.pais ?? 'ES', p_cp: p.codigo_postal!, p_lat: c.lat, p_lon: c.lon });
  }
  return { ok: true, mapa: m };
}
