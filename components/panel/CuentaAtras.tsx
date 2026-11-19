'use client';
// Temporizador de un plazo (el de pagar un envío): «Quedan 5 h 12 min», y en la última
// hora cuenta los segundos y se pone en rojo. Va solo: se repinta cada poco sin pedir
// nada al servidor. `corto`: solo el tiempo, para celdas de tabla.
import { useEffect, useState } from 'react';
import { tiempoQueda } from '@/lib/cuentaAtras';

export default function CuentaAtras({ hasta, corto = false, vencidoTxt = 'Plazo vencido' }: { hasta: string | null | undefined; corto?: boolean; vencidoTxt?: string }) {
  const [ahora, setAhora] = useState(() => Date.now());
  const q = tiempoQueda(hasta, ahora);
  const cada = q?.cadaMs ?? 0;
  useEffect(() => {
    if (!cada) return;
    const t = setInterval(() => setAhora(Date.now()), cada);
    return () => clearInterval(t);
  }, [cada]);
  if (!q) return null;
  const color = q.vencido || q.urgente ? '#b42318' : '#92400e';
  return (
    // El servidor y el navegador no pintan el mismo segundo: no es un fallo de hidratación.
    <span className="cuenta-atras" data-urgente={q.urgente || undefined} suppressHydrationWarning
      style={{ color, fontWeight: 800, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
      <span aria-hidden="true">⏱ </span>{q.vencido ? vencidoTxt : corto ? q.texto : `Quedan ${q.texto}`}
    </span>
  );
}
