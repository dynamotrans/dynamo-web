// Periodos del filtro de facturas (Administración → Facturas, Dynamo). Fechas aaaa-mm-dd.
export type PeriodoFacturas = 'todo' | 'semana' | 'mes' | 'mes-ant' | 'trim' | 'trim-ant' | 'anio' | 'anio-ant' | 'otro';
export const PERIODOS_FACTURAS: [PeriodoFacturas, string][] = [
  ['todo', 'Todas las fechas'], ['semana', 'Última semana'], ['mes', 'Este mes'], ['mes-ant', 'Mes pasado'],
  ['trim', 'Este trimestre'], ['trim-ant', 'Trimestre pasado'], ['anio', 'Este año'], ['anio-ant', 'Año pasado'], ['otro', 'Entre dos fechas…'],
];

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Desde y hasta (incluidos) de un periodo, contando desde «hoy»; null = sin límite. */
export function rangoPeriodo(p: PeriodoFacturas, hoy: Date, desde = '', hasta = ''): [string | null, string | null] {
  const y = hoy.getFullYear(), m = hoy.getMonth(), t = Math.floor(m / 3) * 3;
  switch (p) {
    case 'semana': return [iso(new Date(y, m, hoy.getDate() - 6)), iso(hoy)];
    case 'mes': return [iso(new Date(y, m, 1)), iso(new Date(y, m + 1, 0))];
    case 'mes-ant': return [iso(new Date(y, m - 1, 1)), iso(new Date(y, m, 0))];
    case 'trim': return [iso(new Date(y, t, 1)), iso(new Date(y, t + 3, 0))];
    case 'trim-ant': return [iso(new Date(y, t - 3, 1)), iso(new Date(y, t, 0))];
    case 'anio': return [`${y}-01-01`, `${y}-12-31`];
    case 'anio-ant': return [`${y - 1}-01-01`, `${y - 1}-12-31`];
    case 'otro': return [desde || null, hasta || null];
    default: return [null, null];
  }
}
