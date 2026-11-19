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
// N días hábiles ANTES de una fecha (igual que dias_habiles_antes() en la base de datos).
export function habilesAntes(fecha: string, n: number, fest: Set<string>): string {
  const [a, m, d] = fecha.split('-').map(Number); const x = new Date(a, m - 1, d); let k = 0;
  while (k < Math.max(0, n)) { x.setDate(x.getDate() - 1); if (habil(x, fest)) k++; }
  return iso(x);
}
// Día en que un precio provisional se revisa y queda cerrado: N días hábiles antes de la
// carga (parámetro precio_cerrado_dias_habiles). null = el precio ya es cerrado (faltan N
// días hábiles o menos). La misma cuenta que precio_dia_cierre() en la base de datos.
export function diaCierrePrecio(fechaCarga: string, n: number, hoy: string, fest: Set<string>): string | null {
  const d = habilesAntes(fechaCarga, Math.min(Math.max(0, n), 400), fest);
  return d > hoy ? d : null;
}
// Primer día de recogida posible (hora de Madrid; cuentan solo los días hábiles: fuera
// sábados, domingos y festivos nacionales). Las mismas reglas que primera_fecha_carga()
// en la base de datos:
//   · VENTANA: puede empezar HOY MISMO si se pide antes de SU corte y hoy es hábil; si
//     no, el siguiente día hábil — nunca salta dos. CADA ventana tiene su hora de corte
//     en Parámetros (usuario, 2026-11-10): 1-3 días (carga completa), 1-2 y 1-4
//     (grupaje). Grupaje no lleva fecha fija.
//   · Fecha fija (corte 12:00): antes, el siguiente día hábil; después, el otro.
export type CortesCarga = { fija?: number; v12?: number; v13?: number; v14?: number };
export const corteDe = (urg: 'dia' | 'estandar' | 'corta', grupaje: boolean, cortes?: CortesCarga) =>
  urg === 'dia' ? (cortes?.fija ?? 12)
  : urg === 'corta' ? (cortes?.v12 ?? 14)
  : grupaje ? (cortes?.v14 ?? 14)
  : (cortes?.v13 ?? 14);
export function primerDia(urg: 'dia' | 'estandar' | 'corta', grupaje: boolean, fest: Set<string>, cortes?: CortesCarga, ahora = new Date()): string {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(ahora);
  const v = (t: string) => Number(p.find((x) => x.type === t)?.value);
  const hoy = `${v('year')}-${String(v('month')).padStart(2, '0')}-${String(v('day')).padStart(2, '0')}`;
  const corte = corteDe(urg, grupaje, cortes);
  const antes = v('hour') + v('minute') / 60 < corte;
  if (urg !== 'dia') {
    if (antes && habil(new Date(v('year'), v('month') - 1, v('day')), fest)) return hoy;
    return sumarHabiles(hoy, 1, fest);
  }
  return sumarHabiles(hoy, antes ? 1 : 2, fest);
}

// Instante real de una hora «de reloj» en Madrid (día ISO + hora), con su horario de
// verano o de invierno. Se ajusta dos veces por si el cambio de hora cae en medio.
function instanteMadrid(dia: string, hora: number): Date {
  const [a, m, d] = dia.split('-').map(Number);
  const deseado = Date.UTC(a, m - 1, d, hora);
  let t = deseado - 3600_000;
  for (let i = 0; i < 2; i++) {
    const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date(t));
    const v = (k: string) => Number(p.find((x) => x.type === k)?.value);
    t += deseado - Date.UTC(v('year'), v('month') - 1, v('day'), v('hour') % 24, v('minute'));
  }
  return new Date(t);
}

// SIGUIENTE CORTE que cuenta (usuario, 2026-11-19: «pasado el corte, reinicia la cuenta al
// siguiente, 23 h 59 min, así tiene más control»): el último momento para pedir y conservar
// el primer día de carga que se ofrece ahora. Es el primer corte (cada día a su hora) a
// partir del cual ese primer día cambia. Antes del corte de un día hábil, el de hoy; pasado,
// el del día siguiente; en fin de semana, el del lunes (o el siguiente hábil).
export function siguienteCorte(urg: 'dia' | 'estandar' | 'corta', grupaje: boolean, fest: Set<string>, cortes?: CortesCarga, ahora = new Date()): { dia: string; hora: number; instante: Date } {
  const hora = corteDe(urg, grupaje, cortes);
  const actual = primerDia(urg, grupaje, fest, cortes, ahora);
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(ahora);
  const v = (k: string) => Number(p.find((x) => x.type === k)?.value);
  const x = new Date(v('year'), v('month') - 1, v('day'));
  for (let i = 0; i < 40; i++, x.setDate(x.getDate() + 1)) {
    const dia = iso(x);
    const instante = instanteMadrid(dia, hora);
    if (instante.getTime() <= ahora.getTime()) continue;
    if (primerDia(urg, grupaje, fest, cortes, instante) !== actual) return { dia, hora, instante };
  }
  const dia = iso(x);
  return { dia, hora, instante: instanteMadrid(dia, hora) };
}

// Aviso de días hábiles en las fechas de recogida y de entrega (usuario, 2026-11-19): las
// ventanas (1 a 2, 1 a 3, 1 a 4 días) y la entrega estimada cuentan SOLO días hábiles.
export const AVISO_DIAS_HABILES = 'Sábados, domingos y festivos no cuentan: la recogida y la entrega se hacen en días hábiles (de lunes a viernes, sin festivos). Por ejemplo, «del viernes al martes» son 3 días hábiles: viernes, lunes y martes.';
