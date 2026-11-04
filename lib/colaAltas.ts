// Contador de las altas pendientes. El reloj de atención solo corre en horario de
// oficina: lunes a viernes de 8:30 a 17:30 (hora de España), sin festivos nacionales.
// Fuera de ese horario la solicitud está «en cola» y el reloj arranca a las 8:30.
// Objetivo: atenderla en 30 minutos de oficina; pasados, es URGENTE.
import { ahoraMadrid } from './atencion';

export const COLA_ABRE = 8.5, COLA_CIERRA = 17.5, COLA_OBJETIVO_MIN = 30;
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const laborable = (d: Date, fest: Set<string>) => d.getDay() >= 1 && d.getDay() <= 5 && !fest.has(iso(d));
const horas = (d: Date) => d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;

/** Minutos de oficina entre dos instantes (los dos en hora de pared de Madrid). */
export function minutosOficina(desde: Date, hasta: Date, fest: Set<string>): number {
  if (hasta <= desde) return 0;
  let total = 0;
  const dia = new Date(desde.getFullYear(), desde.getMonth(), desde.getDate());
  for (let i = 0; i < 400 && dia <= hasta; i++) {
    if (laborable(dia, fest)) {
      const ini = iso(dia) === iso(desde) ? Math.max(COLA_ABRE, horas(desde)) : COLA_ABRE;
      const fin = iso(dia) === iso(hasta) ? Math.min(COLA_CIERRA, horas(hasta)) : COLA_CIERRA;
      if (fin > ini) total += (fin - ini) * 60;
    }
    dia.setDate(dia.getDate() + 1);
  }
  return total;
}

/** «2 d 3 h 10 min» */
export function duracionTxt(min: number): string {
  const m = Math.max(0, Math.floor(min));
  const d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), r = m % 60;
  return [d ? `${d} d` : '', h ? `${h} h` : '', `${r} min`].filter(Boolean).join(' ');
}

export type EstadoCola = { esperaMin: number; oficinaMin: number; enCola: boolean; urgente: boolean; progreso: number };
/** Cómo va una solicitud: espera real, minutos de oficina, si está en cola o es urgente. */
export function estadoCola(solicitadaISO: string, fest: Set<string>, ahoraReal = new Date()): EstadoCola {
  const desde = ahoraMadrid(new Date(solicitadaISO)), ahora = ahoraMadrid(ahoraReal);
  const oficinaMin = minutosOficina(desde, ahora, fest);
  const h = horas(ahora);
  const abierto = laborable(ahora, fest) && h >= COLA_ABRE && h < COLA_CIERRA;
  return {
    esperaMin: (ahoraReal.getTime() - new Date(solicitadaISO).getTime()) / 60000,
    oficinaMin, enCola: !abierto && oficinaMin < COLA_OBJETIVO_MIN,
    urgente: oficinaMin >= COLA_OBJETIVO_MIN, progreso: Math.min(1, oficinaMin / COLA_OBJETIVO_MIN),
  };
}
