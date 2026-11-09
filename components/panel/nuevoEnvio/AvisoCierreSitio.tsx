'use client';

// AVISO DE CIERRE DEL SITIO al cargar HOY (usuario, 2026-11-09): no se prohíbe elegir el
// día, pero si al sitio de recogida le quedan ≤ 2 horas para cerrar (según el TRAMO MÁS
// TARDÍO de su horario de hoy) sale una caja roja con cuenta atrás EN VIVO; y si ya ha
// cerrado, lo dice y pide verificarlo con el sitio. En Confirmar envío se repite con la
// línea de que cancelar o posponer por el cierre se repercute al cliente.
import { useEffect, useState } from 'react';
import { ahoraMadrid } from '@/lib/atencion';
import { cierreDelDia, type GrupoHorario } from '@/lib/horarios';

export default function AvisoCierreSitio({ empresa, horario, repercusion = false }: {
  empresa: string; horario: GrupoHorario[]; repercusion?: boolean;
}) {
  const [, setTic] = useState(0);
  useEffect(() => { const t = setInterval(() => setTic((x) => x + 1), 1000); return () => clearInterval(t); }, []);
  const m = ahoraMadrid();
  const dia = m.getDay() === 0 ? 7 : m.getDay();
  const cierre = cierreDelDia(horario, dia);
  if (cierre == null) return null;   // hoy no abre o sin horario: no sabemos la hora de cierre
  const resta = cierre * 60 - (m.getHours() * 3600 + m.getMinutes() * 60 + m.getSeconds());
  if (resta > 2 * 3600) return null; // queda holgura de sobra: sin aviso
  const hCierre = `${Math.floor(cierre / 60)}:${String(cierre % 60).padStart(2, '0')}`;
  const quedan = `${Math.floor(resta / 3600) > 0 ? `${Math.floor(resta / 3600)} h ` : ''}${Math.floor((resta % 3600) / 60)} min ${String(resta % 60).padStart(2, '0')} s`;
  return (
    <div className="aviso-cierre" role="alert">
      {resta > 0
        ? <><strong>⚠ {empresa} cierra hoy pronto, a las {hCierre}: quedan {quedan}.</strong> Verifica con el sitio que da tiempo a cargar hoy.</>
        : <><strong>⚠ {empresa} YA HA CERRADO hoy (cerró a las {hCierre}).</strong> Verifícalo bien con el sitio antes de confirmar la carga para hoy.</>}
      {repercusion && <div style={{ marginTop: '0.35rem' }}><strong>Cualquier cancelación, o posponer la carga al día siguiente, por el cierre del sitio se repercutirá al cliente.</strong></div>}
    </div>
  );
}
