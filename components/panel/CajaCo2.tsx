// Cajita verde con un arbolito: la huella de CO₂ orientativa del envío (usuario, 2026-11-21).
import { huellaCo2 } from '@/lib/co2';
import { numero } from '@/lib/formato';
import Tip from '@/components/Tip';

export default function CajaCo2({ km, ml, toneladas, plataforma, compacta = false }: {
  km: number | null | undefined; ml?: number | null; toneladas?: number | null; plataforma?: boolean | null; compacta?: boolean;
}) {
  const h = huellaCo2({ km, ml, toneladas, plataforma });
  if (!h) return null;
  return (
    <div className={`caja-co2${compacta ? ' compacta' : ''}`} id="caja-co2">
      <span className="caja-co2-ico" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 22v-7" /><path d="M9 22h6" />
          <path d="M12 15c-3.9 0-7-2.6-7-6 0-2.2 1.4-4.1 3.4-5.1C9.2 2.7 10.5 2 12 2s2.8.7 3.6 1.9C17.6 4.9 19 6.8 19 9c0 3.4-3.1 6-7 6z" />
        </svg>
      </span>
      <div>
        <div className="caja-co2-tit">Huella de CO₂ de este envío: <strong>≈ {numero(h.kg, 0)} kg</strong>{' '}
          <Tip aria="Cómo se calcula el CO₂" texto={`Cálculo orientativo con el método del sector (ISO 14083 / GLEC): kilómetros de la ruta × consumo del camión × emisiones del gasóleo (de su fabricación a su combustión).${h.parte < 1 ? ` En grupaje solo cuenta la parte del camión que ocupa tu mercancía (${Math.round(h.parte * 100)} %).` : ''}`} /></div>
        <div className="caja-co2-sub">Lo que absorben <strong>{numero(h.arboles, 0)} {h.arboles === 1 ? 'árbol' : 'árboles'}</strong> en un año.</div>
      </div>
    </div>
  );
}
