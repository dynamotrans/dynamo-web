'use client';

// VERIFICACIÓN DE ALBARANES (usuario, 2026-11-22). Los albaranes, CMR y DeCA firmados que mandan
// los transportistas (los clasifica la tarea de Claude y los sube el script de Drive) esperan
// aquí, invisibles para el cliente. Se revisan uno a uno, como en un carrusel:
//   ✓ Aceptar          → al envío, visible para el cliente (le llega el aviso).
//   ⏭ Dejar pendiente  → no cambia nada: se salta en esta pasada y vuelve a salir la próxima vez.
//   ✕ Rechazar         → se borra el archivo (p. ej. lleva nuestros precios o es una factura).
//   «Quitar esta hoja» → en cada hoja de un PDF (usuario, 2026-11-28): si se coló una hoja que no
//                        vale (la factura del transportista, con precios), se marca y al aceptar
//                        el cliente recibe el PDF sin ella. Se puede volver a poner antes de aceptar.
// Si la clasificación leyó mal la referencia, se cambia el envío (y su GX en el nombre).
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { aceptarAlbaran, rechazarAlbaran, reasignarAlbaran, tipoAlbaran } from '@/app/panel/(app)/verificacion-albaranes/acciones';
import { fecha, fechaHora } from '@/lib/formato';
import { nombreEstado, colorEstado } from '@/lib/estados';

export type AlbaranPendiente = {
  id: string; tipo: 'albaran' | 'cmr_firmado' | 'otro'; nombre_archivo: string; tipo_mime: string | null; tamano_bytes: number | null;
  referencia: string | null; recibido_en: string;
  datos: { fecha?: string | null; origen?: string | null; destino?: string | null; matriculas?: string | null; referencia_original?: string | null };
  envio: { id: string; referencia: string; estado: string; cliente: string | null; transportista: string | null; fecha_carga: string | null;
    origen: string | null; destino: string | null; documentos_visibles: number } | null;
};

const TIPOS: [AlbaranPendiente['tipo'], string][] = [['albaran', 'Albarán / DeCA firmado'], ['cmr_firmado', 'CMR firmado'], ['otro', 'Otro documento']];
const MOTIVOS = ['Lleva hojas con nuestros precios', 'Es una factura del transportista', 'No es de este envío', 'No se lee bien'];

