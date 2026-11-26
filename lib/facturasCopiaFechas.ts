// Cuentas de fechas (AAAA-MM-DD, sin horas ni zonas) de la copia de facturas emitidas.
// Sin red y sin claves, para poder probarlas.
const aFecha = (d: string) => new Date(`${d}T00:00:00Z`);
const aTexto = (f: Date) => f.toISOString().slice(0, 10);

/** El día que resulta de sumar (o restar, en negativo) días naturales. */
export function diaMas(d: string, dias: number): string {
  const f = aFecha(d); f.setUTCDate(f.getUTCDate() + dias); return aTexto(f);
}
/** El mismo día de `meses` meses atrás; si ese mes no lo tiene (31 → 30), su último día. */
export function mesesAtras(d: string, meses: number): string {
  const f = aFecha(d), dia = f.getUTCDate();
  f.setUTCDate(1); f.setUTCMonth(f.getUTCMonth() - meses);
  const ultimo = new Date(Date.UTC(f.getUTCFullYear(), f.getUTCMonth() + 1, 0)).getUTCDate();
  f.setUTCDate(Math.min(dia, ultimo));
  return aTexto(f);
}
/** El último día del mes de esa fecha. */
export function finDeMes(d: string): string {
  const f = aFecha(d);
  return aTexto(new Date(Date.UTC(f.getUTCFullYear(), f.getUTCMonth() + 1, 0)));
}
