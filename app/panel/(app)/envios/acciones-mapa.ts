'use server';

import { sesion } from '@/lib/sesion';
import { comprobarEntrada } from '@/lib/entradas/comprobar';
import { situarConCache } from '@/lib/servidor/geocodificar';
import { claveParada, type MapaEnvio } from '@/lib/mapaEnvio';
import { supabaseServicio } from '@/lib/supabase/servicio';
import { googleRutasListo, rutaGoogle } from '@/lib/servidor/googleRutas';
import { lineaEncaja, type Trazados } from '@/lib/lineaRuta';

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
// vez. Las paradas las dice la base de datos (las de los
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

// RUTAS PINTADAS POR CARRETERA (usuario, 2026-11-24). De los envíos pedidos que ve quien
// pregunta (lo comprueba la base de datos), el trazado de cada tramo entre paradas. Los que ya
// están guardados salen al momento; de los que faltan se piden a Google como mucho 6 por vez
// (y se guardan, entre sitios y entre códigos postales: el mismo origen-destino no se vuelve
// a pedir, ni a la ida ni a la vuelta). `faltan` dice cuántos quedan
// para la próxima actualización del mapa. Sin clave de Google, o sin consultas por hoy, los
// tramos que falten se quedan en línea recta.
type TramoGuardado = {
  envio: string; desde: number; hasta: number; linea: string | null; invertida?: boolean; a: [number, number]; b: [number, number];
  sitio_a: string | null; sitio_b: string | null; pais_a: string | null; cp_a: string | null; pais_b: string | null; cp_b: string | null;
  fila_sitios: string | null; fila_cp: string | null;
  mala?: boolean;   // traía una línea guardada que no era de este tramo (se vuelve a pedir)
};
const POR_VEZ = 6;
export async function trazadosDeEnvios(envios: string[]): Promise<({ ok: true; faltan: number } & Trazados) | { ok: false }> {
  comprobarEntrada("app/panel/(app)/envios/acciones-mapa#trazadosDeEnvios", [envios]);
  const s = await sesion();
  if (!s) return { ok: false };
  const { data, error } = await s.supabase.rpc('mapa_trazados', { p_envios: envios.slice(0, 400) });
  if (error) return { ok: false };
  const tramos = (data ?? []) as unknown as TramoGuardado[];
  // Una línea guardada que no empieza y acaba junto a las paradas de su tramo NO es su ruta
  // (usuario, 2026-11-24: un Granada → Castellón pintado por Madrid y Murcia; se había calculado
  // con el texto de una dirección que Google situó en otro sitio). Se descarta y se pide de
  // nuevo por coordenadas; hasta entonces, línea recta.
  for (const t of tramos) if (t.linea && !lineaEncaja(t.linea, t.a, t.b, !!t.invertida)) { t.linea = null; t.invertida = false; t.mala = true; }
  // Dónde se guarda cada tramo: entre sus dos sitios si lo son; si no, entre sus códigos postales.
  const clave = (t: TramoGuardado) => (t.sitio_a && t.sitio_b ? `s|${t.sitio_a}|${t.sitio_b}`
    : t.cp_a && t.cp_b && t.pais_a && t.pais_b ? `c|${t.pais_a}|${t.cp_a}|${t.pais_b}|${t.cp_b}` : null);
  const pendientes = new Map<string, TramoGuardado>();
  for (const t of tramos) { const k = t.linea ? null : clave(t); if (k && !pendientes.has(k)) pendientes.set(k, t); }
  const nuevas = new Map<string, string>();
  let faltan = 0;
  const srv = supabaseServicio();
  if (pendientes.size && srv && googleRutasListo()) {
    const tanda = [...pendientes].slice(0, POR_VEZ);
    let limite = false;
    await Promise.all(tanda.map(async ([k, t]) => {
      const g = await rutaGoogle({ lat: t.a[0], lon: t.a[1] }, { lat: t.b[0], lon: t.b[1] });
      if (!g.ok) { limite ||= g.limite; return; }
      if (!g.linea || g.linea.length > 60000) return;
      nuevas.set(k, g.linea);
      // Se guarda con sus kilómetros; si la distancia ya estaba guardada, solo se le añade la
      // línea. Entre sus dos sitios Y entre sus dos códigos postales (usuario, 2026-11-24): así
      // la aprovecha cualquier otra empresa de esos mismos códigos, a la ida y a la vuelta.
      // Si lo guardado era de otra ruta (`mala`), se corrigen también sus kilómetros; y entre dos
      // sitios no se toca lo de sus códigos postales, que puede estar bien y lo usan otros.
      if (t.sitio_a && t.sitio_b) {
        const id = (!t.mala && t.fila_sitios) || (await srv.rpc('guardar_km_sitios', { p_origen: t.sitio_a, p_destino: t.sitio_b, p_km: g.km, p_minutos: g.minutos, p_proveedor: 'google_routes' })).data;
        if (id) await srv.from('distancias_sitios').update({ linea: g.linea }).eq('id', id);
        if (t.mala) return;
      }
      if (t.mala && t.cp_a && t.cp_b && t.pais_a && t.pais_b) {
        const id = (await srv.rpc('guardar_km_cp', { p_pais_codigo_iso_origen: t.pais_a, p_codigo_postal_origen: t.cp_a,
          p_pais_codigo_iso_destino: t.pais_b, p_codigo_postal_destino: t.cp_b, p_km: g.km, p_minutos: g.minutos, p_proveedor: 'google_routes' })).data;
        if (id) await srv.from('distancias_cp').update({ linea: g.linea }).eq('id', id);
        return;
      }
      if (t.cp_a && t.cp_b && t.pais_a && t.pais_b) {
        const id = t.fila_cp ?? (await srv.rpc('guardar_km_cp', { p_pais_codigo_iso_origen: t.pais_a, p_codigo_postal_origen: t.cp_a,
          p_pais_codigo_iso_destino: t.pais_b, p_codigo_postal_destino: t.cp_b, p_km: g.km, p_minutos: g.minutos, p_proveedor: 'google_routes' })).data;
        if (id) await srv.from('distancias_cp').update({ linea: g.linea }).eq('id', id).is('linea', null);
      }
    }));
    // Sin consultas por hoy: Dynamo se entera y lo que falte se queda en línea recta.
    if (limite) await s.supabase.rpc('aviso_limite_api', { p_api: 'kilometros' }).then(() => null, () => null);
    else faltan = pendientes.size - tanda.length;
  }
  // Cada línea se manda una sola vez (muchos envíos repiten ruta).
  const lineas: string[] = [], indice = new Map<string, number>();
  const salida: Trazados['tramos'] = [];
  for (const t of tramos) {
    const k = clave(t);
    const l = t.linea ?? (k ? nuevas.get(k) : undefined);
    if (!l) continue;
    let i = indice.get(l);
    if (i === undefined) { i = lineas.push(l) - 1; indice.set(l, i); }
    salida.push({ envio: t.envio, desde: t.desde, hasta: t.hasta, linea: i, ...(t.linea && t.invertida ? { alreves: true } : {}) });
  }
  return { ok: true, lineas, tramos: salida, faltan };
}
