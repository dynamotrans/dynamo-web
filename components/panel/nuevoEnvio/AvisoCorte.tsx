'use client';

// Aviso del CORTE del día en el paso de fecha (calcado del mockup): antes del corte, una
// cuenta atrás en vivo («Pide antes de las 12:00, quedan 1 h 23 min…») con el primer día
// de carga posible; pasado el corte, desde cuándo se puede cargar, con el rango de la
// ventana. CADA ventana tiene SU hora de corte en Parámetros (usuario, 2026-11-10):
// 1-3 días (carga completa), 1-2 y 1-4 (grupaje); la fecha fija, la suya (12:00).
// Toda ventana puede empezar HOY MISMO antes de su corte; pasado, el siguiente
// día hábil, nunca dos (usuario, 2026-11-09).
import { useEffect, useMemo, useState } from 'react';
import { corteDe, iso, primerDia, sumarHabiles, type CortesCarga } from '@/lib/fechasCarga';
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

  const m = ahoraMadrid();
  const corteH = corteDe(urgencia, grupaje, cortes);
  const etiqueta = `${corteH}:00`;
  const resta = corteH * 3600 - (m.getHours() * 3600 + m.getMinutes() * 60 + m.getSeconds());
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

  if (resta > 0) {
    const h = Math.floor(resta / 3600), mi = Math.floor((resta % 3600) / 60), sg = resta % 60;
    const quedan = `${h > 0 ? `${h} h ` : ''}${mi} min ${sg < 10 ? `0${sg}` : sg} s`;
    return (
      <div className="ptar-cutoff-note" role="status">
        <IcoReloj /><strong>Pide antes de las {etiqueta}</strong> (quedan <em>{quedan}</em>) y el primer día de carga posible es {firstHoy ? <><strong>hoy mismo</strong> ({fmtFecha(first)})</> : <>el <strong>{fmtFecha(first)}</strong></>}{rango}.{guia}
      </div>
    );
  }
  return (
    <div className="ptar-cutoff-note" role="status">
      <IcoReloj />El corte de las {etiqueta} ya ha pasado. Primer día de carga posible: <strong>{fmtFecha(first)}</strong>{rango}.{guia}
    </div>
  );
}
