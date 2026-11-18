'use client';

// CMR / carta de porte EN PAPEL desde la hoja de firmas (usuario, 2026-11-17): «¿No
// quieren firmar en el móvil? Puedes subir fotos del CMR / carta de porte aquí
// directamente y lo recibimos igualmente». Una ventana de subir de las de siempre —
// «Hacer foto» y «Galería o archivo», varias a la vez—, con la cuenta de páginas, una
// miniatura de cada una para quitarla y el botón de finalizar. Hasta 10 páginas, 20 MB
// cada una. Las páginas se suben al pulsar «Finalizar», no antes: quitar una miniatura no
// deja ficheros sueltos en el almacén.
import { useEffect, useRef, useState } from 'react';
import { supabaseNavegador } from '@/lib/supabase/navegador';
import { registrarCmrPapel } from './acciones';
import { tipoRealDeArchivo } from '@/lib/contenidoArchivo';

// DOS USOS de la misma ventana (usuario, 2026-11-17):
//   · 'papel' — en la hoja de firmas: las páginas del CMR / carta de porte firmada en papel.
//   · 'doc'   — en la pantalla de firma: fotos de documentos adicionales del transporte.
// Cada uno guarda en su sitio (su prefijo en el almacén y su función en la base de datos).
type Clase = 'papel' | 'doc';
const TEXTOS: Record<Clase, { titulo: string; ayuda: React.ReactNode; finalizar: string; etiqueta: string; hecho: (n: number) => React.ReactNode; recibidas: (n: number) => string }> = {
  papel: {
    titulo: 'CMR / carta de porte en papel', etiqueta: 'Subir el CMR / carta de porte en papel',
    ayuda: <>Haz una foto de cada página, con buena luz y que se lean bien las firmas y los sellos. Al terminar, pulsa <strong>Finalizar</strong>.</>,
    finalizar: 'Finalizar y subir CMR / carta de porte',
    hecho: (n) => <>Hemos guardado <strong>{n} página{n === 1 ? '' : 's'}</strong> del CMR / carta de porte de este envío</>,
    recibidas: (n) => `✓ Hemos recibido ${n} página${n === 1 ? '' : 's'}.`,
  },
  doc: {
    titulo: 'Documentos', etiqueta: 'Subir documentos',
    ayuda: <>Haz una foto de cada página del documento, con buena luz y que se lea bien. Al terminar, pulsa <strong>Finalizar</strong>.</>,
    finalizar: 'Finalizar y subir documentos',
    hecho: (n) => <>Hemos añadido <strong>{n} página{n === 1 ? '' : 's'}</strong> a los documentos de este envío</>,
    recibidas: (n) => `✓ Hemos añadido ${n} página${n === 1 ? '' : 's'} a los documentos.`,
  },
};

const MAX_PAGINAS = 10;
const MAX_BYTES = 20 * 1024 * 1024;
// La extensión sale del TIPO del fichero (no de su nombre): es la que admite el almacén.
const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'image/heif': 'heif', 'application/pdf': 'pdf' };
const POR_NOMBRE: Record<string, string> = { jpg: 'jpg', jpeg: 'jpg', png: 'png', webp: 'webp', heic: 'heic', heif: 'heif', pdf: 'pdf' };
const MIME: Record<string, string> = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', heic: 'image/heic', heif: 'image/heif', pdf: 'application/pdf' };

type Pagina = { clave: string; fichero: File; ext: string; vista: string | null; ruta: string | null };

function extDe(f: File): string | null {
  if (EXT[f.type]) return EXT[f.type];
  // Algunos móviles no dicen el tipo de un HEIC: se mira el nombre.
  const n = (f.name.split('.').pop() || '').toLowerCase();
  return f.type ? null : (POR_NOMBRE[n] ?? null);
}

const caja: React.CSSProperties = { border: '2px dashed #d1d5db', borderRadius: 12, padding: '1.1rem 0.6rem', textAlign: 'center', color: '#6b7280',
  fontWeight: 600, fontSize: '0.95rem', cursor: 'pointer', background: '#fff', fontFamily: 'inherit' };

