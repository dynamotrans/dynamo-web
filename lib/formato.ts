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

const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

// Fechas tipo "2026-07-10" (columnas `date`): se leen como día de calendario, sin zona.
export function fecha(d: string | null | undefined): string {
  if (!d) return '—';
  const [a, m, dia] = d.slice(0, 10).split('-').map(Number);
  const f = new Date(Date.UTC(a, m - 1, dia));
  return `${DIAS[f.getUTCDay()]} ${String(dia).padStart(2, '0')}/${String(m).padStart(2, '0')}/${String(a).slice(2)}`;
}

export function ventana(desde: string | null, hasta: string | null): string {
  if (!desde) return 'Sin fecha';
  if (!hasta || hasta === desde) return fecha(desde);
  return `${fecha(desde)} – ${fecha(hasta)}`;
}

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
