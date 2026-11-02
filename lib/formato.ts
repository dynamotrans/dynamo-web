// Formatos de la plataforma. Reglas de CLAUDE.md:
//  · regla 0: precios SIEMPRE con 2 decimales, formato es-ES ("1.020,00 €").
//  · fecha única "Vie 10/07/26" (bitácora 2026-07-12), mostrada en hora de Madrid (regla 12).

export function euros(n: number | string | null | undefined): string {
  if (n === null || n === undefined || n === '') return '—';
  const v = typeof n === 'string' ? Number(n) : n;
  if (!Number.isFinite(v)) return '—';
  return v.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
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

export const ESTADO_ASIGNACION: Record<string, string> = {
  sin_asignar: 'Sin asignar',
  ofertada: 'Ofertada',
  reservada: 'Reservándose',
  confirmada: 'Transportista confirmado',
};

export const ROL: Record<string, string> = {
  admin: 'Administrador',
  empleado: 'Empleado',
  cliente: 'Cliente',
  transportista: 'Transportista',
};