export default function SubirCmrPapel({ token, clase = 'papel' }: { token: string; clase?: Clase }) {
  const T = TEXTOS[clase];
  const id = (x: string) => `${x.replace('cmr-papel', `cmr-${clase}`)}`;
  const [abierta, setAbierta] = useState(false);
  const [paginas, setPaginas] = useState<Pagina[]>([]);
  const [aviso, setAviso] = useState<string | null>(null);
  const [subiendo, setSubiendo] = useState<number | null>(null);   // n.º de la página que se está subiendo
  const [hecho, setHecho] = useState<{ paginas: number; total: number } | null>(null);
  const [recibidas, setRecibidas] = useState(0);                    // páginas ya recibidas en esta visita
  const inFoto = useRef<HTMLInputElement>(null);
  const inGal = useRef<HTMLInputElement>(null);
  const vistas = useRef<string[]>([]);
  // Las miniaturas son direcciones temporales del navegador: se sueltan al salir.
  useEffect(() => () => { vistas.current.forEach((u) => URL.revokeObjectURL(u)); }, []);

  const ocupada = subiendo !== null;
  const hueco = MAX_PAGINAS - paginas.length;

  async function anadir(files: FileList | null) {
    if (!files?.length) return;
    const nuevas: Pagina[] = []; let msg: string | null = null;
    for (const f of Array.from(files)) {
      if (nuevas.length >= hueco) { msg = `Caben ${MAX_PAGINAS} páginas como mucho: las demás no se han añadido.`; break; }
      const ext = extDe(f);
      if (!ext) { msg = `«${f.name}» no es una imagen ni un PDF: no se ha añadido.`; continue; }
      if (f.size > MAX_BYTES) { msg = `«${f.name}» pasa de 20 MB: hazla de nuevo o elige otra.`; continue; }
      // Lo que ES de verdad (sus primeros bytes), no lo que dice el nombre.
      if (!(await tipoRealDeArchivo(f))) { msg = `«${f.name}» no es una imagen ni un PDF de verdad: no se ha añadido. Haz una foto o guárdala como PDF.`; continue; }
      // Miniatura solo de lo que el navegador sabe pintar (un HEIC o un PDF, con su rótulo).
      const pintable = ['jpg', 'png', 'webp'].includes(ext);
      const vista = pintable ? URL.createObjectURL(f) : null;
      if (vista) vistas.current.push(vista);
      nuevas.push({ clave: crypto.randomUUID(), fichero: f, ext, vista, ruta: null });
    }
    setAviso(msg);
    if (nuevas.length) setPaginas((l) => [...l, ...nuevas]);
  }

  function quitar(clave: string) {
    setPaginas((l) => l.filter((p) => p.clave !== clave)); setAviso(null);
  }

  async function finalizar() {
    if (ocupada || !paginas.length) return;
    const sb = supabaseNavegador();
    if (!sb) { setAviso('No se ha podido conectar. Vuelve a intentarlo.'); return; }
    setAviso(null);
    const lista = [...paginas];
    for (let i = 0; i < lista.length; i++) {
      if (lista[i].ruta) continue;   // ya subida en un intento anterior: no se repite
      setSubiendo(i + 1);
      const ruta = `cmr/${token}/${clase}-${crypto.randomUUID()}.${lista[i].ext}`;
      const { error } = await sb.storage.from('documentos').upload(ruta, lista[i].fichero, { contentType: MIME[lista[i].ext], upsert: false });
      if (error) {
        setPaginas(lista); setSubiendo(null);
        setAviso(`No se ha podido subir la página ${i + 1}. Comprueba la conexión y pulsa otra vez «Finalizar».`);
        return;
      }
      lista[i] = { ...lista[i], ruta };
    }
    setPaginas(lista);
    const r = await registrarCmrPapel(token, lista.map((p) => p.ruta as string), clase);
    setSubiendo(null);
    if (!r.ok) { setAviso(r.error); return; }
    vistas.current.forEach((u) => URL.revokeObjectURL(u)); vistas.current = [];
    setPaginas([]); setHecho({ paginas: r.paginas, total: r.total }); setRecibidas((n) => n + r.paginas);
  }

  function cerrar() {
    if (ocupada) return;
    setAbierta(false); setHecho(null); setAviso(null);
  }

  return (
    <>
      <div id={id('cmr-papel')} style={{ margin: clase === 'papel' ? '0 0 0.8rem' : '0.7rem 0 0', background: '#f9fafb', border: '1.5px solid #e5e7eb', color: '#6b7280', borderRadius: 12,
        padding: '0.6rem 0.85rem', fontSize: '0.88rem', fontWeight: 500, textAlign: 'center', lineHeight: 1.5 }}>
        {clase === 'papel' ? <>
          <strong style={{ fontWeight: 700, color: '#4b5563' }}>¿No quieren firmar en el móvil?</strong>{' '}
          Puedes subir aquí directamente las fotos del CMR / carta de porte <strong style={{ fontWeight: 700, color: '#4b5563' }}>firmada en papel</strong> al finalizar y lo recibimos igualmente.
        </> : <>
          <strong style={{ fontWeight: 700, color: '#4b5563' }}>¿Quieres añadir alguna foto adicional de algún documento?</strong>{' '}
          Puedes subir aquí directamente las fotos y se añaden a la documentación.
        </>}
        {/* Gris claro y discreto (usuario, 2026-11-17): es la vía de reserva, no la principal. */}
        <button type="button" id={id('btn-cmr-papel')} onClick={() => { setHecho(null); setAviso(null); setAbierta(true); }}
          style={{ display: 'block', width: '100%', margin: '0.5rem 0 0.1rem', background: '#fff', color: '#4b5563', border: '1.5px solid #d1d5db',
            textAlign: 'center', padding: '0.6rem 1rem', fontSize: '0.92rem', fontWeight: 700, borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit' }}>
          {clase === 'papel' ? 'Subir fotos del CMR / carta de porte' : 'Subir documento'}
        </button>
        {recibidas > 0 && <div style={{ marginTop: '0.35rem', fontWeight: 700, color: '#0f6b3a' }}>{T.recibidas(recibidas)}</div>}
      </div>

      {abierta && (
        <div role="dialog" aria-modal="true" aria-label={T.etiqueta} onClick={cerrar}
          style={{ position: 'fixed', inset: 0, zIndex: 70, background: 'rgba(10,2,48,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 18, padding: '1.2rem 1.1rem', maxWidth: 460, width: '100%', maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 24px 60px rgba(10,2,48,0.35)' }}>
            {hecho ? (
              <div id={id('cmr-papel-hecho')} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '2rem' }} aria-hidden="true">✅</div>
                <h2 style={{ margin: '0.2rem 0 0.4rem', fontSize: '1.1rem' }}>Recibido. ¡Gracias!</h2>
                <p style={{ margin: '0 0 1rem', fontSize: '0.95rem', color: '#4b5563', lineHeight: 1.5 }}>
                  {T.hecho(hecho.paginas)}
                  {hecho.total > hecho.paginas ? <> ({hecho.total} en total)</> : null}. No hace falta que nos lo mandes por otro lado.
                </p>
                {hecho.total < MAX_PAGINAS && (
                  <button type="button" onClick={() => setHecho(null)} style={{ ...caja, display: 'block', width: '100%', marginBottom: '0.5rem', borderStyle: 'solid', padding: '0.75rem' }}>Subir más páginas</button>
                )}
                <button type="button" className="firma-btn" onClick={cerrar} style={{ display: 'block', width: '100%', textAlign: 'center', padding: '0.8rem 1rem', borderRadius: 12 }}>Cerrar</button>
              </div>
            ) : (
              <>
                <h2 style={{ margin: '0 0 0.2rem', fontSize: '1.1rem' }}>{T.titulo}</h2>
                <p style={{ margin: '0 0 0.8rem', fontSize: '0.9rem', color: '#4b5563', lineHeight: 1.45 }}>
                  {T.ayuda}
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                  <button type="button" style={{ ...caja, opacity: ocupada || hueco <= 0 ? 0.5 : 1 }} disabled={ocupada || hueco <= 0} onClick={() => inFoto.current?.click()}>📷 Hacer foto</button>
                  <button type="button" style={{ ...caja, opacity: ocupada || hueco <= 0 ? 0.5 : 1 }} disabled={ocupada || hueco <= 0} onClick={() => inGal.current?.click()}>🖼️ Galería o archivo</button>
                </div>
                <div style={{ marginTop: '0.35rem', fontSize: '0.8rem', color: '#6b7280' }}>JPG, PNG, WEBP, HEIC o PDF · máx. 20 MB por página · hasta {MAX_PAGINAS} páginas</div>
                <input ref={inFoto} id={id('cmr-papel-foto')} type="file" accept="image/*" capture="environment" hidden
                  onChange={(e) => { anadir(e.target.files); e.target.value = ''; }} />
                <input ref={inGal} id={id('cmr-papel-galeria')} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf,.heic,.heif" multiple hidden
                  onChange={(e) => { anadir(e.target.files); e.target.value = ''; }} />

                <div id={id('cmr-papel-cuenta')} style={{ margin: '0.9rem 0 0.4rem', fontWeight: 800, fontSize: '0.95rem', color: paginas.length ? '#0a0230' : '#9ca3af' }} aria-live="polite">
                  {paginas.length === 0 ? 'Todavía no has añadido ninguna página' : `${paginas.length} de ${MAX_PAGINAS} páginas`}
                </div>
                {paginas.length > 0 && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(84px, 1fr))', gap: '0.5rem' }}>
                    {paginas.map((p, i) => (
                      <div key={p.clave} className="cmr-papel-mini" style={{ position: 'relative', aspectRatio: '3 / 4', borderRadius: 10, overflow: 'hidden', border: '1.5px solid #e5e7eb', background: '#f3f4f6' }}>
                        {p.vista
                          ? <img src={p.vista} alt={`Página ${i + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                          : <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, padding: 4, textAlign: 'center' }}>
                              <span style={{ fontWeight: 800, color: '#6b7280' }}>{p.ext.toUpperCase()}</span>
                              <span style={{ fontSize: '0.65rem', color: '#6b7280', wordBreak: 'break-all', lineHeight: 1.2 }}>{p.fichero.name.slice(0, 28)}</span>
                            </div>}
                        <span style={{ position: 'absolute', left: 4, bottom: 4, background: 'rgba(10,2,48,0.75)', color: '#fff', borderRadius: 6, padding: '0 0.35rem', fontSize: '0.75rem', fontWeight: 800 }}>{i + 1}</span>
                        {p.ruta && <span style={{ position: 'absolute', left: 4, top: 4, background: '#1d9e57', color: '#fff', borderRadius: 6, padding: '0 0.3rem', fontSize: '0.7rem', fontWeight: 800 }}>✓</span>}
                        {!ocupada && (
                          <button type="button" aria-label={`Quitar la página ${i + 1}`} onClick={() => quitar(p.clave)}
                            style={{ position: 'absolute', right: 4, top: 4, width: 26, height: 26, borderRadius: '50%', border: 0, background: 'rgba(180,35,24,0.92)', color: '#fff', fontWeight: 900, fontSize: '0.9rem', lineHeight: 1, cursor: 'pointer' }}>✕</button>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {aviso && <div role="alert" style={{ marginTop: '0.7rem', background: '#fef3f2', border: '1px solid #fecdca', color: '#b42318', borderRadius: 10, padding: '0.5rem 0.7rem', fontSize: '0.88rem', fontWeight: 600 }}>{aviso}</div>}

                <button type="button" className="firma-btn" id={id('btn-cmr-papel-finalizar')} onClick={finalizar} disabled={ocupada || paginas.length === 0}
                  style={{ display: 'block', width: '100%', margin: '0.9rem 0 0.45rem', textAlign: 'center', padding: '0.85rem 1rem', fontSize: '1rem', borderRadius: 12, opacity: ocupada || paginas.length === 0 ? 0.55 : 1 }}>
                  {ocupada ? `Subiendo la página ${subiendo} de ${paginas.length}…` : T.finalizar}
                </button>
                <button type="button" onClick={cerrar} disabled={ocupada}
                  style={{ display: 'block', width: '100%', background: 'none', border: 0, color: '#6b7280', fontWeight: 700, padding: '0.5rem', cursor: 'pointer', fontFamily: 'inherit' }}>Cancelar</button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
