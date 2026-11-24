// Mapa del envío con la POSICIÓN ESTIMADA del camión (usuario, 2026-11-22). La base de datos
// (mapa_envio) dice en qué tramo va y qué fracción lleva hecha (plan del seguimiento +
// tacógrafo + firmas del CMR); aquí se pasa eso a un punto del mapa y a una frase. Sin red: se
// prueba con pruebas unitarias.
import { fechaHora } from './formato';
import { partirLinea, trazadoEntre, type PuntoLinea } from './lineaRuta';

export type ParadaMapa = {
  orden: number; tipo: 'carga' | 'descarga' | string; empresa: string | null;
  poblacion: string | null; provincia: string | null; codigo_postal: string | null; pais: string | null;
  lat: number | null; lon: number | null; coord: 'sitio' | 'gps_firma' | 'codigo_postal' | 'sin';
  realizado_en: string | null;
  firmada_en?: string | null;   // primera firma (no extra) en el CMR de esa parada
  direccion?: string | null;
};
export type EtapaMapa = { paso: number; estado: string; parada: number | null; hora: string | null; hecha: boolean; actual: boolean };
export type CamionMapa = {
  modo: 'sin_salir' | 'hacia_carga' | 'en_parada' | 'en_ruta' | 'entregado' | 'cancelado';
  desde: number | null; hasta: number | null; fraccion: number | null; parado: boolean; retraso: boolean;
  salida: string | null; llegada_prevista: string | null;
  // Por qué está parado (2026-11-22): pausa de 45 min, descanso del conductor (de noche) o
  // espera para llegar (ya ha conducido todo el tramo y el sitio abre más tarde). Y cuándo sigue.
  motivo_parada?: 'pausa' | 'descanso' | 'espera' | null; sigue_en?: string | null;
};
export type MapaEnvio = {
  resultado: 'ok' | 'sin_permiso'; referencia: string | null; estado: string; ahora: string;
  paradas: ParadaMapa[]; etapas: EtapaMapa[]; camion: CamionMapa;
  gps_firma: { lat: number; lon: number; cuando: string; parada: number | null } | null;
  // El trazado por carretera de cada tramo («1-2»: de la parada 1 a la 2), si se tiene: lo
  // añade la pantalla cuando llega (ver trazadosDeEnvios). Sin él, el tramo es una recta.
  trazados?: Record<string, PuntoLinea[]>;
};
/** Los puntos de un tramo entre dos paradas: por la carretera si se tiene su trazado; si no, la recta. */
export function puntosTramo(m: MapaEnvio, a: ParadaMapa, b: ParadaMapa): PuntoLinea[] {
  return trazadoEntre([+a.lat!, +a.lon!], [+b.lat!, +b.lon!], m.trazados?.[`${a.orden}-${b.orden}`]);
}

export type PuntoCamion = { lat: number; lon: number; titulo: string; detalle: string; tono: 'gris' | 'azul' | 'ambar' | 'verde' | 'rojo' } | null;

const lugar = (p: ParadaMapa | undefined) => p?.poblacion || p?.empresa || (p ? `parada ${p.orden}` : '');
const conCoord = (p: ParadaMapa | undefined): p is ParadaMapa & { lat: number; lon: number } =>
  !!p && Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lon)) && p.lat !== null && p.lon !== null;

/** Hora de una etapa del plan (la de llegada a cargar/descargar en la parada n, o la de salida). */
function horaEtapa(m: MapaEnvio, estado: string, parada: number | null): string | null {
  return m.etapas.find((e) => e.estado === estado && e.parada === parada)?.hora ?? null;
}

