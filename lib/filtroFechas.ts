// Filtro de FECHA único para todos los listados con fecha (usuario, 2026-11-21: «en todos los
// listados de penalizaciones, envíos, proformas, administración, incidencias… este tipo de
// filtro de fecha, y entre fechas que salgan los calendarios»). Todo en días aaaa-mm-dd,
// ambos extremos incluidos, contando «hoy» en hora de Madrid.
import { rangoRapido } from './envios';

export type OpcionFecha = { v: string; t: string };

/** Opciones del desplegable. `futuro`: añade mañana, la semana y el mes que vienen (envíos, almacenamientos). */
export function opcionesFiltroFecha(futuro = false): OpcionFecha[] {
  const o: (OpcionFecha | false)[] = [
    { v: 'hoy', t: 'Hoy' }, { v: 'ayer', t: 'Ayer' }, futuro && { v: 'manana', t: 'Mañana' },
    { v: 'esta-semana', t: 'Esta semana' }, { v: 'semana-pasada', t: 'Semana pasada' }, futuro && { v: 'proxima-semana', t: 'Próxima semana' },
    { v: 'ult7', t: 'Últimos 7 días' },
    { v: 'mes', t: 'Este mes' }, { v: 'mes-pasado', t: 'Mes pasado' }, futuro && { v: 'mes-proximo', t: 'Mes que viene' },
    { v: 'trim', t: 'Este trimestre' }, { v: 'trim-pasado', t: 'Trimestre pasado' },
    { v: 'anio', t: 'Este año' }, { v: 'anio-pasado', t: 'Año pasado' },
    { v: 'entre', t: 'Entre dos fechas…' },
  ];
  return o.filter(Boolean) as OpcionFecha[];
}

const DIA = /^\d{4}-\d{2}-\d{2}$/;
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** ¿Es un valor que el filtro entiende? (también los meses «aaaa-mm» de enlaces antiguos). */
export function filtroFechaValido(fr: string): boolean {
  return fr === '' || /^\d{4}-\d{2}$/.test(fr) || ['manana', 'proxima-semana', 'mes-proximo'].includes(fr) || opcionesFiltroFecha().some((o) => o.v === fr);
}

/** Desde y hasta (incluidos) del filtro; null si no filtra. En «entre», cualquiera de los dos puede faltar. */
export function rangoFiltroFecha(fr: string, hoy: string, desde = '', hasta = ''): { desde: string | null; hasta: string | null } | null {
  if (!fr) return null;
  if (fr === 'entre') {
    const d = DIA.test(desde) ? desde : null, h = DIA.test(hasta) ? hasta : null;
    return d || h ? { desde: d, hasta: h } : null;
  }
  const [a, m, dd] = hoy.split('-').map(Number);
  const t = Math.floor((m - 1) / 3) * 3;
  switch (fr) {
    case 'ult7': return { desde: iso(new Date(a, m - 1, dd - 6)), hasta: hoy };
    case 'mes': return { desde: iso(new Date(a, m - 1, 1)), hasta: iso(new Date(a, m, 0)) };
    case 'mes-pasado': return { desde: iso(new Date(a, m - 2, 1)), hasta: iso(new Date(a, m - 1, 0)) };
    case 'mes-proximo': return { desde: iso(new Date(a, m, 1)), hasta: iso(new Date(a, m + 1, 0)) };
    case 'trim': return { desde: iso(new Date(a, t, 1)), hasta: iso(new Date(a, t + 3, 0)) };
    case 'trim-pasado': return { desde: iso(new Date(a, t - 3, 1)), hasta: iso(new Date(a, t, 0)) };
    case 'anio': return { desde: `${a}-01-01`, hasta: `${a}-12-31` };
    case 'anio-pasado': return { desde: `${a - 1}-01-01`, hasta: `${a - 1}-12-31` };
    default: return rangoRapido(fr, hoy);
  }
}

/** ¿El día (aaaa-mm-dd) cae dentro del filtro? Sin filtro, siempre sí; sin día, no. */
export function enRango(dia: string | null | undefined, r: { desde: string | null; hasta: string | null } | null): boolean {
  if (!r) return true;
  if (!dia) return false;
  const d = dia.slice(0, 10);
  return (!r.desde || d >= r.desde) && (!r.hasta || d <= r.hasta);
}

/** Hoy en Madrid, aaaa-mm-dd. */
export const hoyMadrid = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date());
/** Día en Madrid de una fecha y hora. */
export const diaMadridDe = (ts: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date(ts));
