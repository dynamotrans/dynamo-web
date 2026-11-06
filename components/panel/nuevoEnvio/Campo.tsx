'use client';


export function Campo({ l, v, on, ph }: { l: string; v: string; on: (v: string) => void; ph?: string }) {
  return (
    <div>
      <label className="ptar-admin-precio-lbl" style={{ marginTop: '0.6rem', display: 'block' }}>{l}</label>
      <input type="text" value={v} placeholder={ph} onChange={(e) => on(e.target.value)} />
    </div>
  );
}
