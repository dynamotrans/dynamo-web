// Estados del envío: nombre y color en UN solo sitio para toda la web (lista, fichas,
// paneles, buscador, historial). El color es la clase CSS «badge-<color>» del panel.
// Los valores son los del tipo estado_envio de la base de datos (lib/supabase/tipos.ts).
import type { Enum } from '@/lib/supabase/tipos';

export type EstadoEnvio = Enum<'estado_envio'>;

export const ESTADOS_ENVIO: Record<EstadoEnvio, { label: string; color: string }> = {
  borrador: { label: 'Borrador', color: 'prog' },
  programado: { label: 'Programado', color: 'prog' },
  hacia_la_carga: { label: 'Hacia la carga', color: 'hacia' },
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
