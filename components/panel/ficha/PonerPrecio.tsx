'use client';

import { useState } from 'react';
import Modal from '../Modal';
import Cargando from '@/components/Cargando';
import { numero } from '@/lib/formato';
import type { Ficha } from '@/lib/fichaEnvio';
import { proponerPrecio } from '@/app/panel/(app)/nuevo-envio/acciones';
import { I, ICO, aNum } from './comun';

// ---- Poner precio a una solicitud del cliente ----------------------------------------
export function PonerPrecio({ ficha, onVolver, hacer, trabajando, fallo }: { ficha: Ficha; onVolver: () => void; hacer: (t: string, fn: () => Promise<{ ok: boolean; error?: string; aviso?: string }>, ok?: string) => Promise<boolean>; trabajando: string | null; fallo?: string | null }) {
  const e = ficha.envio;
  const [pc, setPc] = useState(numero(e.importe_cliente, 2));
  const [pt, setPt] = useState(numero(e.importe_transportista, 2));
  const [error, setError] = useState<string | null>(null);
  const vc = aNum(pc), vt = aNum(pt);
  return (
    <Modal abierto onCerrar={onVolver} titulo={`Precio de la solicitud #${e.referencia_gx}`} sub={ficha.cliente?.nombre} icono={<I d={ICO.enviar} />}
      pie={<>
        <button className="btn-ghost" onClick={onVolver} disabled={!!trabajando}>Volver</button>
        <button className="btn-primary" disabled={!!trabajando} onClick={() => {
          if (!(vc != null && vc > 0)) { setError('Pon el precio del cliente (base sin IVA).'); return; }
          if (vt != null && Number.isNaN(vt)) { setError('El precio del transportista no es válido.'); return; }
          hacer('Enviando el precio', () => proponerPrecio(e.id, vc, vt));
        }}>Enviar precio al cliente</button>
      </>}>
      {trabajando && <Cargando texto={trabajando} />}
      <div className="ptar-admin-precio">
        <div className="ptar-admin-precio-head">Precios <span>· el del transportista solo lo ves tú</span></div>
        <label className="ptar-admin-precio-lbl" htmlFor="pp-pc">Cliente (base sin IVA)</label>
        <input id="pp-pc" type="text" inputMode="decimal" placeholder="Ej. 1.230,00" value={pc} onChange={(ev) => setPc(ev.target.value)} />
        <label className="ptar-admin-precio-lbl" htmlFor="pp-pt" style={{ marginTop: '0.6rem' }}>Transportista (base sin IVA) · opcional</label>
        <input id="pp-pt" type="text" inputMode="decimal" placeholder="Ej. 1.050,00" value={pt} onChange={(ev) => setPt(ev.target.value)} />
        <p className="ptar-admin-precio-note">El cliente lo verá en su panel con el IVA. Al aceptarlo, el envío pasa a programado.</p>
      </div>
      {(error ?? fallo) && <div className="pt-aviso error" style={{ marginTop: '0.8rem' }}><div>{error ?? fallo}</div></div>}
    </Modal>
  );
}
