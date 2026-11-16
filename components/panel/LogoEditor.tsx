'use client';

// Editor de logo (usuario, 2026-11-16): el mismo diseño que el logo de un transportista
// propio —vista previa en cuadro 1:1 con la ✕ encima y la caja de subida de toda la
// plataforma (hacer foto · galería o archivo · arrastrar)—, para el logo de la EMPRESA del
// cliente. Sirve en la ficha del cliente (Dynamo) y en Mi cuenta → Datos empresa (el
// cliente). Sube y quita AL MOMENTO; subir otro sustituye al que hubiera.
import { useEffect, useState } from 'react';
import CajaSubir from './CajaSubir';
import { subirDocumentoDirecto } from './Documentos';
import { documentosDe, quitarDocumento, type Dueno } from '@/app/panel/(app)/documentos/acciones';

export default function LogoEditor({ dueno, etiqueta, uso, onCambio }: {
  dueno: Dueno;
  etiqueta: React.ReactNode;       // el título del campo
  uso: string;                     // dónde se verá («arriba en tu panel…»)
  onCambio?: () => void;           // tras subir o quitar
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [docId, setDocId] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [trabajando, setTrabajando] = useState(false);
  const [vez, setVez] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // El visor /panel/documentos/<id> no vale de src directo (no-store y varios saltos: el
  // navegador lo re-pediría a cada pintado): se descarga UNA vez y se pinta desde memoria.
  useEffect(() => {
    let vivo = true; let blobUrl: string | null = null;
    setCargando(true);
    (async () => {
      try {
        const l = (await documentosDe(dueno)).find((x) => x.tipo === 'logo');
        if (vivo) setDocId(l?.id ?? null);
        if (!l) { if (vivo) setUrl(null); return; }
        const r = await fetch(`/panel/documentos/${l.id}`);
        if (!r.ok) { if (vivo) setUrl(null); return; }
        blobUrl = URL.createObjectURL(await r.blob());
        if (vivo) setUrl(blobUrl);
      } catch { if (vivo) setUrl(null); }
      finally { if (vivo) setCargando(false); }
    })();
    return () => { vivo = false; if (blobUrl) URL.revokeObjectURL(blobUrl); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dueno.campo, dueno.id, vez]);

  const hecho = () => { setVez((x) => x + 1); onCambio?.(); };
  async function quitar() {
    if (!docId) return;
    setError(null); setTrabajando(true);
    const r = await quitarDocumento(docId);
    setTrabajando(false);
    if (!r.ok) { setError(r.error); return; }
    hecho();
  }
  async function subir(f: File) {
    if (f.size > 25 * 1024 * 1024) { setError('El logo pasa de 25 MB.'); return; }
    setError(null); setTrabajando(true);
    if (docId) {
      const q = await quitarDocumento(docId);
      if (!q.ok) { setTrabajando(false); setError(q.error); return; }
    }
    const r = await subirDocumentoDirecto(dueno, f, 'logo');
    setTrabajando(false);
    if (!r.ok) { setError(r.error); return; }
    hecho();
  }

  return (
    <div>
      <label style={{ display: 'block', fontWeight: 700, color: 'var(--navy)', fontSize: 'var(--fs-m)', marginBottom: '0.3rem' }}>{etiqueta}</label>
      {(url || cargando) && (
        <div style={{ display: 'flex', gap: '0.7rem', alignItems: 'center', margin: '0.2rem 0 0.55rem' }}>
          <div style={{ position: 'relative', width: 112, height: 112, flex: 'none', border: '1px solid var(--gray-200)', borderRadius: 12, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'visible' }}>
            {url
              ? <img src={url} alt="Logo de la empresa" style={{ maxWidth: '92%', maxHeight: '92%', objectFit: 'contain', borderRadius: 10 }} />
              : <span style={{ fontSize: 'var(--fs-s)', color: 'var(--gray-500)' }}>Cargando…</span>}
            {url && docId && (
              <button type="button" aria-label="Quitar el logo" title="Quitar el logo" disabled={trabajando} onClick={quitar}
                style={{ position: 'absolute', top: -9, right: -9, width: 24, height: 24, borderRadius: '50%', border: '1.5px solid var(--gray-200)', background: '#fff', color: 'var(--red)', fontWeight: 800, fontSize: 15, lineHeight: 1, cursor: 'pointer', boxShadow: '0 1px 4px rgba(10,2,48,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>×</button>
            )}
          </div>
          <div style={{ fontSize: 'var(--fs-s)', color: 'var(--gray-500)', lineHeight: 1.45 }}>Vista previa en cuadro 1:1 — así quedará {uso}.{url ? ' Para cambiarlo, sube otro (sustituye a este) o quítalo con la ✕.' : ''}</div>
        </div>
      )}
      <CajaSubir multiple={false} accept="image/jpeg,image/png,image/webp,image/heic,image/heif" disabled={trabajando}
        onFiles={(fs) => { const f = fs[0]; if (f) void subir(f); }}
        sub={trabajando ? <strong>Guardando el logo…</strong> : 'JPG, PNG, WEBP o HEIC · máx. 25 MB · si ya hay logo, el nuevo lo sustituye'} />
      {error && <div className="wiz-warn show" role="alert" style={{ marginTop: '0.5rem' }}>⚠ {error}</div>}
    </div>
  );
}
