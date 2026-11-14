// Horario de un sitio: grupos de días con sus tramos (la tabla sitio_horarios guarda una
// fila por día y tramo; en la ficha se agrupan los días que tienen el mismo horario).
export type Tramo = { abre: string; cierra: string };          // 'HH:MM'
export type GrupoHorario = { dias: number[]; tramos: Tramo[] }; // dias: 1 = lunes … 7 = domingo
export type FilaHorario = { dia_semana: number; abre: string; cierra: string };

export const DIAS: [number, string, string][] = [
  [1, 'L', 'Lunes'], [2, 'M', 'Martes'], [3, 'X', 'Miércoles'], [4, 'J', 'Jueves'],
  [5, 'V', 'Viernes'], [6, 'S', 'Sábado'], [7, 'D', 'Domingo'],
];
// El horario por defecto del usuario (2026-11-14), el mismo que pone la base de datos.
export const HORARIO_POR_DEFECTO: GrupoHorario[] = [
  { dias: [1, 2, 3, 4], tramos: [{ abre: '08:00', cierra: '14:00' }, { abre: '15:30', cierra: '17:30' }] },
  { dias: [5], tramos: [{ abre: '08:00', cierra: '14:00' }] },
];

const hhmm = (t: string) => t.slice(0, 5);

// Filas de la base de datos → grupos (días seguidos o no, con el mismo horario).
export function gruposDe(filas: FilaHorario[]): GrupoHorario[] {
  const porDia = new Map<number, Tramo[]>();
  [...filas].sort((a, b) => a.dia_semana - b.dia_semana || a.abre.localeCompare(b.abre))
    .forEach((f) => porDia.set(f.dia_semana, [...(porDia.get(f.dia_semana) ?? []), { abre: hhmm(f.abre), cierra: hhmm(f.cierra) }]));
  const grupos: GrupoHorario[] = [];
  for (const [dia, tramos] of porDia) {
    const k = JSON.stringify(tramos);
    const g = grupos.find((x) => JSON.stringify(x.tramos) === k);
    if (g) g.dias.push(dia); else grupos.push({ dias: [dia], tramos });
  }
  return grupos;
}
// Grupos → lo que guarda guardar_horario().
// Minuto del día en que el sitio CIERRA ese día de la semana, cogiendo el TRAMO MÁS
// TARDÍO (con jornada partida cuenta el de la tarde). null = ese día no abre o no hay
// horario. (usuario, 2026-11-09: para avisar si el sitio cierra pronto al cargar hoy.)
export function cierreDelDia(g: GrupoHorario[], diaSemana: number): number | null {
  let max: number | null = null;
  for (const grupo of g) if (grupo.dias.includes(diaSemana))
    for (const t of grupo.tramos) {
      const [h, m] = t.cierra.split(':').map(Number);
      const v = h * 60 + m;
      if (max == null || v > max) max = v;
    }
  return max;
}

export const tramosDe = (g: GrupoHorario[]) =>
  g.flatMap((x) => x.dias.flatMap((dia) => x.tramos.map((t) => ({ dia, abre: t.abre, cierra: t.cierra }))));

// null si vale; si no, qué está mal (en castellano, para enseñarlo tal cual).
export function validarHorario(g: GrupoHorario[]): string | null {
  const conDias = g.filter((x) => x.dias.length);
  if (!conDias.length || !conDias.some((x) => x.tramos.length)) return 'El horario es obligatorio: elige al menos un día y su horario.';
  for (const x of conDias) {
    if (!x.tramos.length) return `Pon el horario de ${x.dias.map((d) => DIAS[d - 1][2].toLowerCase()).join(', ')} (o quita esos días).`;
    const ts = [...x.tramos].sort((a, b) => a.abre.localeCompare(b.abre));
    for (const [i, t] of ts.entries()) {
      if (!t.abre || !t.cierra) return 'Hay un tramo sin hora de apertura o de cierre.';
      if (t.cierra <= t.abre) return `El tramo ${t.abre}-${t.cierra} cierra antes de abrir.`;
      if (i > 0 && t.abre < ts[i - 1].cierra) return `Los tramos ${ts[i - 1].abre}-${ts[i - 1].cierra} y ${t.abre}-${t.cierra} se pisan.`;
    }
  }
  return null;
}
// El mismo resumen que escribe la base de datos, horario_texto()
// ("Lunes a jueves 8:00–14:00 y 15:00–17:30 · viernes 8:00–14:00").
export function resumenHorario(g: GrupoHorario[]): string {
  const porDia = new Map<number, string>();
  g.forEach((x) => x.dias.forEach((d) => porDia.set(d,
    [...x.tramos].sort((a, b) => a.abre.localeCompare(b.abre)).map((t) => `${t.abre.replace(/^0/, '')}–${t.cierra.replace(/^0/, '')}`).join(' y '))));
  const partes: string[] = [];
  let ini = 1;
  for (let d = 2; d <= 8; d++) {
    if (d === 8 || porDia.get(d) !== porDia.get(ini)) {
      const t = porDia.get(ini);
      if (t) partes.push(`${DIAS[ini - 1][2].toLowerCase()}${d - 1 > ini ? (d - 2 === ini ? ' y ' : ' a ') + DIAS[d - 2][2].toLowerCase() : ''} ${t}`);
      ini = d;
    }
  }
  const txt = partes.join(' · ');
  return txt.charAt(0).toUpperCase() + txt.slice(1);
}

// Días (AAAA-MM-DD) de una lista en los que el sitio NO abre según su horario (días de la
// semana con algún tramo). Sin horario conocido devuelve null: no se avisa de nada.
export function diasCerrado(abiertos: number[] | null | undefined, dias: string[]): string[] | null {
  if (!abiertos || !abiertos.length) return null;
  const set = new Set(abiertos);
  return dias.filter((d) => { const w = new Date(`${d}T12:00:00Z`).getUTCDay(); return !set.has(w === 0 ? 7 : w); });
}

// ---- Horario de verano ---------------------------------------------------------------
// Fechas 'MM-DD' que se repiten cada año. Las genéricas de Dynamo están en Parámetros
// (verano_sitios_desde / verano_sitios_hasta); estas son las de reserva si faltan.
export type Verano = { activo: boolean; desde: string; hasta: string; horario: GrupoHorario[] };
export type FechasVerano = { desde: string; hasta: string };
export const VERANO_GENERICO: FechasVerano = { desde: '06-01', hasta: '09-15' };
// Al activar el de verano, por defecto: lunes a viernes de 7:30 a 15:00.
export const HORARIO_VERANO_POR_DEFECTO: GrupoHorario[] = [{ dias: [1, 2, 3, 4, 5], tramos: [{ abre: '07:00', cierra: '15:00' }] }];
export const MMDD = /^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/;
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
/** '05-25' → '25 de mayo' */
export const mmddTxt = (x: string) => (MMDD.test(x) ? `${Number(x.slice(3))} de ${MESES[Number(x.slice(0, 2)) - 1]}` : x);
/** ¿Cae la fecha (AAAA-MM-DD) entre desde y hasta (MM-DD)? Admite que cruce el año. */
export function enTemporada(fecha: string, desde: string, hasta: string): boolean {
  if (!MMDD.test(desde) || !MMDD.test(hasta)) return false;
  const md = fecha.slice(5, 10);
  return desde <= hasta ? md >= desde && md <= hasta : md >= desde || md <= hasta;
}
