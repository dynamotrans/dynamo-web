// Fechas de carga del tarifador: días hábiles (sin fines de semana ni festivos que se le
// pasen) y primer día en que se puede cargar según la hora de corte. Mismas reglas que
// primera_fecha_carga() en la base de datos.
// ---- Fechas (días hábiles: sin fines de semana ni festivos nacionales) -------------
export const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export function habil(d: Date, fest: Set<string>) { return d.getDay() !== 0 && d.getDay() !== 6 && !fest.has(iso(d)); }
export function sumarHabiles(desde: string, n: number, fest: Set<string>): string {
  const [a, m, d] = desde.split('-').map(Number); const x = new Date(a, m - 1, d); let k = 0;
  while (k < n) { x.setDate(x.getDate() + 1); if (habil(x, fest)) k++; }
  return iso(x);
}
// Primer día de recogida posible: el siguiente día hábil, si se pide antes del corte de
// hoy (horas de corte de Parámetros: fecha fija 12:00, ventana 14:00, hora de Madrid); si no,
// el siguiente. Las mismas reglas que primera_fecha_carga() en la base de datos.
export function primerDia(urg: 'dia' | 'estandar', fest: Set<string>, cortes?: { fija?: number; ventana?: number }, ahora = new Date()): string {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(ahora);
  const v = (t: string) => Number(p.find((x) => x.type === t)?.value);
  const hoy = `${v('year')}-${String(v('month')).padStart(2, '0')}-${String(v('day')).padStart(2, '0')}`;
  const corte = urg === 'dia' ? (cortes?.fija ?? 12) : (cortes?.ventana ?? 14);
  return sumarHabiles(hoy, v('hour') + v('minute') / 60 < corte ? 1 : 2, fest);
}
