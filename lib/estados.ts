// Estados del envío: nombre y color en UN solo sitio para toda la web (lista, fichas,
// paneles, buscador, historial). El color es la clase CSS «badge-<color>» del panel.
// Los valores son los del tipo estado_envio de la base de datos (lib/supabase/tipos.ts).
import type { Enum, Funcion } from '@/lib/supabase/tipos';

export type EstadoEnvio = Enum<'estado_envio'>;

export const ESTADOS_ENVIO: Record<EstadoEnvio, { label: string; color: string }> = {
  borrador: { label: 'Borrador', color: 'prog' },
  programado: { label: 'Programado', color: 'prog' },
  hacia_la_carga: { label: 'Yendo a la carga', color: 'hacia' },
  cargando: { label: 'Cargando', color: 'cargando' },
  en_ruta: { label: 'En ruta', color: 'enruta' },
  entregado: { label: 'Entregado', color: 'entregado' },
  cancelado: { label: 'Cancelado', color: 'cancelada' },
};

/** Fases de un envío en marcha, en orden (las que se ven en la línea de progreso). */
export const FASES_ENVIO: EstadoEnvio[] = ['programado', 'hacia_la_carga', 'cargando', 'en_ruta', 'entregado'];
/** Con el camión ya en camino o cargado: no se modifica desde la plataforma. */
export const EN_MARCHA: EstadoEnvio[] = ['hacia_la_carga', 'cargando', 'en_ruta'];
export const enMarcha = (estado: string | null | undefined) => EN_MARCHA.includes(estado as EstadoEnvio);

export const nombreEstado = (estado: string | null | undefined) => ESTADOS_ENVIO[estado as EstadoEnvio]?.label ?? estado ?? '';
export const colorEstado = (estado: string | null | undefined) => ESTADOS_ENVIO[estado as EstadoEnvio]?.color ?? 'prog';

// ---- Etapas del seguimiento (usuario, 2026-11-06) -------------------------------------
// El estado avanza solo según el horario previsto (migración seguimiento_automatico) y lleva
// la parada: «Cargando (1.ª parada)», «En ruta a 2.ª parada», «Descargando (2.ª parada)».
export const ordinal = (n: number) => `${n}.ª`;
/** Una etapa del envío con su hora (etapas_envio). */
export type Etapa = Funcion<'etapas_envio'>[number];
export function etiquetaEtapa(estado: string | null | undefined, parada?: number | null, tipoParada?: string | null): { label: string; color: string } {
  if (estado === 'cargando') {
    const descarga = tipoParada === 'descarga';
    return { label: `${descarga ? 'Descargando' : 'Cargando'}${parada ? ` (${ordinal(parada)} parada)` : ''}`, color: descarga ? 'entrega' : 'cargando' };
  }
  if (estado === 'en_ruta') return { label: parada && parada >= 2 ? `En ruta a ${ordinal(parada)} parada` : 'En ruta', color: 'enruta' };
  return ESTADOS_ENVIO[estado as EstadoEnvio] ?? { label: estado ?? '', color: 'prog' };
}
/** Programado sin camión: «Asignando transportista» a menos de 36 h (lo dice la base de datos); con camión, «Confirmado». */
export const ESTADO_ASIGNANDO = { label: 'Asignando transportista', color: 'asignando' };
export const ESTADO_CONFIRMADO = { label: 'Confirmado', color: 'confirmado' };
