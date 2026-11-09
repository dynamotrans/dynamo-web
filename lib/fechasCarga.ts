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
// Primer día de recogida posible (hora de Madrid; cuentan solo los días hábiles: fuera
// sábados, domingos y festivos nacionales). Las mismas reglas que primera_fecha_carga()
// en la base de datos:
//   · VENTANA (estándar 1-3/1-4 Y corta 1-2 de grupaje; usuario, 2026-11-09): puede
//     empezar HOY MISMO si se pide antes del corte (14:00) y hoy es hábil; si no, el
//     siguiente día hábil — nunca salta dos. Grupaje no lleva fecha fija.
//   · Fecha fija (corte 12:00): antes, el siguiente día hábil; después, el otro.
export function primerDia(urg: 'dia' | 'estandar' | 'corta', fest: Set<string>, cortes?: { fija?: number; ventana?: number }, ahora = new Date()): string {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(ahora);
  const v = (t: string) => Number(p.find((x) => x.type === t)?.value);
  const hoy = `${v('year')}-${String(v('month')).padStart(2, '0')}-${String(v('day')).padStart(2, '0')}`;
  const corte = urg === 'dia' ? (cortes?.fija ?? 12) : (cortes?.ventana ?? 14);
  const antes = v('hour') + v('minute') / 60 < corte;
  if (urg !== 'dia') {
    if (antes && habil(new Date(v('year'), v('month') - 1, v('day')), fest)) return hoy;
    return sumarHabiles(hoy, 1, fest);
  }
  return sumarHabiles(hoy, antes ? 1 : 2, fest);
}
