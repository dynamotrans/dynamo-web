// Horarios de atención de Dynamo (Álvaro): el mismo SCHEDULE del mockup y de la web
// pública. Hora peninsular (Europe/Madrid), se ajusta sola en cada temporada.
//   · Email y WhatsApp: lunes a viernes 8:00-18:00 (sin festivos).
//   · Teléfono: L-J 9-14 y 15-17 · V 9-14; jornada intensiva 8:30-15:30 en verano,
//     Navidad, Semana Santa (L-X santo) y semana festiva local; del 6 al 27 de agosto,
//     sin teléfono (solo email y WhatsApp).
// Los festivos nacionales llegan de la base de datos (tabla festivos) como 'AAAA-MM-DD'.

type Tramo = [number, number];
const INVIERNO: Record<number, Tramo[]> = { 1: [[9, 14], [15, 17]], 2: [[9, 14], [15, 17]], 3: [[9, 14], [15, 17]], 4: [[9, 14], [15, 17]], 5: [[9, 14]] };
const INTENSIVA: Record<number, Tramo[]> = { 1: [[8.5, 15.5]], 2: [[8.5, 15.5]], 3: [[8.5, 15.5]], 4: [[8.5, 15.5]], 5: [[8.5, 15.5]] };
export const ONLINE_ABRE = 8, ONLINE_CIERRA = 18;

export const CONTACTO = {
  email: 'info@dynamotrans.com', whatsapp: '+34 628 995 709', waHref: 'https://wa.me/34628995709',
  telefono: '+34 955 225 945', telHref: 'tel:+34955225945',
};

/** Fecha y hora "de pared" de Madrid (los campos del Date son los de Madrid). */
export function ahoraMadrid(d = new Date()): Date {
  return new Date(d.toLocaleString('en-US', { timeZone: 'Europe/Madrid' }));
}
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const dia0 = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

export function domingoPascua(y: number): Date {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25),
    g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4,
    l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451),
    mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(y, mes - 1, dia);
}
const masDias = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

const esAgosto = (d: Date) => d.getMonth() === 7 && d.getDate() >= 6 && d.getDate() <= 27;
const esVerano = (d: Date) => { const m = d.getMonth(), x = d.getDate(); return (m === 5 && x >= 15) || m === 6 || m === 7 || (m === 8 && x <= 1); };
const esNavidad = (d: Date) => { const m = d.getMonth(), x = d.getDate(); return (m === 11 && x >= 22) || (m === 0 && x <= 6); };
const esSemanaFestiva = (d: Date) => { const p = domingoPascua(d.getFullYear()); return dia0(d) >= dia0(masDias(p, 16)) && dia0(d) <= dia0(masDias(p, 19)); };
const esSemanaSanta = (d: Date) => { const p = domingoPascua(d.getFullYear()); return dia0(d) >= dia0(masDias(p, -6)) && dia0(d) <= dia0(masDias(p, -4)); };
const esIntensiva = (d: Date) => esVerano(d) || esNavidad(d) || esSemanaFestiva(d) || esSemanaSanta(d);

export function telefonoAbierto(festivos: Set<string>, ahora = ahoraMadrid()): boolean {
  const dia = ahora.getDay();
  if (dia === 0 || dia === 6 || festivos.has(iso(ahora)) || esAgosto(ahora)) return false;
  const h = ahora.getHours() + ahora.getMinutes() / 60;
  return ((esIntensiva(ahora) ? INTENSIVA : INVIERNO)[dia] ?? []).some(([a, b]) => h >= a && h < b);
}
export function onlineAbierto(festivos: Set<string>, ahora = ahoraMadrid()): boolean {
  const dia = ahora.getDay();
  if (dia === 0 || dia === 6 || festivos.has(iso(ahora))) return false;
  const h = ahora.getHours();
  return h >= ONLINE_ABRE && h < ONLINE_CIERRA;
}

/** Horario de hoy del teléfono, para enseñarlo bajo "Llamar". */
export function horarioTelefono(ahora = ahoraMadrid()): string {
  if (esAgosto(ahora)) return 'Cerrado · email y WhatsApp';
  if (esSemanaSanta(ahora)) return 'Lunes a Miércoles 8:30-15:30 (Semana Santa)';
  if (esNavidad(ahora)) return 'Lunes a Viernes 8:30-15:30 (Navidad)';
  if (esSemanaFestiva(ahora)) return 'Martes a Viernes 8:30-15:30 (semana festiva)';
  if (esVerano(ahora)) return 'Lunes a Viernes 8:30-15:30 (verano)';
  return 'Lunes a Jueves 9-14 y 15-17 · Viernes 9-14';
}
export const HORARIO_ONLINE = 'Lunes a Viernes 8-18';

/** "En línea · Respondo enseguida" o "He salido · Vuelvo mañana a las 8:00". */
export function estadoAtencion(festivos: Set<string>, ahora = ahoraMadrid()): { online: boolean; texto: string } {
  if (onlineAbierto(festivos, ahora)) return { online: true, texto: 'En línea · Respondo enseguida' };
  let d = new Date(ahora);
  for (let i = 0; i < 15; i++) {
    const laborable = d.getDay() !== 0 && d.getDay() !== 6 && !festivos.has(iso(d));
    if (laborable && (i > 0 || ahora.getHours() < ONLINE_ABRE)) {
      const vuelta = new Date(d.getFullYear(), d.getMonth(), d.getDate(), ONLINE_ABRE, 0);
      const dias = Math.round((dia0(vuelta) - dia0(ahora)) / 86400000);
      let cuando: string;
      if (dias === 0) {
        const min = Math.round((vuelta.getTime() - ahora.getTime()) / 60000);
        cuando = min < 60 ? 'en breve' : Math.round(min / 60) === 1 ? 'en 1 hora' : `en ${Math.round(min / 60)} horas`;
      } else if (dias === 1) cuando = 'mañana a las 8:00';
      else cuando = `el ${['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'][vuelta.getDay()]} a las 8:00`;
      return { online: false, texto: `He salido · Vuelvo ${cuando}` };
    }
    d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
  }
  return { online: false, texto: 'He salido' };
}

/** "Del martes 21 al viernes 24 de abril de 2026": la semana festiva local que viene. */
export function semanaFestivaTexto(ahora = ahoraMadrid()): string {
  const r = (y: number) => { const p = domingoPascua(y); return { mar: masDias(p, 16), vie: masDias(p, 19) }; };
  let s = r(ahora.getFullYear()); if (dia0(ahora) > dia0(s.vie)) s = r(ahora.getFullYear() + 1);
  const dias = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const { mar: t, vie: f } = s;
  return t.getMonth() === f.getMonth()
    ? `Del ${dias[t.getDay()]} ${t.getDate()} al ${dias[f.getDay()]} ${f.getDate()} de ${meses[f.getMonth()]} de ${f.getFullYear()}`
    : `Del ${dias[t.getDay()]} ${t.getDate()} de ${meses[t.getMonth()]} al ${dias[f.getDay()]} ${f.getDate()} de ${meses[f.getMonth()]} de ${f.getFullYear()}`;
}
