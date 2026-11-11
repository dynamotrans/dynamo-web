'use client';

// Casillas 7, 8 y 12 del CMR (bultos, embalaje, volumen), dentro de «Mercancía» de la
// ficha del envío. Opcionales; si se dejan en blanco el CMR sale con «—».
import { useEffect, useState } from 'react';
import { guardarDatosCmr, leerDatosCmr, type DatosCmr as Datos } from '@/app/panel/(app)/envios/acciones-cmr';
import { IcoAviso } from '@/components/Iconos';
// Etiquetas según el criterio único (usuario, 2026-11-09).
import Req from '@/components/Req';

const txt = (n: number | null) => (n == null ? '' : String(n).replace('.', ','));
const EMBALAJES = ['Palet europeo', 'Palet americano', 'Cajas', 'Big bag', 'Bobinas', 'Granel en sacos', 'Sin embalaje'];

const VACIO: Datos = { num_bultos: null, embalaje: null, volumen_m3: null, firmado: false };

export default function DatosCmr({ envioId, puedeEditar, bloquearSiFirmado = false }: { envioId: string; puedeEditar: boolean; bloquearSiFirmado?: boolean }) {
  const [d, setD] = useState<Datos | null>(null);
  const [editando, setEditando] = useState(false);
  const [f, setF] = useState({ b: '', e: '', v: '' });
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => { leerDatosCmr(envioId).then((x) => setD(x ?? VACIO)); }, [envioId]);
  const abrir = () => { setF({ b: txt(d?.num_bultos ?? null), e: d?.embalaje ?? '', v: txt(d?.volumen_m3 ?? null) }); setError(null); setEditando(true); };
  const resumen = d && [d.num_bultos != null && `${d.num_bultos} ${d.num_bultos === 1 ? 'bulto' : 'bultos'}`, d.embalaje, d.volumen_m3 != null && `${txt(d.volumen_m3)} m³`].filter(Boolean).join(' · ');

  if (!editando) {
    return (
      <div style={{ gridColumn: '1/-1' }}>
        <label>Para el CMR · bultos, embalaje y volumen</label>
        <span className="v" style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
          {d === null ? '…' : resumen || <span style={{ color: 'var(--gray-500)', fontWeight: 500 }}>Sin rellenar (el CMR sale con «—»)</span>}
          {puedeEditar && d && !(bloquearSiFirmado && d.firmado) && <button type="button" className="btn-ghost" style={{ padding: '0.2rem 0.6rem' }} onClick={abrir}>{resumen ? 'Cambiar' : 'Rellenar'}</button>}
        </span>
      </div>
    );
  }
  return (
    <div style={{ gridColumn: '1/-1' }}>
      <label>Para el CMR · bultos, embalaje y volumen</label>
      {error && <div className="pt-aviso error" role="alert" style={{ margin: '0.3rem 0' }}><IcoAviso /><div>{error}</div></div>}
      <div className="ptar-sitio-grid" style={{ marginTop: '0.3rem' }}>
        <div><label htmlFor={`cmr-b-${envioId}`}>Nº de bultos (casilla 7) <Req si={false} /></label>
          <input id={`cmr-b-${envioId}`} inputMode="numeric" value={f.b} onChange={(ev) => setF({ ...f, b: ev.target.value })} placeholder="Ej. 33" /></div>
        <div><label htmlFor={`cmr-v-${envioId}`}>Volumen en m³ (casilla 12) <Req si={false} /></label>
          <input id={`cmr-v-${envioId}`} inputMode="decimal" value={f.v} onChange={(ev) => setF({ ...f, v: ev.target.value })} placeholder="Ej. 86" /></div>
        <div style={{ gridColumn: '1/-1' }}><label htmlFor={`cmr-e-${envioId}`}>Embalaje (casilla 8) <Req si={false} /></label>
          <input id={`cmr-e-${envioId}`} list={`cmr-emb-${envioId}`} maxLength={60} value={f.e} onChange={(ev) => setF({ ...f, e: ev.target.value })} placeholder="Ej. palet europeo" />
          <datalist id={`cmr-emb-${envioId}`}>{EMBALAJES.map((x) => <option key={x} value={x} />)}</datalist></div>
      </div>
      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
        <button type="button" className="btn-primary" disabled={guardando} onClick={async () => {
          setGuardando(true);
          const r = await guardarDatosCmr(envioId, f.b, f.e, f.v);
          setGuardando(false);
          if (r.error) { setError(r.error); return; }
          setEditando(false); setD((await leerDatosCmr(envioId)) ?? VACIO);
        }}>{guardando ? 'Guardando…' : 'Guardar'}</button>
        <button type="button" className="btn-secondary" disabled={guardando} onClick={() => setEditando(false)}>Cancelar</button>
      </div>
    </div>
  );
}
