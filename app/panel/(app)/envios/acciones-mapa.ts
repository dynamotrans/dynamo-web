'use server';

import { sesion } from '@/lib/sesion';
import { comprobarEntrada } from '@/lib/entradas/comprobar';
import { situarConCache } from '@/lib/servidor/geocodificar';
import { claveParada, type MapaEnvio } from '@/lib/mapaEnvio';

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
  // Por su código postal (y se guarda); si no, por población/provincia o por la dirección.
  // Sin repetir las que no se encontraron hace poco (así no se espera cada vez).
  const faltan = m.paradas.filter((p) => p.lat == null || p.lon == null);
  if (faltan.length) {
    const h = await situarConCache(faltan, 4);
    for (const p of faltan) { const c = h.get(claveParada(p)); if (c) { p.lat = c.lat; p.lon = c.lon; p.coord = 'codigo_postal'; } }
  }
  return { ok: true, mapa: m };
}

// MAPA GENERAL (usuario, 2026-11-22): todos los envíos en programación o en marcha que ve quien
// pregunta (Dynamo, todos; el cliente, los suyos). Sale AL MOMENTO (usuario, 2026-11-22: tardaba
// 5 s): las paradas sin coordenadas no se buscan aquí, sino después con situarParadasDelMapa.
export type EnvioMapa = MapaEnvio & { id: string; cliente: string | null; fecha_carga: string | null };
export async function mapaEnviosEnCurso(): Promise<{ ok: true; envios: EnvioMapa[] } | { ok: false; error: string }> {
  comprobarEntrada("app/panel/(app)/envios/acciones-mapa#mapaEnviosEnCurso", []);
  const s = await sesion();
  if (!s) return { ok: false, error: 'No se ha podido conectar.' };
  const { data, error } = await s.supabase.rpc('mapa_envios_en_curso');
  if (error) return { ok: false, error: 'No se ha podido cargar el mapa.' };
  return { ok: true, envios: ((data ?? []) as unknown as EnvioMapa[]).filter((e) => e.resultado === 'ok') };
}

// Las coordenadas que faltan en el mapa general, aparte y sin hacer esperar: como mucho 4 por
// vez (1 por segundo, norma de OpenStreetMap). Las paradas las dice la base de datos (las de los
// envíos que ve quien pregunta), nunca la pantalla. Devuelve lo encontrado por claveParada.
export async function situarParadasDelMapa(): Promise<{ ok: true; hallados: Record<string, { lat: number; lon: number }> } | { ok: false }> {
  comprobarEntrada("app/panel/(app)/envios/acciones-mapa#situarParadasDelMapa", []);
  const s = await sesion();
  if (!s) return { ok: false };
  const { data, error } = await s.supabase.rpc('mapa_paradas_sin_coordenadas');
  if (error) return { ok: false };
  type P = { pais: string | null; codigo_postal: string | null; poblacion: string | null; provincia: string | null; direccion: string | null };
  const h = await situarConCache((data ?? []) as unknown as P[], 4);
  return { ok: true, hallados: Object.fromEntries(h) };
}
