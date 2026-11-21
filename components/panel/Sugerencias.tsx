'use client';

// Gestión interna → Sugerencias (usuario, 2026-11-21): lo que mandan los usuarios desde
// Soporte. Lista paginada con pestañas por estado (activas, desestimadas, realizadas), buscador
// y filtro de fecha; al pulsar una, su ficha: el comentario, las fotos, quién y cuándo, desde
// qué pantalla y aparato, y el estado con una nota interna.
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useRefrescar } from '@/lib/useRefrescar';
import Modal from './Modal';
import Cargando from '@/components/Cargando';
import PaginadorLocal, { usePaginas } from './PaginadorLocal';
import FiltroFechas, { useFiltroFechas } from './FiltroFechas';
import { enRango, diaMadridDe } from '@/lib/filtroFechas';
import { fechaHora, textoBusqueda } from '@/lib/formato';
import { revisarSugerencia } from '@/app/panel/(app)/sugerencias/acciones';
import { documentosDe, type DocumentoFila } from '@/app/panel/(app)/documentos/acciones';

export type SugerenciaFila = {
  id: string; numero: number; texto: string; pagina: string | null; navegador: string | null;
  estado: 'activa' | 'desestimada' | 'realizada'; nota: string | null; creado_en: string; revisada_en: string | null;
  autor: string | null; email: string | null; rol: string | null; empresa: string | null; revisor: string | null;
};

const ESTADOS: Record<SugerenciaFila['estado'], [string, string]> = {
  activa: ['Activa', 'badge-orange'], desestimada: ['Desestimada', 'badge-gray'], realizada: ['Realizada', 'badge-green'],
};
const ROL: Record<string, string> = { cliente: 'Cliente', transportista: 'Transportista', admin: 'Dynamo', empleado: 'Dynamo', admin_lectura: 'Dynamo', empleado_lectura: 'Dynamo' };
const PESTANAS: [SugerenciaFila['estado'] | 'todas', string][] = [['activa', 'Activas'], ['realizada', 'Realizadas'], ['desestimada', 'Desestimadas'], ['todas', 'Todas']];
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const codigo = (n: number) => `SUG-${n}`;

