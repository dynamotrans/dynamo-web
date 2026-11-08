'use client';

// Tarjeta del precio SUGERIDO del tarifador (borrador, números MOCK hasta la tarifa real):
// precio grande, desglose plegable, alternativas más baratas con su ahorro («Elegir»
// cambia el tipo de fecha / la fecha y se recalcula solo) y entrega estimada.
// Para Dynamo además rellena por defecto los precios internos (editables).
import { useState } from 'react';
import { euros, fecha as fmtFecha } from '@/lib/formato';
import type { Tarifa } from '@/lib/tarifador';

export function PrecioSugerido({ tarifa, km, kmEstimado, cargando, paraCliente, onElegir }: {
  tarifa: Tarifa | null;
  km: number | null; kmEstimado: boolean;
  cargando: boolean;
  paraCliente: boolean;                                            // true: lo ve el cliente (orientativo)
  onElegir: (urgencia: 'dia' | 'estandar', fecha: string) => void;
}) {
  const [desglose, setDesglose] = useState(false);
  if (cargando) {
    return <div className="ptar-field ptar-field-full ptar-sug-card"><div className="ptar-sug-head">Precio orientativo</div><div className="ptar-sug-skel" aria-hidden="true" /></div>;
  }
  if (!tarifa) return null;
  return (
    <div className="ptar-field ptar-field-full ptar-sug-card">
      <div className="ptar-sug-head">Precio orientativo <span>· borrador del tarifador</span></div>
      <div className="ptar-sug-precio">{euros(tarifa.neto)} <span className="ptar-sug-iva">+ IVA</span></div>
      <div className="ptar-sug-sub">
        {tarifa.grupaje ? 'Grupaje' : 'Camión completo'}{km != null && <> · {km} km{kmEstimado ? ' (estimados)' : ''}</>}
        {tarifa.etaDesde && <> · entrega estimada {tarifa.etaHasta && tarifa.etaHasta !== tarifa.etaDesde
          ? <>entre el <strong>{fmtFecha(tarifa.etaDesde)}</strong> y el <strong>{fmtFecha(tarifa.etaHasta)}</strong></>
          : <>el <strong>{fmtFecha(tarifa.etaDesde)}</strong></>}</>}
      </div>
      <button type="button" className="ptar-sug-toggle" onClick={() => setDesglose((v) => !v)} aria-expanded={desglose}>
        {desglose ? '▾' : '▸'} Ver el desglose
      </button>
      {desglose && (
        <div className="ptar-sug-desglose">
          {tarifa.lineas.map((l, i) => (
            <div key={i} className={`ptar-sug-linea${l.v < 0 ? ' neg' : ''}`}><span>{l.k}</span><span>{euros(l.v)}</span></div>
          ))}
          <div className="ptar-sug-linea total"><span>Base imponible</span><span>{euros(tarifa.neto)}</span></div>
        </div>
      )}
      {tarifa.alternativas.length > 0 && (
        <div className="ptar-sug-alts">
          <div className="ptar-sug-alts-head">Más barato si te encaja</div>
          {tarifa.alternativas.map((a, i) => (
            <div key={i} className={`ptar-sug-alt${a.recomendada ? ' rec' : ''}`}>
              <div className="ptar-sug-alt-txt">
                <strong>{a.titulo}</strong>{a.recomendada && <span className="ptar-sug-rec">Recomendada</span>}
                <div className="ptar-sug-alt-sub">{a.detalle}</div>
              </div>
              <div className="ptar-sug-alt-der">
                <span className="ptar-sug-ahorro">Ahorras {euros(a.ahorro)}</span>
                <button type="button" className="ptar-sug-elegir" onClick={() => onElegir(a.urgencia, a.fecha)}>Elegir ›</button>
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="ptar-admin-precio-note" style={{ marginTop: '0.5rem' }}>
        {paraCliente
          ? <>Precio <strong>orientativo</strong> con la información de la ruta y la mercancía: el precio en firme te lo confirma Dynamo con tu tarifa.</>
          : <>Sugerido con el tarifador en <strong>borrador</strong> (números provisionales): revísalo y ajústalo abajo si hace falta.</>}
      </p>
    </div>
  );
}