/** Dónde pintar el camión y qué decir de él. null = no se pinta (aún no ha salido, cancelado o sin coordenadas). */
export function posicionCamion(m: MapaEnvio): PuntoCamion {
  const c = m.camion;
  const p = (n: number | null) => m.paradas.find((x) => x.orden === n);
  if (c.modo === 'cancelado') return null;
  if (c.modo === 'sin_salir') return null;
  if (c.modo === 'entregado') {
    const u = p(c.hasta);
    if (!conCoord(u)) return null;
    return { lat: +u.lat, lon: +u.lon, titulo: 'Entregado', detalle: `En ${lugar(u)}${u.realizado_en ? ` · ${fechaHora(u.realizado_en)}` : ''}`, tono: 'verde' };
  }
  if (c.modo === 'hacia_carga') {
    const u = p(1);
    if (!conCoord(u)) return null;
    const h = horaEtapa(m, 'cargando', 1);
    return { lat: +u.lat, lon: +u.lon, titulo: 'De camino a la carga', detalle: `Llegada prevista a ${lugar(u)}${h ? ` · ${fechaHora(h)}` : ''}`, tono: 'azul' };
  }
  if (c.modo === 'en_parada') {
    const u = p(c.hasta);
    if (!conCoord(u)) return null;
    const carga = u.tipo === 'carga';
    const sal = horaEtapa(m, 'en_ruta', (c.hasta ?? 0) + 1);
    return { lat: +u.lat, lon: +u.lon, titulo: carga ? 'Cargando' : 'Descargando', detalle: `En ${lugar(u)}${sal ? ` · salida prevista ${fechaHora(sal)}` : ''}`, tono: 'ambar' };
  }
  // En ruta: en la fracción del tramo entre las dos paradas, sobre la carretera si se tiene su
  // trazado (y si no, en la recta).
  const a = p(c.desde), b = p(c.hasta);
  if (!conCoord(a) || !conCoord(b)) return null;
  const f = Math.min(Math.max(Number(c.fraccion ?? 0), 0), 1);
  const corte = partirLinea(puntosTramo(m, a, b), f);
  const lat = corte ? corte.punto[0] : +a.lat + (+b.lat - +a.lat) * f, lon = corte ? corte.punto[1] : +a.lon + (+b.lon - +a.lon) * f;
  const llega = c.llegada_prevista ? fechaHora(c.llegada_prevista) : null;
  if (c.retraso) return { lat, lon, titulo: 'Llegando (va más tarde de lo previsto)', detalle: `A ${lugar(b)}${llega ? ` · estaba prevista a las ${llega}` : ''}`, tono: 'rojo' };
  if (c.parado) {
    const sigue = c.sigue_en ? fechaHora(c.sigue_en) : null;
    if (c.motivo_parada === 'espera') return { lat, lon, titulo: `Parado: esperando para llegar a ${lugar(b)}`, detalle: `Ya ha hecho el tramo desde ${lugar(a)}${llega ? ` · llegada prevista ${llega}` : ''}`, tono: 'gris' };
    const titulo = c.motivo_parada === 'pausa' ? 'Parado: pausa del conductor' : c.motivo_parada === 'descanso' ? 'Parado: descanso del conductor' : 'Parado: pausa o descanso del conductor';
    return { lat, lon, titulo, detalle: `Entre ${lugar(a)} y ${lugar(b)} (${Math.round(f * 100)} % del tramo)${sigue ? ` · sigue ${sigue}` : ''}${llega ? ` · llegada prevista ${llega}` : ''}`, tono: 'gris' };
  }
  return { lat, lon, titulo: `En ruta a ${lugar(b)}`, detalle: `${Math.round(f * 100)} % del tramo desde ${lugar(a)}${llega ? ` · llegada prevista ${llega}` : ''}`, tono: 'azul' };
}

/** Frase de estado para la cabecera de la ventana (también cuando no hay camión que pintar). */
export function estadoMapa(m: MapaEnvio): string {
  if (m.camion.modo === 'cancelado') return 'Envío cancelado.';
  if (m.camion.modo === 'sin_salir') {
    const h = horaEtapa(m, 'cargando', 1);
    return `Aún no ha salido${h ? `. Carga prevista: ${fechaHora(h)}` : ''}.`;
  }
  const pc = posicionCamion(m);
  if (!pc) return 'Sin coordenadas de las paradas: no se puede situar el camión.';
  return `${pc.titulo} · ${pc.detalle}`;
}