export default function Sugerencias({ filas, verInicial, error }: { filas: SugerenciaFila[]; verInicial: string | null; error: string | null }) {
  const router = useRouter();
  const [pestana, setPestana] = useState<SugerenciaFila['estado'] | 'todas'>('activa');
  const [q, setQ] = useState('');
  const ff = useFiltroFechas();
  const [ver, setVer] = useState<string | null>(verInicial);

  const cuenta = useMemo(() => {
    const c: Record<string, number> = { activa: 0, desestimada: 0, realizada: 0, todas: filas.length };
    filas.forEach((f) => { c[f.estado]++; });
    return c;
  }, [filas]);
  const lista = useMemo(() => {
    const w = norm(textoBusqueda(q)).split(/\s+/).filter(Boolean);
    return filas.filter((f) => (pestana === 'todas' || f.estado === pestana) && enRango(diaMadridDe(f.creado_en), ff.rango)
      && (!w.length || (() => { const b = norm([codigo(f.numero), f.texto, f.autor, f.email, f.empresa, f.pagina, f.nota].filter(Boolean).join(' ')); return w.every((t) => b.includes(t)); })()));
  }, [filas, pestana, q, ff.rango]);
  const pg = usePaginas(lista, `${pestana}|${q}|${ff.clave}`);
  const fila = ver ? filas.find((f) => f.id === ver) ?? null : null;
  const cerrar = () => { setVer(null); if (verInicial) router.replace('/panel/sugerencias', { scroll: false }); };

  return (
    <section className="section active" id="sec-sugerencias">
      <div className="sec-header"><h2>Sugerencias</h2></div>
      <p style={{ margin: '-0.4rem 0 1rem', fontSize: 'var(--fs-l)', color: 'var(--gray-500)', maxWidth: 820, lineHeight: 1.5 }}>
        Mejoras y fallos técnicos que mandan los usuarios desde Soporte. Entran <strong>activas</strong>; al revisarlas, desestímalas o márcalas como <strong>realizadas</strong>.
      </p>
      <div className="tabs">
        {PESTANAS.map(([k, t]) => (
          <button key={k} className={`tab${pestana === k ? ' active' : ''}`} onClick={() => setPestana(k)}>{t} ({cuenta[k] ?? 0})</button>
        ))}
      </div>
      <div className="filters">
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por texto, persona, empresa, pantalla…" aria-label="Buscar sugerencias" />
        <FiltroFechas valor={ff.valor} desde={ff.desde} hasta={ff.hasta} onCambio={ff.onCambio} etiqueta="Filtrar por fecha de la sugerencia" />
      </div>
      {error && <div className="pt-aviso error">No se han podido cargar las sugerencias: {error}</div>}
      <div className="table-wrap" tabIndex={0}>
        <table className="data" id="sugerencias-lista">
          <thead><tr><th>Sugerencia</th><th>Fecha</th><th>De</th><th>Comentario</th><th>Estado</th></tr></thead>
          <tbody>
            {lista.length === 0 ? (
              <tr><td colSpan={5} style={{ textAlign: 'center', padding: '2rem', color: 'var(--gray-500)' }}>
                {filas.length ? 'No hay sugerencias con estos filtros.' : 'Aún no ha llegado ninguna sugerencia.'}
              </td></tr>
            ) : pg.visibles.map((f) => (
              <tr key={f.id} data-id={f.id} onClick={() => setVer(f.id)} style={{ cursor: 'pointer' }}>
                <td className="ref" style={{ whiteSpace: 'nowrap' }}><strong>{codigo(f.numero)}</strong></td>
                <td style={{ whiteSpace: 'nowrap' }}>{fechaHora(f.creado_en)}</td>
                <td>{f.autor || f.email || '—'}<div className="meta">{[f.empresa, f.rol ? ROL[f.rol] ?? f.rol : null].filter(Boolean).join(' · ')}</div></td>
                <td style={{ minWidth: 260, maxWidth: 520 }}>
                  <div style={{ overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{f.texto}</div>
                </td>
                <td style={{ whiteSpace: 'nowrap' }}><span className={`badge ${ESTADOS[f.estado][1]}`}>{ESTADOS[f.estado][0]}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <PaginadorLocal p={pg} nombre="sugerencias" nombreUno="sugerencia" />
      {fila && <FichaSugerencia key={fila.id} f={fila} onCerrar={cerrar} />}
    </section>
  );
}

function FichaSugerencia({ f, onCerrar }: { f: SugerenciaFila; onCerrar: () => void }) {
  const refrescar = useRefrescar();
  const [estado, setEstado] = useState(f.estado);
  const [nota, setNota] = useState(f.nota ?? '');
  const [fotos, setFotos] = useState<DocumentoFila[] | null>(null);
  const [trabajando, setTrabajando] = useState(false);
  const [aviso, setAviso] = useState<{ ok: boolean; txt: string } | null>(null);
  useEffect(() => { documentosDe({ campo: 'sugerencia_id', id: f.id }).then(setFotos); }, [f.id]);
  const cambiado = estado !== f.estado || nota.trim() !== (f.nota ?? '');

  async function guardar() {
    setTrabajando(true); setAviso(null);
    const r = await revisarSugerencia(f.id, estado, nota);
    setTrabajando(false);
    if (!r.ok) { setAviso({ ok: false, txt: r.error }); return; }
    setAviso({ ok: true, txt: 'Guardado.' });
    refrescar();
  }

  const fila = (t: string, v: React.ReactNode) => (
    <div className="account-row"><span className="account-row-label">{t}</span><span className="account-row-value" style={{ textAlign: 'right' }}>{v}</span></div>
  );
  return (
    <Modal abierto titulo={`Sugerencia ${codigo(f.numero)}`} sub={`Recibida el ${fechaHora(f.creado_en)}`} onCerrar={onCerrar} ancho={720}
      pie={<><button className="btn-ghost" onClick={onCerrar}>Cerrar</button>
        <button className="btn-primary" id="sug-guardar" onClick={guardar} disabled={trabajando || !cambiado}>Guardar</button></>}>
      <div id="sug-ficha" style={{ display: 'grid', gap: '0.9rem' }}>
        <div>
          {fila('De', <>{f.autor || '—'}{f.email && <span className="meta" style={{ display: 'block' }}>{f.email}</span>}</>)}
          {fila('Empresa', [f.empresa, f.rol ? ROL[f.rol] ?? f.rol : null].filter(Boolean).join(' · ') || '—')}
          {fila('Pantalla', f.pagina || '—')}
          {fila('Navegador', f.navegador || '—')}
        </div>
        <div>
          <label>Comentario</label>
          <div style={{ whiteSpace: 'pre-wrap', background: 'var(--gray-50, #f7f8fa)', border: '1px solid var(--gray-200)', borderRadius: 12, padding: '0.8rem 0.9rem', lineHeight: 1.5 }}>{f.texto}</div>
        </div>
        <div>
          <label>Fotos</label>
          {fotos === null ? <span className="meta">Cargando…</span> : fotos.length === 0 ? <span className="meta">Sin fotos.</span> : (
            <div id="sug-fotos-ficha" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '0.5rem' }}>
              {fotos.map((d) => (
                <a key={d.id} href={`/panel/documentos/${d.id}`} target="_blank" rel="noopener" title={`Ver ${d.nombre_archivo}`}
                  style={{ display: 'block', border: '1px solid var(--gray-200)', borderRadius: 12, overflow: 'hidden', background: '#fff' }}>
                  <img src={`/panel/documentos/${d.id}`} alt={d.nombre_archivo} loading="lazy" style={{ display: 'block', width: '100%', height: 120, objectFit: 'cover' }} />
                  <span className="meta" style={{ display: 'block', padding: '0.3rem 0.5rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.nombre_archivo}</span>
                </a>
              ))}
            </div>
          )}
        </div>
        <div>
          <label>Estado</label>
          <div role="radiogroup" aria-label="Estado de la sugerencia" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.4rem' }}>
            {(Object.keys(ESTADOS) as SugerenciaFila['estado'][]).map((k) => (
              <button key={k} type="button" role="radio" aria-checked={estado === k} data-estado={k}
                className={estado === k ? 'btn-primary' : 'btn-ghost'} style={{ minHeight: 40 }} onClick={() => setEstado(k)}>
                {k === 'activa' ? 'Activa' : k === 'desestimada' ? 'Desestimar' : 'Realizada'}
              </button>
            ))}
          </div>
          {f.revisada_en && <div className="meta" style={{ marginTop: '0.35rem' }}>Último cambio: {f.revisor ?? '—'} · {fechaHora(f.revisada_en)}</div>}
        </div>
        <div>
          <label htmlFor="sug-nota">Nota interna <span style={{ color: 'var(--gray-500)', fontWeight: 600 }}>· opcional</span></label>
          <textarea id="sug-nota" rows={3} maxLength={2000} value={nota} onChange={(e) => setNota(e.target.value)}
            placeholder="Qué se ha hecho, o por qué se desestima…" />
        </div>
        {aviso && <div className={`pt-aviso ${aviso.ok ? 'info' : 'error'}`} role="status"><div>{aviso.txt}</div></div>}
        {trabajando && <Cargando texto="Guardando" />}
      </div>
    </Modal>
  );
}
