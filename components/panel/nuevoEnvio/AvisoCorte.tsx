'use client';

// Aviso del CORTE del día en el paso de fecha (calcado del mockup): antes del corte, una
// cuenta atrás en vivo («Pide antes de las 12:00, quedan 1 h 23 min…») con el primer día
// de carga posible; pasado el corte, desde cuándo se puede cargar, con el rango de la
// ventana. Corte de fecha fija 12:00 · ventanas (estándar y corta) 14:00 (Parámetros).
// Toda ventana puede empezar HOY MISMO antes de las 14:00; pasado el corte, el siguiente
// día hábil, nunca dos (usuario, 2026-11-09).
import { useEffect, useMemo, useState } from 'react';
import { iso, primerDia, sumarHabiles } from '@/lib/fechasCarga';
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
  cortes?: { fija?: number; ventana?: number };
  ventana: number;              // días de la ventana de recogida (1 = fecha fija)
  grupaje: boolean;
}) {
  // Reloj en marcha: un tic por segundo para la cuenta atrás (solo mientras está montado).
  const [, setTic] = useState(0);
  useEffect(() => { const t = setInterval(() => setTic((x) => x + 1), 1000); return () => clearInterval(t); }, []);
  const fest = useMemo(() => new Set(festivos), [festivos]);

  const m = ahoraMadrid();
  const corteH = urgencia === 'dia' ? (cortes?.fija ?? 12) : (cortes?.ventana ?? 14);
  const etiqueta = `${corteH}:00`;
  const resta = corteH * 3600 - (m.getHours() * 3600 + m.getMinutes() * 60 + m.getSeconds());
  const first = primerDia(urgencia, fest, cortes);
  const firstHoy = first === iso(m);
  const hasta = ventana > 1 ? sumarHabiles(first, ventana - 1, fest) : first;
  const rango = ventana > 1 ? <> (ventana del <strong>{fmtFecha(first)}</strong> al <strong>{fmtFecha(hasta)}</strong>)</> : null;
  const guia = urgencia === 'dia'
    ? <> Lo más barato y seguro: la <strong>recogida de 1 a {grupaje ? 4 : 3} días</strong>.</> : null;

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
