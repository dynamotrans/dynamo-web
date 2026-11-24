'use client';

// Aviso del CORTE en el paso de fecha (calcado del mockup): una cuenta atrás en vivo hasta
// el siguiente corte que cuenta («Pide antes de las 12:00, quedan 1 h 23 min…»; pasado el
// de hoy, «Pide antes del Vie 20/11/26 a las 12:00, quedan 23 h 59 min…») con el primer
// día de carga posible y el rango de la ventana. CADA ventana tiene SU hora de corte en Parámetros (usuario, 2026-11-10):
// 1-3 días (carga completa), 1-2 y 1-4 (grupaje); la fecha fija, la suya (12:00).
// Toda ventana puede empezar HOY MISMO antes de su corte; pasado, el siguiente
// día hábil, nunca dos (usuario, 2026-11-09).
import { useEffect, useMemo, useState } from 'react';
import { iso, primerDia, siguienteCorte, sumarHabiles, type CortesCarga } from '@/lib/fechasCarga';
import { ahoraMadrid } from '@/lib/atencion';
import { fecha as fmtFecha } from '@/lib/formato';

const IcoReloj = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: '0.35rem' }}>
    <circle cx="12" cy="13" r="8" /><path d="M12 9v4l2.5 2.5" /><path d="M9 2h6" /><path d="M19 5l1.5 1.5" />
  </svg>
);

export default function AvisoCorte({ urgencia, festivos, cortes, ventana, grupaje }: {
  urgencia: 'dia' | 'estandar' | 'corta';
  festivos: string[];
  cortes?: CortesCarga;
  ventana: number;              // días de la ventana de recogida (1 = fecha fija)
  grupaje: boolean;
}) {
  // Reloj en marcha: un tic por segundo para la cuenta atrás (solo mientras está montado).
  const [, setTic] = useState(0);
  useEffect(() => { const t = setInterval(() => setTic((x) => x + 1), 1000); return () => clearInterval(t); }, []);
  const fest = useMemo(() => new Set(festivos), [festivos]);

  const ahora = new Date();
  const m = ahoraMadrid(ahora);
  // La cuenta atrás va SIEMPRE al siguiente corte que cuenta (usuario, 2026-11-19): pasado
  // el de hoy, se reinicia al de mañana (23 h 59 min…), y en fin de semana, al del lunes.
  const sig = siguienteCorte(urgencia, grupaje, fest, cortes, ahora);
  const etiqueta = `${sig.hora}:00`;
  const resta = Math.max(0, Math.floor((sig.instante.getTime() - ahora.getTime()) / 1000));
  const corteHoy = sig.dia === iso(m);
  const first = primerDia(urgencia, grupaje, fest, cortes);
  const firstHoy = first === iso(m);
  const hasta = ventana > 1 ? sumarHabiles(first, ventana - 1, fest) : first;
  const rango = ventana > 1 ? <> (ventana del <strong>{fmtFecha(first)}</strong> al <strong>{fmtFecha(hasta)}</strong>)</> : null;
  // Con FECHA FIJA, la ventana recomendada tiene su propio corte (más tarde) y casi
  // siempre habilita un primer día ANTERIOR: se dice con la fecha concreta (usuario,
  // 2026-11-10: «avisa que poniendo la ventana no hay que esperar al jueves»).
  const altFirst = urgencia === 'dia' ? primerDia('estandar', grupaje, fest, cortes) : null;
  const altHoy = altFirst === iso(m);
  const guia = urgencia === 'dia'
    ? <> Lo más barato y seguro: la <strong>recogida de 1 a {grupaje ? 4 : 3} días</strong>{altFirst && altFirst < first
      ? <> — con ella el primer día posible {altHoy ? <>es <strong>hoy mismo</strong> ({fmtFecha(altFirst)})</> : <>sería el <strong>{fmtFecha(altFirst)}</strong></>}, sin esperar al {fmtFecha(first)}</>
      : null}.</>
    : null;

  const dd = Math.floor(resta / 86_400), h = Math.floor((resta % 86_400) / 3600), mi = Math.floor((resta % 3600) / 60), sg = resta % 60;
  const quedan = `${dd > 0 ? `${dd} ${dd === 1 ? 'día' : 'días'} ` : ''}${dd > 0 || h > 0 ? `${h} h ` : ''}${mi} min ${sg < 10 ? `0${sg}` : sg} s`;
  // Ya no se dice «El corte de hoy (…) ya ha pasado» (usuario, 2026-11-24: no aporta): solo
  // hasta cuándo se puede pedir y cuál es el primer día de carga.
  return (
    <div className="ptar-cutoff-note" role="status">
      <IcoReloj /><strong>Pide antes {corteHoy ? <>de las {etiqueta}</> : <>del {fmtFecha(sig.dia)} a las {etiqueta}</>}</strong> (quedan <em>{quedan}</em>). El primer día de carga posible es {firstHoy ? <><strong>hoy mismo</strong> ({fmtFecha(first)})</> : <>el <strong>{fmtFecha(first)}</strong></>}{rango}.{guia}
    </div>
  );
}
