// Cálculo del precio de un almacenamiento (mismo en la pantalla y en el servidor; el que
// vale es el del servidor). 1 a 7 días = 1 semana por tráiler; si se alarga, cada semana
// empezada cuenta entera. El reparto urbano, por camión.
export function diasAlmacen(entrada: string, salida: string): number {
  if (!entrada || !salida) return 0;
  const a = Date.UTC(+entrada.slice(0, 4), +entrada.slice(5, 7) - 1, +entrada.slice(8, 10));
  const b = Date.UTC(+salida.slice(0, 4), +salida.slice(5, 7) - 1, +salida.slice(8, 10));
  return Math.round((b - a) / 86400000);
}
export function semanasAlmacen(entrada: string, salida: string): number {
  return Math.max(1, Math.ceil(Math.max(diasAlmacen(entrada, salida), 1) / 7));
}
export function precioAlmacenamiento(
  d: { fecha_entrada: string; fecha_salida: string; num_trailers: number; num_repartos: number },
  tarifa: { semana: number; reparto: number },
): { semanas: number; almacenaje: number; reparto: number; total: number } {
  const semanas = semanasAlmacen(d.fecha_entrada, d.fecha_salida);
  const almacenaje = Math.round(d.num_trailers * semanas * tarifa.semana * 100) / 100;
  const reparto = Math.round(d.num_repartos * tarifa.reparto * 100) / 100;
  return { semanas, almacenaje, reparto, total: almacenaje + reparto };
}