export default function VerificacionAlbaranes({ lista: inicial, soloLectura }: { lista: AlbaranPendiente[]; soloLectura: boolean }) {
  const router = useRouter();
  const [lista, setLista] = useState(inicial);
  const [i, setI] = useState(0);
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<{ t: 'ok' | 'err'; m: string } | null>(null);
  const [ref, setRef] = useState('');
  const [rechazo, setRechazo] = useState<string | null>(null);   // motivo mientras se confirma el rechazo
  const [saltados, setSaltados] = useState(0);
  const [quitadas, setQuitadas] = useState<number[]>([]);   // hojas marcadas para quitar (1 = la primera)
  const [paginas, setPaginas] = useState(0);
  const [version, setVersion] = useState(0);                // vuelve a dibujar el documento si cambió en el almacén
  const a = lista[Math.min(i, Math.max(lista.length - 1, 0))];

  useEffect(() => { setRef(''); setRechazo(null); setQuitadas([]); setPaginas(0); }, [a?.id]);
  const alternarHoja = (n: number) => setQuitadas((q) => (q.includes(n) ? q.filter((x) => x !== n) : [...q, n].sort((x, y) => x - y)));
  const todasFuera = paginas > 0 && quitadas.length >= paginas;

  const ir = useCallback((d: number) => { if (lista.length) setI((x) => (x + d + lista.length) % lista.length); }, [lista.length]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('input,textarea,select')) return;
      if (e.key === 'ArrowRight') ir(1); else if (e.key === 'ArrowLeft') ir(-1);
    };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [ir]);

  const quitar = (id: string, m: string) => {
    setLista((l) => l.filter((x) => x.id !== id));
    setI((x) => Math.max(0, Math.min(x, lista.length - 2)));
    setAviso({ t: 'ok', m });
    router.refresh();   // el contador del menú
  };

  async function aceptar() {
    if (!a) return;
    setOcupado(true); setAviso(null);
    const sin = quitadas.length;
    const r = await aceptarAlbaran(a.id, a.tipo, quitadas);
    setOcupado(false);
    if (r.ok) quitar(a.id, `✓ Aceptado${sin ? ` sin ${sin === 1 ? 'la hoja quitada' : `las ${sin} hojas quitadas`}` : ''}: ya lo ve el cliente en el envío #${a.envio?.referencia ?? ''}.`);
    else {
      setAviso({ t: 'err', m: r.error });
      // Si las hojas sí se quitaron y lo que falló fue aceptar, el archivo ya es otro: se vuelve a dibujar.
      if (sin) { setQuitadas([]); setVersion((v) => v + 1); }
    }
  }
  async function rechazar() {
    if (!a || rechazo === null) return;
    setOcupado(true); setAviso(null);
    const r = await rechazarAlbaran(a.id, rechazo);
    setOcupado(false);
    if (r.ok) quitar(a.id, '✕ Rechazado y borrado. Si hace falta, súbelo a mano en los documentos del envío.'); else setAviso({ t: 'err', m: r.error });
  }
  function pendiente() {
    setAviso({ t: 'ok', m: 'Se queda pendiente: volverá a salir la próxima vez.' });
    setSaltados((n) => n + 1);
    ir(1);
  }
  async function reasignar() {
    if (!a || !ref.trim()) return;
    setOcupado(true); setAviso(null);
    const r = await reasignarAlbaran(a.id, ref);
    setOcupado(false);
    if (!r.ok) { setAviso({ t: 'err', m: r.error }); return; }
    setAviso({ t: 'ok', m: `Cambiado de envío. Nombre nuevo: ${r.nombre}` });
    router.refresh();
    // Los datos del envío nuevo llegan con la recarga; mientras, el nombre ya cambia aquí.
    setLista((l) => l.map((x) => (x.id === a.id ? { ...x, nombre_archivo: r.nombre ?? x.nombre_archivo, referencia: ref.trim().toUpperCase() } : x)));
  }
  async function cambiarTipo(t: AlbaranPendiente['tipo']) {
    if (!a) return;
    setLista((l) => l.map((x) => (x.id === a.id ? { ...x, tipo: t } : x)));
    const r = await tipoAlbaran(a.id, t);
    if (!r.ok) setAviso({ t: 'err', m: r.error });
  }
  // Tras router.refresh() llega la lista nueva del servidor: se toman sus datos (envío reasignado).
  useEffect(() => {
    setLista((l) => l.map((x) => inicial.find((y) => y.id === x.id) ?? x).filter((x) => inicial.some((y) => y.id === x.id)));
  }, [inicial]);

  return (
    <section className="section active" aria-labelledby="tituloVerif">
      <div className="sec-header" style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', flexWrap: 'wrap' }}>
        <h2 id="tituloVerif" style={{ margin: 0 }}>Verificación de albaranes ({lista.length})</h2>
        {lista.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginLeft: 'auto' }}>
            <button type="button" className="btn-secondary" onClick={() => ir(-1)} aria-label="Anterior">‹</button>
            <span data-verif-posicion="" style={{ fontWeight: 700, minWidth: 70, textAlign: 'center' }}>{Math.min(i, lista.length - 1) + 1} de {lista.length}</span>
            <button type="button" className="btn-secondary" onClick={() => ir(1)} aria-label="Siguiente">›</button>
          </div>
        )}
      </div>
      <p className="meta" style={{ margin: '0.2rem 0 0.8rem' }}>
        Albaranes, CMR y DeCA firmados que mandan los transportistas. Hasta que los aceptes, el cliente no los ve.
        {saltados > 0 && ` · ${saltados} dejado${saltados === 1 ? '' : 's'} pendiente${saltados === 1 ? '' : 's'} en esta pasada.`}
      </p>
      {aviso && <div className={`pt-aviso ${aviso.t === 'ok' ? 'ok' : 'error'}`} role="status" style={{ marginBottom: '0.7rem' }}><div>{aviso.m}</div></div>}

      {!a ? (
        <div className="pt-aviso ok" style={{ maxWidth: 640 }}><div><strong>Todo revisado.</strong> No queda ningún albarán pendiente de verificar.</div></div>
      ) : (
        <>
          {/* Tira del carrusel: un chip por documento para saltar directamente. */}
          <div role="tablist" aria-label="Albaranes pendientes" style={{ display: 'flex', gap: '0.35rem', overflowX: 'auto', paddingBottom: '0.4rem', marginBottom: '0.6rem' }}>
            {lista.map((x, k) => (
              <button key={x.id} type="button" role="tab" aria-selected={x.id === a.id} onClick={() => setI(k)}
                style={{ flex: '0 0 auto', borderRadius: 999, padding: '0.25rem 0.7rem', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer',
                  border: `1.5px solid ${x.id === a.id ? 'var(--purple)' : 'var(--gray-300)'}`, background: x.id === a.id ? 'var(--purple)' : '#fff',
                  color: x.id === a.id ? '#fff' : x.envio ? 'var(--navy)' : '#b45309' }}>
                {x.referencia ?? 'Sin GX'}{!x.envio && ' ⚠'}
              </button>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: '1rem' }} className="verif-rejilla">
            <VisorDocumento key={`${a.id}-${version}`} id={a.id} mime={a.tipo_mime} nombre={a.nombre_archivo}
              quitadas={quitadas} onAlternar={soloLectura || ocupado ? undefined : alternarHoja} onPaginas={setPaginas} />

            <div className="card" style={{ padding: '0.9rem 1rem', alignSelf: 'start' }}>
              <div style={{ fontSize: '0.8rem', color: 'var(--gray-500)', wordBreak: 'break-all' }} data-verif-nombre="">{a.nombre_archivo}</div>
              <div className="meta" style={{ marginTop: '0.2rem' }}>Recibido {fechaHora(a.recibido_en)}{a.tamano_bytes ? ` · ${Math.round(a.tamano_bytes / 1024)} KB` : ''}</div>
              {(a.datos.origen || a.datos.destino || a.datos.matriculas || a.datos.fecha) && (
                <div className="meta" style={{ marginTop: '0.2rem' }}>
                  Del nombre: {[a.datos.fecha && fecha(a.datos.fecha), [a.datos.origen, a.datos.destino].filter(Boolean).join(' → '), a.datos.matriculas].filter(Boolean).join(' · ')}
                </div>
              )}

              <label className="lbl" htmlFor="verifTipo" style={{ display: 'block', marginTop: '0.7rem', fontWeight: 700, fontSize: '0.8rem' }}>Qué es</label>
              <select id="verifTipo" value={a.tipo} disabled={soloLectura || ocupado} onChange={(e) => cambiarTipo(e.target.value as AlbaranPendiente['tipo'])} style={{ width: '100%' }}>
                {TIPOS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
              </select>

              <div style={{ marginTop: '0.8rem', padding: '0.6rem 0.7rem', borderRadius: 10, background: a.envio ? 'var(--gray-50, #f9fafb)' : '#fff7ed', border: `1px solid ${a.envio ? 'var(--gray-200)' : '#fdba74'}` }} data-verif-envio="">
                {a.envio ? <>
                  <div style={{ fontWeight: 800 }}>
                    <a href={`/panel/envios?ver=${a.envio.id}`} target="_blank" rel="noopener">Envío #{a.envio.referencia}</a>
                    <span className={`badge badge-${colorEstado(a.envio.estado)}`} style={{ marginLeft: 6 }}>{nombreEstado(a.envio.estado)}</span>
                  </div>
                  <div className="meta">{a.envio.cliente ?? '—'}{a.envio.transportista ? ` · ${a.envio.transportista}` : ''}</div>
                  <div className="meta">{[a.envio.origen, a.envio.destino].filter(Boolean).join(' → ')}{a.envio.fecha_carga ? ` · carga ${fecha(a.envio.fecha_carga)}` : ''}</div>
                  {a.envio.documentos_visibles > 0 && <div className="meta" style={{ color: '#b45309' }}>Ya tiene {a.envio.documentos_visibles} albarán/CMR visible para el cliente.</div>}
                  {a.datos.referencia_original && <div className="meta">Antes venía como {a.datos.referencia_original}.</div>}
                </> : <div style={{ color: '#9a3412', fontWeight: 700 }}>
                  {a.referencia ? `No hay ningún envío con la referencia ${a.referencia}.` : 'El nombre no trae referencia GX.'} Escribe la buena para poder aceptarlo.
                </div>}
              </div>

              {!soloLectura && (
                <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.6rem' }}>
                  <input type="text" aria-label="Referencia GX del envío" placeholder="Cambiar envío: GX…" value={ref} onChange={(e) => setRef(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') void reasignar(); }} style={{ flex: 1, minWidth: 0 }} />
                  <button type="button" className="btn-secondary" disabled={ocupado || !ref.trim()} onClick={reasignar}>Cambiar</button>
                </div>
              )}

              {soloLectura ? <p className="meta" style={{ marginTop: '0.8rem' }}>Tu usuario es de solo lectura.</p> : rechazo === null ? (
                <div style={{ display: 'grid', gap: '0.45rem', marginTop: '1rem' }}>
                  {quitadas.length > 0 && (
                    <div className="pt-aviso info" role="status" data-verif-quitadas=""><div>
                      {todasFuera ? <>Has quitado <strong>todas</strong> las hojas. Si no vale ninguna, recházalo.</>
                        : <>Se quita{quitadas.length === 1 ? ' la hoja' : 'n las hojas'} <strong>{quitadas.join(', ')}</strong>. El cliente recibirá el PDF con {paginas - quitadas.length} hoja{paginas - quitadas.length === 1 ? '' : 's'}. El original sigue en Drive.</>}
                    </div></div>
                  )}
                  <button type="button" className="btn-primary" disabled={ocupado || !a.envio || todasFuera} onClick={aceptar}
                    style={{ background: '#16a34a', borderColor: '#16a34a' }}>
                    {quitadas.length ? `✓ Aceptar sin ${quitadas.length === 1 ? 'esa hoja' : `esas ${quitadas.length} hojas`} (lo verá el cliente)` : '✓ Aceptar (lo verá el cliente)'}
                  </button>
                  <button type="button" className="btn-secondary" disabled={ocupado} onClick={pendiente}>⏭ Dejar pendiente</button>
                  <button type="button" className="btn-secondary" disabled={ocupado} onClick={() => setRechazo('')}
                    style={{ color: '#b42318', borderColor: '#fca5a5' }}>✕ Rechazar</button>
                </div>
              ) : (
                <div style={{ marginTop: '1rem', padding: '0.7rem', borderRadius: 10, border: '1.5px solid #fca5a5', background: '#fef2f2' }}>
                  <strong style={{ color: '#b42318' }}>¿Rechazar y borrar este archivo?</strong>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', margin: '0.4rem 0' }}>
                    {MOTIVOS.map((m) => <button key={m} type="button" className="btn-secondary" style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem' }} onClick={() => setRechazo(m)}>{m}</button>)}
                  </div>
                  <textarea aria-label="Motivo del rechazo" placeholder="Motivo (opcional)" maxLength={500} value={rechazo} onChange={(e) => setRechazo(e.target.value)} rows={2} style={{ width: '100%' }} />
                  <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.4rem' }}>
                    <button type="button" className="btn-primary" disabled={ocupado} onClick={rechazar} style={{ background: '#b42318', borderColor: '#b42318' }}>Sí, rechazar</button>
                    <button type="button" className="btn-secondary" disabled={ocupado} onClick={() => setRechazo(null)}>Volver</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}
      <style>{`.verif-visor { height: 52vh; } @media (min-width: 980px) { .verif-rejilla { grid-template-columns: minmax(0, 1fr) 340px !important; } .verif-visor { height: min(75vh, 900px); } }`}</style>
    </section>
  );
}

// El documento, todas sus páginas una debajo de otra (PDF.js: funciona igual en el móvil, donde
// el visor de PDF del navegador solo enseña la primera hoja). Las imágenes, tal cual. En los PDF
// de más de una hoja, cada hoja lleva su botón «Quitar esta hoja» / «Volver a poner».
const MAX_HOJAS = 30;
function VisorDocumento({ id, mime, nombre, quitadas, onAlternar, onPaginas }: {
  id: string; mime: string | null; nombre: string; quitadas: number[];
  onAlternar?: (n: number) => void; onPaginas: (n: number) => void;
}) {
  const lienzos = useRef<(HTMLCanvasElement | null)[]>([]);
  const ancho = useRef<HTMLDivElement>(null);
  const [estado, setEstado] = useState<'cargando' | 'listo' | 'fallo'>('cargando');
  const [doc, setDoc] = useState<{ numPages: number; getPage: (n: number) => Promise<unknown> } | null>(null);
  const url = `/api/verificacion-albaranes/archivo/${id}`;
  const esPdf = !mime || mime === 'application/pdf';
  const paginas = doc?.numPages ?? 0;

  useEffect(() => {
    if (!esPdf) return;
    let vivo = true;
    (async () => {
      try {
        const pdfjs = await import('pdfjs-dist');
        pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
        const datos = new Uint8Array(await (await fetch(url, { cache: 'no-store' })).arrayBuffer());
        const d = await pdfjs.getDocument({ data: datos, isEvalSupported: false }).promise;
        if (!vivo) return;
        setDoc(d as unknown as { numPages: number; getPage: (n: number) => Promise<unknown> });
        onPaginas(d.numPages);
      } catch { if (vivo) setEstado('fallo'); }
    })();
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, esPdf]);

  // Con las hojas ya en pantalla (un lienzo por hoja), se dibujan una a una.
  useEffect(() => {
    if (!doc) return;
    let vivo = true;
    (async () => {
      try {
        const w = ancho.current?.clientWidth || 800;
        for (let n = 1; n <= Math.min(doc.numPages, MAX_HOJAS); n++) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const pag = (await doc.getPage(n)) as any;
          const c = lienzos.current[n - 1];
          if (!vivo || !c) return;
          const v1 = pag.getViewport({ scale: 1 });
          const dpr = Math.min(window.devicePixelRatio || 1, 2);
          const vp = pag.getViewport({ scale: (w / v1.width) * dpr });
          c.width = Math.floor(vp.width); c.height = Math.floor(vp.height);
          await pag.render({ canvasContext: c.getContext('2d')!, viewport: vp }).promise;
          if (n === 1) setEstado('listo');
        }
      } catch { if (vivo) setEstado('fallo'); }
    })();
    return () => { vivo = false; };
  }, [doc]);

  return (
    <div className="card" style={{ padding: '0.6rem', background: '#eef0f4' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '0 0 0.4rem', fontSize: '0.8rem' }}>
        <span className="meta">{esPdf ? (paginas ? `${paginas} página${paginas === 1 ? '' : 's'}${quitadas.length ? ` · ${quitadas.length} quitada${quitadas.length === 1 ? '' : 's'}` : ''}` : 'PDF') : 'Imagen'}</span>
        <a href={url} target="_blank" rel="noopener" style={{ fontWeight: 700 }}>Abrir a pantalla completa ↗</a>
      </div>
      <div data-verif-visor="" className="verif-visor" style={{ overflowY: 'auto', borderRadius: 8 }}>
        {esPdf ? <>
          {estado === 'cargando' && <p className="meta" style={{ padding: '1rem' }}>Cargando el documento…</p>}
          {estado === 'fallo' && <p className="meta" style={{ padding: '1rem' }}>No se ha podido dibujar el PDF aquí. Ábrelo a pantalla completa con el enlace de arriba.</p>}
          {paginas > MAX_HOJAS && <p className="meta" style={{ padding: '0 0.3rem 0.4rem' }}>Se ven las {MAX_HOJAS} primeras hojas de {paginas}.</p>}
          <div ref={ancho} data-verif-paginas="">
            {Array.from({ length: Math.min(paginas, MAX_HOJAS) }, (_, k) => {
              const n = k + 1;
              const fuera = quitadas.includes(n);
              return (
                <div key={n} data-verif-hoja={n} data-quitada={fuera ? '' : undefined} style={{ position: 'relative', marginBottom: 8 }}>
                  <canvas ref={(el) => { lienzos.current[k] = el; }} aria-label={`Página ${n} de ${paginas}`}
                    style={{ width: '100%', display: 'block', boxShadow: '0 1px 4px rgba(0,0,0,.15)', background: '#fff', opacity: fuera ? 0.25 : 1 }} />
                  {fuera && (
                    <div aria-hidden="true" style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none',
                      border: '3px solid #b42318', borderRadius: 4, background: 'repeating-linear-gradient(135deg, rgba(180,35,24,.06) 0 12px, transparent 12px 24px)' }}>
                      <span style={{ background: '#b42318', color: '#fff', fontWeight: 800, padding: '0.3rem 0.8rem', borderRadius: 999 }}>Hoja {n} quitada</span>
                    </div>
                  )}
                  {onAlternar && paginas > 1 && (
                    <button type="button" className="btn-secondary" onClick={() => onAlternar(n)}
                      aria-label={fuera ? `Volver a poner la hoja ${n}` : `Quitar la hoja ${n}`}
                      style={{ position: 'absolute', top: 8, right: 8, fontSize: '0.78rem', padding: '0.3rem 0.65rem', background: '#fff',
                        color: fuera ? 'var(--navy)' : '#b42318', borderColor: fuera ? 'var(--gray-300)' : '#fca5a5', boxShadow: '0 1px 3px rgba(0,0,0,.2)' }}>
                      {fuera ? '↺ Volver a poner' : '✕ Quitar esta hoja'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </> : (
          <img src={url} alt={nombre} style={{ width: '100%', display: 'block' }} />
        )}
      </div>
    </div>
  );
}
