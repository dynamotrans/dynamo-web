'use client';

// Marcar una proforma como PAGADA por transferencia pide tres datos antes (usuario,
// 2026-11-17: «para no marcar por error proformas tan rápido»): el BANCO en el que ha
// entrado, un CONCEPTO libre —ya escrito: «Pago proforma GX… - fecha»— y el DÍA de la
// transferencia, por defecto hoy. Sin banco elegido no se puede confirmar.
// Lo usan la ficha del envío (dentro del aviso de pago) y Administración (en ventana).
import { useState } from 'react';
import { hoyMadrid } from '@/lib/formato';
import Req from '@/components/Req';
import CampoFecha from '@/components/CampoFecha';

// Los bancos en los que cobra Dynamo. Si cambia de banco, se añade aquí.
export const BANCOS_COBRO = ['Santander', 'CaixaBank', 'BBVA'];

export type DatosTransferencia = { banco: string; concepto: string; fecha: string };

// «Pago proforma GX102345361 - 17/11/26»: la fecha, corta y sin el día de la semana.
const conceptoDe = (gx: string, dia: string) => { const [a, m, d] = dia.split('-'); return `Pago proforma ${gx} - ${d}/${m}/${a.slice(2)}`; };

export default function FormTransferencia({ gx, onConfirmar, onCancelar, ocupado = false }: {
  gx: string;                                       // n.º del envío (GX…), para el concepto por defecto
  onConfirmar: (d: DatosTransferencia) => void;
  onCancelar: () => void;
  ocupado?: boolean;
}) {
  const hoy = hoyMadrid();
  const [banco, setBanco] = useState('');
  const [dia, setDia] = useState(hoy);
  const [concepto, setConcepto] = useState(conceptoDe(gx, hoy));
  const [tocado, setTocado] = useState(false);     // si escribe su propio concepto, la fecha ya no lo cambia
  const [falta, setFalta] = useState<string | null>(null);

  function confirmar() {
    if (!banco) { setFalta('Elige el banco en el que ha entrado la transferencia.'); return; }
    if (!dia || dia > hoy) { setFalta('La fecha de la transferencia no puede ser posterior a hoy.'); return; }
    setFalta(null);
    onConfirmar({ banco, concepto: concepto.trim(), fecha: dia });
  }

  return (
    <div className="form-transferencia" style={{ display: 'grid', gap: '0.6rem' }}>
      <div>
        <label htmlFor="tr-banco">Banco en el que ha entrado <Req /></label>
        <select id="tr-banco" value={banco} onChange={(e) => { setBanco(e.target.value); setFalta(null); }} disabled={ocupado}>
          <option value="">Elige el banco…</option>
          {BANCOS_COBRO.map((b) => <option key={b} value={b}>{b}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor="tr-concepto">Concepto <Req si={false} /></label>
        <input id="tr-concepto" type="text" maxLength={200} value={concepto} disabled={ocupado}
          onChange={(e) => { setConcepto(e.target.value); setTocado(true); }} />
      </div>
      <div>
        <label htmlFor="tr-fecha">Fecha de la transferencia <Req /></label>
        <CampoFecha id="tr-fecha" value={dia} max={hoy} disabled={ocupado}
          onChange={(d) => { setDia(d); setFalta(null); if (!tocado && d) setConcepto(conceptoDe(gx, d)); }} />
      </div>
      {falta && <div className="pt-aviso error" role="alert" style={{ margin: 0 }}><div>{falta}</div></div>}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <button type="button" className="btn-primary" id="tr-confirmar" onClick={confirmar} disabled={ocupado}>Marcar como pagada</button>
        <button type="button" className="btn-ghost" onClick={onCancelar} disabled={ocupado}>Cancelar</button>
      </div>
    </div>
  );
}
