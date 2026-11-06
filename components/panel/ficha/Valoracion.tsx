'use client';

import { useState } from 'react';
import type { Ficha } from '@/lib/fichaEnvio';
import { valorarTransportista } from '@/app/panel/(app)/envios/acciones';

// ---- Valoración del transportista (solo Dynamo, al entregar) ------------------------
export function Valoracion({ ficha, hacer, trabajando }: { ficha: Ficha; hacer: (t: string, fn: () => Promise<any>, ok?: string) => Promise<boolean>; trabajando: string | null }) {
  const e = ficha.envio;
  const [nota, setNota] = useState<number | null>(e.valoracion_transportista ?? null);
  const [com, setCom] = useState<string>(e.valoracion_comentario ?? '');
  const cambiado = nota !== (e.valoracion_transportista ?? null) || com !== (e.valoracion_comentario ?? '');
  return <>
    <h4 className="modal-section-title">Valoración del transportista <span style={{ color: 'var(--red)', fontWeight: 800, fontSize: 'var(--fs-s)' }}>· solo admin</span></h4>
    <div className="det-block">
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', flexWrap: 'wrap' }}>
        <div className="valora-estrellas" role="radiogroup" aria-label="Nota de 1 a 5">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" role="radio" aria-checked={nota === n} aria-label={`${n} de 5`} className={nota != null && n <= nota ? 'on' : ''} onClick={() => setNota(nota === n ? null : n)}>★</button>
          ))}
        </div>
        <span style={{ fontSize: 'var(--fs-m)', color: 'var(--gray-500)' }}>{nota ? `${nota} de 5` : 'Sin valorar'} · {ficha.transportista?.nombre}</span>
      </div>
      <textarea rows={2} maxLength={1000} style={{ marginTop: '0.6rem', width: '100%' }} placeholder="Comentario interno (puntualidad, trato, incidencias…) · opcional"
        value={com} onChange={(ev) => setCom(ev.target.value)} />
      <div style={{ marginTop: '0.5rem' }}>
        <button className="btn-primary" disabled={!cambiado || !!trabajando} onClick={() => hacer('Guardando la valoración', () => valorarTransportista(e.id, nota, com))}>Guardar valoración</button>
      </div>
    </div>
  </>;
}
