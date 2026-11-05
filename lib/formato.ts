// Formatos de la plataforma. Reglas de CLAUDE.md:
//  · regla 0: precios SIEMPRE con 2 decimales, formato es-ES ("1.020,00 €").
//  · fecha única "Vie 10/07/26" (bitácora 2026-07-12), mostrada en hora de Madrid (regla 12).

export function euros(n: number | string | null | undefined): string {
  if (n === null || n === undefined || n === '') return '—';
  const v = typeof n === 'string' ? Number(n) : n;
  if (!Number.isFinite(v)) return '—';
  return importe(v) + ' €';
}

// "1.230,00": 2 decimales y punto de miles SIEMPRE. (toLocaleString('es-ES') no pone el
// punto en los números de 4 cifras — "1230,00" —, por eso se hace a mano.)
export function importe(v: number): string {
  const [ent, dec] = Math.abs(v).toFixed(2).split('.');
  return (v < 0 ? '-' : '') + ent.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + dec;
}

// El día de hoy (o dentro de n días) en hora de Madrid, como AAAA-MM-DD (regla 12).
// No usar new Date().toISOString().slice(0, 10): eso es el día en UTC, y entre las 0:00 y
// las 2:00 de Madrid todavía dice «ayer».
export function hoyMadrid(masDias = 0): string {
  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date());
  if (!masDias) return hoy;
  const d = new Date(`${hoy}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + masDias);
  return d.toISOString().slice(0, 10);
}

// «1.050,50» → 1050.5 (quita el punto de miles y usa la coma decimal). Vacío → null;
// texto que no es número → NaN.
export function aNumero(t: string | null | undefined): number | null {
  const v = String(t ?? '').trim(); if (!v) return null;
  const n = Number(v.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
}

// 1234.5 → «1.234,50»: punto de miles, coma decimal y SIEMPRE los decimales que se pidan.
export function numero(v: number | string | null | undefined, decimales = 2): string {
  if (v === null || v === undefined || v === '') return '';
  const n = typeof v === 'string' ? Number(v) : v;
  if (!Number.isFinite(n)) return '';
  const [ent, dec] = Math.abs(n).toFixed(decimales).split('.');
  return (n < 0 ? '-' : '') + ent.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + (decimales ? ',' + dec : '');
}
// Pesos (regla del usuario, 2026-11-05): toneladas con 2 decimales, kilos sin decimales.
export const pesoTn = (t: number | string | null | undefined) => (t == null || t === '' ? '' : `${numero(t, 2)} Tn`);
export const pesoKg = (kg: number | string | null | undefined) => (kg == null || kg === '' ? '' : `${numero(kg, 0)} kg`);

const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

// Fechas tipo "2026-07-10" (columnas `date`): se leen como día de calendario, sin zona.
export function fecha(d: string | null | undefined): string {
  if (!d) return '—';
  const [a, m, dia] = d.slice(0, 10).split('-').map(Number);
  const f = new Date(Date.UTC(a, m - 1, dia));
  return `${DIAS[f.getUTCDay()]} ${String(dia).padStart(2, '0')}/${String(m).padStart(2, '0')}/${String(a).slice(2)}`;
}

// El día (en Madrid) de un instante (timestamptz): «Vie 10/07/26».
export function fechaDe(iso: string | null | undefined): string {
  if (!iso) return '—';
  return fecha(new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date(iso)));
}

// Fecha y hora de un instante, en Madrid: «Vie 03/11/26 · 09:41» (decisión del usuario,
// 2026-11-05: el mismo formato de fecha en todo, con el día de la semana).
export function fechaHora(iso: string | null | undefined): string {
  if (!iso) return '';
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date(iso));
  const v = (t: string) => p.find((x) => x.type === t)?.value ?? '';
  return `${fecha(`${v('year')}-${v('month')}-${v('day')}`)} · ${v('hour') === '24' ? '00' : v('hour')}:${v('minute')}`;
}

// Hace cuánto: «ahora», «hace 5 min», «hace 3 h», «ayer · 17:30» y, si es más viejo, la fecha y hora.
export function haceTxt(iso: string | null | undefined, ahora = new Date()): string {
  if (!iso) return '';
  const min = Math.round((ahora.getTime() - new Date(iso).getTime()) / 60000);
  if (min < 1) return 'ahora';
  if (min < 60) return `hace ${min} min`;
  if (min < 12 * 60) return `hace ${Math.round(min / 60)} h`;
  if (fechaDe(iso) === fechaDe(new Date(ahora.getTime() - 86400000).toISOString())) return `ayer · ${fechaHora(iso).slice(-5)}`;
  return fechaHora(iso);
}

// Ventana de fechas: «Vie 10/07/26» o «del Vie 10/07/26 al Lun 13/07/26» (con raya se leía
// como dos fechas alternativas). Sin fecha: «Por confirmar».
export function ventana(desde: string | null | undefined, hasta?: string | null): string {
  if (!desde) return 'Por confirmar';
  if (!hasta || hasta === desde) return fecha(desde);
  return `del ${fecha(desde)} al ${fecha(hasta)}`;
}

// Metros lineales con 2 decimales («13,30 m»), como las toneladas (decisión del usuario).
export const metros = (m: number | string | null | undefined) => (m == null || m === '' ? '' : `${numero(m, 2)} m`);
// «13,30 m · 20,50 Tn», sin separadores sueltos si falta uno.
export const medidasTxt = (m: number | string | null | undefined, t: number | string | null | undefined) =>
  [metros(m), pesoTn(t)].filter(Boolean).join(' · ');
// «21 %» (sin decimales si es entero; si no, con 2).
export const porcentaje = (v: number | string | null | undefined) => {
  if (v == null || v === '') return '';
  const n = Number(v);
  return `${numero(n, Number.isInteger(n) ? 0 : 2)} %`;
};

export const ESTADO_ENVIO: Record<string, string> = {
  borrador: 'Borrador',
  programado: 'Programado',
  hacia_la_carga: 'Hacia la carga',
  cargando: 'Cargando',
  en_ruta: 'En ruta',
  entregado: 'Entregado',
  cancelado: 'Cancelado',
};

export const ROL: Record<string, string> = {
  admin: 'Admin Master',
  empleado: 'Empleado gestor',
  admin_lectura: 'Admin lectura',
  empleado_lectura: 'Empleado lectura',
  cliente: 'Cliente',
  transportista: 'Transportista',
};
