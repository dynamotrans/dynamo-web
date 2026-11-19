'use client';
// Temporizador de un plazo (el de pagar un envío): «Quedan 5 h 12 min», y en la última
// hora cuenta los segundos y se pone en rojo. Va solo: se repinta cada poco sin pedir
// nada al servidor. `corto`: solo el tiempo, para celdas de tabla. `grande`: la banda de la
// ficha del envío, para que se vea de un vistazo (usuario, 2026-11-19: «visible, claro»).
import { useEffect, useState } from 'react';
import { tiempoQueda } from '@/lib/cuentaAtras';

export default function CuentaAtras({ hasta, corto = false, grande = false, vencidoTxt = 'Plazo vencido', para = 'para pagar' }: {
  hasta: string | null | undefined; corto?: boolean; grande?: boolean; vencidoTxt?: string; para?: string;
}) {
  const [ahora, setAhora] = useState(() => Date.now());
  const q = tiempoQueda(hasta, ahora);
  const cada = q?.cadaMs ?? 0;
  useEffect(() => {
    if (!cada) return;
    const t = setInterval(() => setAhora(Date.now()), cada);
    return () => clearInterval(t);
  }, [cada]);
  if (!q) return null;
  const urgente = q.vencido || q.urgente || undefined;
  if (grande) {
    return (
      // El servidor y el navegador no pintan el mismo segundo: no es un fallo de hidratación.
      <div className="cuenta-atras cuenta-atras-grande" data-urgente={urgente} role="timer" suppressHydrationWarning>
        <span className="ca-reloj" aria-hidden="true">⏱</span>
        <span>{q.vencido ? vencidoTxt : <>Te quedan <strong className="ca-tiempo">{q.texto}</strong> {para}</>}</span>
      </div>
    );
  }
  return (
    <span className="cuenta-atras" data-urgente={urgente} suppressHydrationWarning>
      <span aria-hidden="true">⏱ </span>{q.vencido ? vencidoTxt : corto ? q.texto : `Quedan ${q.texto}`}
    </span>
  );
}
