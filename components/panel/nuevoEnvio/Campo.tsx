'use client';

import Req from '@/components/Req';

// req: true = «· obligatorio», false = «· opcional», sin definir = sin etiqueta.
export function Campo({ l, v, on, ph, req, id }: { l: string; v: string; on: (v: string) => void; ph?: string; req?: boolean; id?: string }) {
  return (
    <div>
      <label className="ptar-admin-precio-lbl" htmlFor={id} style={{ marginTop: '0.6rem', display: 'block' }}>{l}{req !== undefined && <> <Req si={req} /></>}</label>
      <input id={id} type="text" value={v} placeholder={ph} onChange={(e) => on(e.target.value)} />
    </div>
  );
}
