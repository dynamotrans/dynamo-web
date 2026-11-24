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
