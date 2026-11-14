'use client';

import { fechaHora } from '@/lib/formato';
import CajaSubir from './CajaSubir';

// Documentos de una ficha (envío, incidencia, penalización, transportista, almacenamiento,
// operador o usuario), con el diseño de los adjuntos del mockup (.modal-file-drop y
// .modal-file-list). El fichero va DIRECTO del navegador al bucket privado de Supabase
// (sin pasar por Vercel) y luego se registra su fila con su huella sha256. Abrir = enlace
// firmado de un minuto, en el visor (regla 0-bis). Quitar = borrado suave.
import { useCallback, useEffect, useState } from 'react';
import { supabaseNavegador } from '@/lib/supabase/navegador';
import { documentosDe, rutaDeSubida, registrarDocumento, quitarDocumento, visibleParaCliente, type Dueno, type DocumentoFila } from '@/app/panel/(app)/documentos/acciones';

export const TIPOS_DOC: Record<string, string> = {
  albaran: 'Albarán', cmr: 'CMR', cmr_firmado: 'CMR firmado', orden_carga: 'Orden de carga', proforma: 'Proforma',
  seguro_cmr: 'Seguro CMR', tarjeta_transporte: 'Tarjeta de transporte', foto_incidencia: 'Foto', gps_tacografo: 'GPS / tacógrafo',
  hoja_cif: 'Hoja CIF', dni: 'DNI', logo: 'Logo', adjunto: 'Adjunto', otro: 'Otro',
};
export const MAX_BYTES = 25 * 1024 * 1024;
export const ACEPTA = 'application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif';
export const tamano = (b: number | null) => (b == null ? '' : b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1).replace('.', ',')} MB`);
async function huella(f: File): Promise<string> {
  const h = await crypto.subtle.digest('SHA-256', await f.arrayBuffer());
  return [...new Uint8Array(h)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

// Sube UN fichero al bucket y registra su fila: lo usan la lista de abajo y los adjuntos
// elegidos ANTES de crear la ficha (p. ej. reportar incidencia), que se suben al guardar.
export async function subirDocumentoDirecto(dueno: Dueno, f: File, tipo: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const sb = supabaseNavegador();
  if (!sb) return { ok: false, error: 'La plataforma no está conectada.' };
  const r = await rutaDeSubida(dueno, f.name);
  if (!r.ok) return r;
  const [{ error: e }, sha] = await Promise.all([
    sb.storage.from('documentos').upload(r.ruta, f, { contentType: f.type, upsert: false }),
    huella(f),
  ]);
  if (e) return { ok: false, error: `No se ha podido subir «${f.name}»: ${/row-level|policy|403/i.test(e.message) ? 'no tienes permiso' : e.message}.` };
  return registrarDocumento(dueno, { tipo, ruta: r.ruta, nombre: f.name, mime: f.type, tamano: f.size, sha256: sha, visible_cliente: false });
}

export default function Documentos({ dueno, tipos, max, conVisibleCliente = false, soloImagen = false, ayuda, editable = true, sinQuitar = false, onCambio }: {
  dueno: Dueno; tipos: string[]; max?: number; conVisibleCliente?: boolean; soloImagen?: boolean; ayuda?: React.ReactNode; editable?: boolean;
  sinQuitar?: boolean;   // puede subir pero no quitar (clientes y transportistas: retirar un documento es cosa de Dynamo)
  onCambio?: () => void;   // avisa al padre cada vez que la lista cambia (p. ej. vista previa del logo)
}) {
  const [docs, setDocs] = useState<DocumentoFila[] | null>(null);
  const [tipo, setTipo] = useState(tipos[0]);
  const [subiendo, setSubiendo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [quitar, setQuitar] = useState<DocumentoFila | null>(null);

  const cargar = useCallback(() => { documentosDe(dueno).then((d) => { setDocs(d); onCambio?.(); }); }, [dueno.campo, dueno.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { cargar(); }, [cargar]);
  const lleno = !!max && (docs?.length ?? 0) >= max;

  async function subir(lista: FileList | File[]) {
    setError(null);
    let quedan = max ? max - (docs?.length ?? 0) : Infinity;
    for (const f of Array.from(lista)) {
      if (quedan <= 0) { setError(`Como máximo ${max} documentos.`); break; }
      if (f.size > MAX_BYTES) { setError(`«${f.name}» pasa de 25 MB.`); continue; }
      if (!ACEPTA.split(',').includes(f.type) || (soloImagen && !f.type.startsWith('image/'))) { setError(`«${f.name}»: solo ${soloImagen ? 'imágenes' : 'PDF o imágenes (JPG, PNG, WEBP, HEIC)'}.`); continue; }
      setSubiendo(f.name);
      const r = await subirDocumentoDirecto(dueno, f, tipo);
      if (!r.ok) { setError(r.error); continue; }
      quedan--;
    }
    setSubiendo(null);
    cargar();
  }

  return (
    <div>
      {editable && (
        <>
          {tipos.length > 1 && (
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.45rem', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 'var(--fs-m)', color: 'var(--gray-500)', fontWeight: 600 }}>Tipo de documento:</span>
              <select className="filter-estado" value={tipo} onChange={(e) => setTipo(e.target.value)} aria-label="Tipo de documento" style={{ padding: '0.35rem 0.6rem', borderRadius: 8, border: '1.5px solid var(--gray-200)' }}>
                {tipos.map((t) => <option key={t} value={t}>{TIPOS_DOC[t] ?? t}</option>)}
              </select>
            </div>
          )}
          <CajaSubir onFiles={(f) => subir(f)} accept={soloImagen ? 'image/jpeg,image/png,image/webp' : ACEPTA}
            multiple={!max || max > 1} disabled={lleno || !!subiendo}
            sub={<>{subiendo ? <strong>Subiendo «{subiendo}»… · </strong> : lleno ? <strong>Máximo {max} documentos · </strong> : null}
              {soloImagen ? 'JPG, PNG o WEBP' : 'PDF, JPG, PNG, WEBP o HEIC'} · máx. 25 MB cada uno{max ? ` · hasta ${max}` : ''}</>} />
        </>
      )}
      {ayuda && <div style={{ fontSize: 'var(--fs-s)', color: 'var(--gray-500)', marginTop: '0.35rem', lineHeight: 1.45 }}>{ayuda}</div>}
      <ul className="modal-file-list">
        {docs === null ? <li style={{ color: 'var(--gray-500)', fontSize: 'var(--fs-m)' }}>Cargando documentos…</li>
          : docs.length === 0 ? (!editable ? <li style={{ color: 'var(--gray-500)', fontSize: 'var(--fs-m)' }}>No hay documentos.</li> : null)
          : docs.map((d) => (
            <li key={d.id} className="modal-file-item" style={{ flexWrap: 'wrap' }}>
              <span className="mfi-ico"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg></span>
              <a className="mfi-name" href={`/panel/documentos/${d.id}`} target="_blank" rel="noopener" title={`Ver ${d.nombre_archivo}`} style={{ textDecoration: 'none' }}>{d.nombre_archivo}</a>
              <span style={{ fontSize: 'var(--fs-s)', color: 'var(--gray-500)' }}>{TIPOS_DOC[d.tipo] ?? d.tipo} · {tamano(d.tamano_bytes)} · {fechaHora(d.creado_en)}{d.autor ? ` · ${d.autor}` : ''}</span>
              {conVisibleCliente && editable && (
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: 'var(--fs-s)', color: d.visible_cliente ? '#0f6b3a' : 'var(--gray-500)', fontWeight: 700, cursor: 'pointer' }}
                  title="Si lo marcas, el cliente lo verá en su panel">
                  <input type="checkbox" checked={d.visible_cliente} onChange={async (e) => { const r = await visibleParaCliente(d.id, e.target.checked); if (!r.ok) setError(r.error); cargar(); }} />
                  Lo ve el cliente
                </label>
              )}
              {editable && !sinQuitar && <button type="button" className="mfi-del" aria-label={`Quitar ${d.nombre_archivo}`} onClick={() => setQuitar(d)}>×</button>}
              {quitar?.id === d.id && (
                <div style={{ flexBasis: '100%', marginTop: '0.4rem', padding: '0.5rem 0.65rem', background: '#fdecec', border: '1px solid #f5b5b5', borderRadius: 8, fontSize: 'var(--fs-m)', color: '#b42318' }}>
                  ¿Quitar «{d.nombre_archivo}»? Deja de verse aquí, pero el fichero se conserva como prueba.
                  <span style={{ display: 'inline-flex', gap: '0.4rem', marginLeft: '0.5rem' }}>
                    <button type="button" className="btn-ghost" style={{ padding: '0.2rem 0.6rem' }} onClick={() => setQuitar(null)}>No</button>
                    <button type="button" className="btn-primary" style={{ padding: '0.2rem 0.6rem', background: 'var(--red)' }}
                      onClick={async () => { const r = await quitarDocumento(d.id); setQuitar(null); if (!r.ok) setError(r.error); cargar(); }}>Sí, quitar</button>
                  </span>
                </div>
              )}
            </li>
          ))}
      </ul>
      {error && <div className="wiz-warn show" role="alert" style={{ marginTop: '0.45rem' }}>⚠ {error}</div>}
    </div>
  );
}