/** Clave de una parada para buscar sus coordenadas: país, código postal y población
 *  normalizados (la misma en el servidor y en la pantalla, y en geo_no_encontrados). */
export function claveParada(p: { pais: string | null; codigo_postal: string | null; poblacion: string | null }): string {
  return `${(p.pais || 'ES').toUpperCase()}|${(p.codigo_postal ?? '').replace(/\s/g, '').toUpperCase()}|${(p.poblacion ?? '').toLowerCase()}`;
}

export type HoraParada = { texto: string; real: boolean; corto: string };
/** «13/11 13:50» (hora de Madrid): para las etiquetas cortas del mapa. */
function diaHoraCorto(iso: string): string {
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date(iso));
  const v = (t: string) => p.find((x) => x.type === t)?.value ?? '';
  return `${v('day')}/${v('month')} ${v('hour') === '24' ? '00' : v('hour')}:${v('minute')}`;
}
/** La hora de una parada para el mapa: la REAL si ya se hizo —diciendo de dónde sale: firma del
 *  CMR, marcada en el seguimiento— o la PREVISTA del plan. */
export function horaParada(m: MapaEnvio, p: ParadaMapa): HoraParada | null {
  const verbo = p.tipo === 'carga' ? 'Cargado' : 'Descargado';
  if (p.firmada_en) return { texto: `✓ ${verbo} ${fechaHora(p.firmada_en)} · firmado en el CMR`, real: true, corto: `✓ ${verbo} ${diaHoraCorto(p.firmada_en)}` };
  if (p.realizado_en) return { texto: `✓ ${verbo} ${fechaHora(p.realizado_en)} · marcado en el seguimiento`, real: true, corto: `✓ ${verbo} ${diaHoraCorto(p.realizado_en)}` };
  const e = m.etapas.find((x) => x.estado === 'cargando' && x.parada === p.orden);
  if (!e?.hora) return null;
  if (e.hecha) return { texto: `✓ Llegó ${fechaHora(e.hora)} · según el seguimiento`, real: true, corto: `✓ Llegó ${diaHoraCorto(e.hora)}` };
  return { texto: `Prevista ${fechaHora(e.hora)}`, real: false, corto: `Prevista ${diaHoraCorto(e.hora)}` };
}

/** Etiqueta de una parada en el mapa, en varias líneas cortas (HTML ya escapado). */
export function etiquetaParada(m: MapaEnvio, p: ParadaMapa): string {
  const esc = (t: string | null | undefined) => (t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
  const h = horaParada(m, p);
  return [
    `<strong>${p.tipo === 'carga' ? 'Recogida' : 'Entrega'} ${p.orden}</strong>`,
    p.empresa ? esc(p.empresa) : '',
    esc([p.codigo_postal, p.poblacion].filter(Boolean).join(' ')),
    h ? `<span style="color:${h.real ? '#15803d' : '#6b7280'};font-weight:700">${esc(h.texto)}</span>` : '',
  ].filter(Boolean).join('<br>');
}

/** Etiqueta CORTA (dos líneas) para cuando la larga no cabe sin pisar a otra (usuario,
 *  2026-11-23: «se pisan los carteles»): «Recogida 1 · Bruxelles» y la hora corta. */
export function etiquetaParadaCorta(m: MapaEnvio, p: ParadaMapa): string {
  const esc = (t: string | null | undefined) => (t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
  const h = horaParada(m, p);
  const lugar = p.poblacion || p.empresa;
  return [
    `<strong>${p.tipo === 'carga' ? 'Recogida' : 'Entrega'} ${p.orden}</strong>${lugar ? ` · ${esc(lugar)}` : ''}`,
    h ? `<span style="color:${h.real ? '#15803d' : '#6b7280'};font-weight:700">${esc(h.corto)}</span>` : '',
  ].filter(Boolean).join('<br>');
}
