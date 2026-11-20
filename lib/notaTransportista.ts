// Nota automática del transportista (0 a 10), usuario 2026-11-20. La calcula cada noche la
// base de datos (recalcular_notas_transportistas); aquí solo se pinta. Solo la ve Dynamo.
export type NotaTransportista = {
  nota: number | null; envios: number; puntuales: number; con_fechas: number; cancelaciones: number;
  con_incidencia: number; valoracion: number | null; valoraciones: number; calculada_en: string;
};

export const notaTxt = (n: number | null | undefined) => (n == null ? null : Number(n).toFixed(1).replace('.', ','));
// Verde de 8 en adelante, ámbar de 5 a 8, rojo por debajo.
export const notaColor = (n: number | null | undefined) => (n == null ? 'var(--gray-500)' : n >= 8 ? '#15803d' : n >= 5 ? '#b45309' : '#b42318');
const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a * 100) / b)} %` : '—');

// Las piezas de la nota, en una línea cada una.
export function piezasNota(d: NotaTransportista): string[] {
  return [
    `Puntualidad: ${d.con_fechas ? `${d.puntuales} de ${d.con_fechas} (${pct(d.puntuales, d.con_fechas)})` : 'sin fechas para medirla'}`,
    `Nos dejó tirados: ${d.cancelaciones} ${d.cancelaciones === 1 ? 'vez' : 'veces'}`,
    `Envíos con incidencia: ${d.con_incidencia} de ${d.envios}`,
    `Valoraciones: ${d.valoracion != null ? `${Number(d.valoracion).toFixed(1).replace('.', ',')} de 5 (${d.valoraciones} voto${d.valoraciones === 1 ? '' : 's'})` : 'sin votos'}`,
  ];
}
