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

// MAPA GENERAL (usuario, 2026-11-22): todos los envíos en programación o en marcha que ve quien
// pregunta (Dynamo, todos; el cliente, los suyos). Las paradas sin coordenadas se sitúan por su
// código postal: como mucho 4 códigos nuevos por vez (1 por segundo, norma de OpenStreetMap);
// los demás se completan en las siguientes actualizaciones.
export type EnvioMapa = MapaEnvio & { id: string; cliente: string | null; fecha_carga: string | null };
export async function mapaEnviosEnCurso(): Promise<{ ok: true; envios: EnvioMapa[] } | { ok: false; error: string }> {
  comprobarEntrada("app/panel/(app)/envios/acciones-mapa#mapaEnviosEnCurso", []);
  const s = await sesion();
  if (!s) return { ok: false, error: 'No se ha podido conectar.' };
  const { data, error } = await s.supabase.rpc('mapa_envios_en_curso');
  if (error) return { ok: false, error: 'No se ha podido cargar el mapa.' };
  const envios = ((data ?? []) as unknown as EnvioMapa[]).filter((e) => e.resultado === 'ok');
  const faltan = new Map<string, { pais: string; cp: string; poblacion: string | null }>();
  for (const e of envios) for (const p of e.paradas) {
    if ((p.lat == null || p.lon == null) && p.codigo_postal) faltan.set(`${p.pais ?? 'ES'}|${p.codigo_postal}`, { pais: p.pais ?? 'ES', cp: p.codigo_postal, poblacion: p.poblacion });
  }
  const srv = faltan.size ? supabaseServicio() : null;
  if (srv) {
    const hallados = new Map<string, { lat: number; lon: number }>();
    for (const [k, v] of [...faltan].slice(0, 4)) {
      const c = await centroCodigoPostal(v.pais, v.cp, v.poblacion);
      if (!c) continue;
      hallados.set(k, c);
      await srv.rpc('guardar_geo_cp', { p_pais: v.pais, p_cp: v.cp, p_lat: c.lat, p_lon: c.lon });
    }
    for (const e of envios) for (const p of e.paradas) {
      const c = hallados.get(`${p.pais ?? 'ES'}|${p.codigo_postal}`);
      if (c && (p.lat == null || p.lon == null)) { p.lat = c.lat; p.lon = c.lon; p.coord = 'codigo_postal'; }
    }
  }
  return { ok: true, envios };
}
