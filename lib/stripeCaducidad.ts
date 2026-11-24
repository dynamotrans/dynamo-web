// HASTA CUÁNDO VIVE UN ENLACE DE PAGO CON TARJETA (usuario, 2026-11-24: «ese enlace debe
// caducar… 60 y 5 adicionales por si está en proceso de pago»).
// El enlace vive hasta el final del plazo para pagar más el margen. Pero Stripe no deja que
// un enlace viva menos de 30 minutos ni más de 24 horas: el que se abre con poco plazo por
// delante dura lo mínimo que Stripe permite, y el envío espera a que caduque antes de
// anularse (la base de datos lo sabe porque el servidor le apunta esta misma hora).
// `tanda`: el tramo de 10 minutos de la clave de idempotencia. Los topes se cuentan desde su
// inicio para que dos clics seguidos pidan exactamente lo mismo (si no, Stripe rechaza el
// segundo); por eso el mínimo es «tanda + 41 min»: entre 31 y 41 minutos desde ahora.
export const TANDA_MS = 600_000;
export function caducidadEnlace(limite: Date | null | undefined, ahora: number, graciaMin: number): { tanda: number; caduca: number | null } {
  const tanda = Math.floor(ahora / TANDA_MS) * TANDA_MS;
  if (!limite || Number.isNaN(limite.getTime())) return { tanda, caduca: null };
  const gracia = Math.max(0, Number.isFinite(graciaMin) ? graciaMin : 0) * 60_000;
  const t = Math.min(Math.max(limite.getTime() + gracia, tanda + 41 * 60_000), tanda + 23.5 * 3_600_000);
  return { tanda, caduca: Math.floor(t / 1000) * 1000 };
}

// CORTE DEL ENLACE AL ACABAR EL PLAZO (usuario, 2026-11-24: «corte duro del enlace al minuto
// 65»). Pasado el plazo y su margen, el servidor ordena a Stripe cerrar los enlaces abiertos
// del envío. Qué ha pasado con cada uno:
//   · 'cerrada': Stripe la ha cerrado ahora, o ya estaba caducada.
//   · 'pagada':  está completada: el cliente pagó; el pago entra por su camino normal.
//   · 'fallo':   no se sabe (Stripe no contesta, sigue abierta…).
export type CierreSesion = 'cerrada' | 'pagada' | 'fallo';
export function lecturaCierre(cerradaAhora: boolean, estado: string | undefined): CierreSesion {
  if (estado === 'complete') return 'pagada';
  if (cerradaAhora || estado === 'expired') return 'cerrada';
  return 'fallo';
}
// Qué se hace con el envío visto el resultado de TODOS sus enlaces:
//   · 'anular':  todos cerrados → el envío deja de esperar y se anula al momento.
//   · 'pagado':  alguno está pagado → no se toca nada (el aviso de Stripe lo deja pagado).
//   · 'esperar': alguno sin aclarar, o no hay ninguno apuntado → como antes, el envío espera
//                a que el enlace caduque solo. Nunca se anula sin estar seguros.
export function decisionCorte(resultados: CierreSesion[]): 'anular' | 'pagado' | 'esperar' {
  if (resultados.includes('pagada')) return 'pagado';
  if (!resultados.length || resultados.includes('fallo')) return 'esperar';
  return 'anular';
}
