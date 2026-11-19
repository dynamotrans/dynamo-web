// Cuánto queda hasta una hora límite, dicho como lo diría una persona. Lo usa el
// temporizador del plazo para pagar un envío (ficha, lista de envíos y proformas).

export type Queda = { vencido: boolean; urgente: boolean; texto: string; cadaMs: number };

const dos = (n: number) => String(n).padStart(2, '0');

/** `limite`: la hora tope (ISO). `ahora`: milisegundos (Date.now()).
 *  - 2 días o más: «3 días 4 h»      - de 1 hora a 2 días: «5 h 12 min»
 *  - menos de 1 hora: «12 min 05 s» (y `urgente`)      - pasado: `vencido`.
 *  `cadaMs` dice cada cuánto hay que volver a pintarlo para que no se quede atrasado. */
export function tiempoQueda(limite: string | null | undefined, ahora: number): Queda | null {
  const fin = limite ? Date.parse(limite) : NaN;
  if (Number.isNaN(fin)) return null;
  const ms = fin - ahora;
  if (ms <= 0) return { vencido: true, urgente: true, texto: 'Plazo vencido', cadaMs: 60_000 };
  const s = Math.floor(ms / 1000);
  const dias = Math.floor(s / 86_400), horas = Math.floor((s % 86_400) / 3600), min = Math.floor((s % 3600) / 60), seg = s % 60;
  if (s < 3600) return { vencido: false, urgente: true, texto: `${min} min ${dos(seg)} s`, cadaMs: 1000 };
  if (dias >= 2) return { vencido: false, urgente: false, texto: `${dias} días${horas ? ` ${horas} h` : ''}`, cadaMs: 60_000 };
  return { vencido: false, urgente: s < 3 * 3600, texto: `${dias * 24 + horas} h ${dos(min)} min`, cadaMs: 15_000 };
}
