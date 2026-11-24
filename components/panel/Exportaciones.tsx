'use client';

// Exportaciones (solo Dynamo): elegir fichero (pedidos de venta / de compra de Holded o la
// bolsa de Wtransnet), ver qué falta por pasar, descargarlo en CSV con las columnas EXACTAS
// de la plantilla y, una vez importado, marcarlo para que no vuelva a salir.
import { useMemo, useState } from 'react';
import { useRefrescar } from '@/lib/useRefrescar';
import Modal from './Modal';
import { FICHEROS, descargarCsv, esImporte, type Fichero, type FilaExport } from '@/lib/exportaciones';
import FiltroFechas, { useFiltroFechas } from './FiltroFechas';
import { enRango } from '@/lib/filtroFechas';
import { marcarExportados, marcarFacturados } from '@/app/panel/(app)/exportaciones/acciones';
import { euros, numero, textoBusqueda } from '@/lib/formato';
import PaginadorLocal, { usePaginas } from './PaginadorLocal';
import ControlFacturacion, { type FilaControl, type FilaCuadre } from './ControlFacturacion';

const PESTANAS: [string, string][] = [['pendientes', 'Pendientes'], ['hechos', 'Ya pasados'], ['todos', 'Todos']];
// Las fechas del fichero van «dd/mm/aaaa»; el filtro trabaja con «aaaa-mm-dd».
const diaDe = (s: unknown) => { const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(s ?? '')); return m ? `${m[3]}-${m[2]}-${m[1]}` : null; };
const CONCEPTO: Record<string, string> = { porte: 'Porte', penalizacion: 'Penalización', paralizacion: 'Paralización' };
// El concepto del porte pagado por adelantado lleva detrás su proforma («porte · PROFORMA …»):
// se traduce solo la primera parte.
const conceptoTxt = (v: unknown) => { const [c0, ...resto] = String(v ?? '').split(' · '); return [CONCEPTO[c0] ?? c0, ...resto].join(' · '); };
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const DESCARGA = '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>';
const CHECK = '<polyline points="20 6 9 17 4 12"/>';
const Ico = ({ d }: { d: string }) => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: '0.35rem' }} dangerouslySetInnerHTML={{ __html: d }} />;

export default function Exportaciones({ datos, columnas, hecho, totales, pendientesTotales, error, control, inicio }: {
  datos: Record<Fichero, FilaExport[]>; columnas: Record<Fichero, string[]>; hecho: Record<Fichero, string[]>; error: string | null;
  totales?: Partial<Record<Fichero, number>>;             // filas que tiene de verdad cada fichero (en pantalla caben `tope`)
  pendientesTotales?: Partial<Record<Fichero, number>>;   // pedidos de Holded aún sin pasar, contados en la base de datos
  control: { filas: FilaControl[]; cuadre: FilaCuadre[]; error: string | null; desde?: string | null }; inicio?: 'cuadre';
}) {
  const refrescar = useRefrescar();
  const [fichero, setFichero] = useState<Fichero>('venta');
  // La cuarta tarjeta: el control de facturación (el email del lunes llega con ?ver=cuadre).
  const [verControl, setVerControl] = useState(inicio === 'cuadre');
  const casos = useMemo(() => {
    const vistos = new Map<string, { g: string; n: number }>();
    for (const f of control.filas) if (!vistos.has(f.tipo)) vistos.set(f.tipo, { g: f.gravedad, n: f.total_tipo });
    let graves = 0, revisar = 0;
    for (const v of vistos.values()) { if (v.g === 'grave') graves += v.n; else revisar += v.n; }
    return { graves, revisar };
  }, [control.filas]);
  const [pestana, setPestana] = useState('pendientes');
  const [q, setQ] = useState('');
  const ff = useFiltroFechas();
  const [confirmar, setConfirmar] = useState<'marcar' | 'quitar' | 'facturar' | 'desfacturar' | null>(null);
  const [trabajando, setTrabajando] = useState(false);
  const [aviso, setAviso] = useState<{ ok: boolean; txt: string } | null>(null);

  const F = FICHEROS[fichero];
  const hechos = useMemo(() => new Set(hecho[fichero]), [hecho, fichero]);
  const filas = datos[fichero];
  const pendientesEnPantalla = (k: Fichero) => { const h = new Set(hecho[k]); return new Set(datos[k].map((f) => String(f[FICHEROS[k].ref])).filter((r) => !h.has(r))).size; };
  // La tarjeta dice los pendientes DE VERDAD (contados en la base de datos), no solo los que caben en pantalla.
  const pendientes = (k: Fichero) => Math.max(pendientesTotales?.[k] ?? 0, pendientesEnPantalla(k));
  const totalFichero = Math.max(totales?.[fichero] ?? 0, filas.length);

  const lista = useMemo(() => {
    const w = norm(textoBusqueda(q));
    return filas.filter((f) => {
      const r = String(f[F.ref]);
      if (pestana === 'pendientes' && hechos.has(r)) return false;
      if (pestana === 'hechos' && !hechos.has(r)) return false;
      if (ff.rango && !enRango(diaDe(f[F.fecha]), ff.rango)) return false;
      return !w || norm(Object.values(f).filter((v) => v != null).join(' ')).includes(w);
    });
  }, [filas, F, pestana, hechos, ff.rango, q]);
  const pg = usePaginas(lista, `${fichero}|${pestana}|${ff.clave}|${q}`, 50);
  const refs = useMemo(() => [...new Set(lista.map((f) => String(f[F.ref])))], [lista, F.ref]);
  const cuenta = (p: string) => new Set(filas.filter((f) => { const h = hechos.has(String(f[F.ref])); return p === 'todos' || (p === 'hechos' ? h : !h); }).map((f) => String(f[F.ref]))).size;

  const descargar = () => descargarCsv(F.archivo, columnas[fichero], lista);
  // Facturado (solo Holded): sobre los envíos de la lista que se ve.
  const sinFacturar = useMemo(() => new Set(lista.filter((f) => f['FACTURADO?'] !== 'SI').map((f) => String(f[F.ref]))), [lista, F.ref]);
  async function facturar(valor: boolean) {
    if (fichero === 'bolsa') return;
    setTrabajando(true); setAviso(null);
    const r = await marcarFacturados(fichero, valor ? [...sinFacturar] : refs, valor);
    setTrabajando(false); setConfirmar(null);
    if (!r.ok) { setAviso({ ok: false, txt: r.error }); return; }
    setAviso({ ok: true, txt: `${r.n} envío${r.n === 1 ? '' : 's'} ${valor ? 'marcado' + (r.n === 1 ? '' : 's') + ' como facturado' + (r.n === 1 ? '' : 's') : 'vuelve' + (r.n === 1 ? '' : 'n') + ' a sin facturar'}.` });
    refrescar();
  }
  async function marcar(quitar: boolean) {
    setTrabajando(true); setAviso(null);
    const r = await marcarExportados(fichero, refs, quitar);
    setTrabajando(false); setConfirmar(null);
    if (!r.ok) { setAviso({ ok: false, txt: r.error }); return; }
    setAviso({ ok: true, txt: quitar ? `${r.n} envío${r.n === 1 ? '' : 's'} vuelve${r.n === 1 ? '' : 'n'} a pendientes.` : `${r.n} envío${r.n === 1 ? '' : 's'} marcado${r.n === 1 ? '' : 's'} como ${F.marcado}.` });
    refrescar();
  }
  const elegir = (k: Fichero) => { setVerControl(false); setFichero(k); setPestana('pendientes'); setQ(''); setAviso(null); };

  return (
    <section className="section active" id="sec-exportaciones">
      <div className="sec-header"><h2>Exportaciones</h2></div>
      <p style={{ margin: '-0.4rem 0 1rem', fontSize: 'var(--fs-l)', color: 'var(--gray-500)', maxWidth: 820, lineHeight: 1.5 }}>
        Los ficheros para <strong>importar en Holded</strong> y para <strong>subir a la bolsa de Wtransnet</strong>, con las columnas exactas de tus plantillas.
        Descarga los pendientes, impórtalos y después márcalos: así la próxima vez solo salen los nuevos.
      </p>
      <div className="stats-row" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}>
        {(Object.keys(FICHEROS) as Fichero[]).map((k) => (
          <button key={k} type="button" className={`stat-card stat-card-link${k === fichero && !verControl ? ' export-activa' : ''}`} onClick={() => elegir(k)} aria-pressed={k === fichero && !verControl}>
            <span className="stat-card-label">{FICHEROS[k].titulo}</span>
            <span className="stat-card-value" style={pendientes(k) > 0 ? { color: '#d97706' } : undefined}>{numero(pendientes(k), 0)}</span>
            <span style={{ fontSize: 'var(--fs-s)', color: 'var(--gray-500)', fontWeight: 600 }}>{FICHEROS[k].sub} · pendientes</span>
          </button>
        ))}
        <button type="button" id="export-control" className={`stat-card stat-card-link${verControl ? ' export-activa' : ''}`} onClick={() => { setVerControl(true); setAviso(null); }} aria-pressed={verControl}>
          <span className="stat-card-label">Control de facturación</span>
          <span className="stat-card-value" style={{ color: control.error || casos.graves > 0 ? '#c0262d' : casos.revisar > 0 ? '#d97706' : 'var(--green-dark, #15803d)' }}>{control.error ? '?' : casos.graves > 0 ? casos.graves : casos.revisar > 0 ? casos.revisar : '✓'}</span>
          <span style={{ fontSize: 'var(--fs-s)', color: 'var(--gray-500)', fontWeight: 600 }}>{control.error ? 'No se ha podido comprobar' : casos.graves > 0 ? `caso${casos.graves === 1 ? '' : 's'} · pedidos que faltan o cambiaron` : casos.revisar > 0 ? 'por revisar · nada grave' : 'Todo cuadra'}</span>
        </button>
      </div>

      {verControl ? <ControlFacturacion filas={control.filas} cuadre={control.cuadre} error={control.error} desde={control.desde ?? null} /> : <>
      {error && <div className="pt-aviso error" style={{ marginBottom: '0.8rem' }}><div>No se han podido leer algunos ficheros: {error}</div></div>}
      {aviso && <div className={`pt-aviso ${aviso.ok ? 'info' : 'error'}`} role="status" style={{ marginBottom: '0.8rem' }}><div>{aviso.txt}</div></div>}
      {/* Si el fichero no cabe entero en pantalla, se dice cuántas filas hay y qué se ve (usuario,
          2026-11-24: salían 1.000 sin explicación, con casi 15.000 envíos entregados). */}
      {totalFichero > filas.length && (
        <div className="pt-aviso info" id="export-tope" style={{ marginBottom: '0.8rem' }}><div>
          Este fichero tiene <strong>{numero(totalFichero, 0)} filas</strong> y aquí se ven las <strong>{numero(filas.length, 0)}</strong> primeras
          {fichero === 'bolsa' ? ' (las más recientes)' : ': primero lo pendiente de pasar a Holded, de lo más reciente a lo más antiguo'}.
          {fichero !== 'bolsa' && <> Descárgalas, impórtalas y márcalas como pasadas: al hacerlo salen las siguientes.</>}
        </div></div>
      )}

      <div className="tabs">
        {PESTANAS.map(([k, t]) => <button key={k} className={`tab${pestana === k ? ' active' : ''}`} onClick={() => setPestana(k)}>{t} ({cuenta(k)})</button>)}
      </div>
      <div className="filters">
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por envío, cliente, transportista, población…" />
        <FiltroFechas futuro valor={ff.valor} desde={ff.desde} hasta={ff.hasta} onCambio={ff.onCambio} etiqueta="Filtrar por fecha" />
      </div>
      <div className="export-acciones">
        <button className="btn-primary" disabled={!lista.length} onClick={descargar}><Ico d={DESCARGA} />Descargar CSV ({lista.length} fila{lista.length === 1 ? '' : 's'})</button>
        {pestana !== 'hechos' && <button className="btn-secondary" disabled={!refs.some((r) => !hechos.has(r)) || trabajando} onClick={() => setConfirmar('marcar')}><Ico d={CHECK} />{F.marcar}</button>}
        {pestana === 'hechos' && <button className="btn-ghost" disabled={!refs.length || trabajando} onClick={() => setConfirmar('quitar')}>{F.desmarcar}</button>}
        {fichero !== 'bolsa' && pestana === 'hechos' && <button className="btn-secondary" disabled={!sinFacturar.size || trabajando} onClick={() => setConfirmar('facturar')}><Ico d={CHECK} />{fichero === 'venta' ? 'Marcar como facturados' : 'Marcar factura recibida'}</button>}
        {fichero !== 'bolsa' && pestana === 'hechos' && <button className="btn-ghost" disabled={sinFacturar.size === refs.length || trabajando} onClick={() => setConfirmar('desfacturar')}>Quitar facturado</button>}
      </div>

      <div className="table-wrap" tabIndex={0}>
        <table className="data">
          <thead><tr>{F.columnas.map(([, t]) => <th key={t}>{t}</th>)}<th>Situación</th></tr></thead>
          <tbody>
            {lista.length === 0 ? (
              <tr><td colSpan={F.columnas.length + 1} style={{ textAlign: 'center', padding: '2rem', color: 'var(--gray-500)' }}>
                {filas.length ? 'No hay filas que coincidan con el filtro.' : fichero === 'bolsa' ? 'No hay envíos programados sin transportista para la bolsa.' : 'Aún no hay pedidos para exportar.'}
              </td></tr>
            ) : pg.visibles.map((f, i) => {
              const h = hechos.has(String(f[F.ref]));
              return (
                <tr key={i}>
                  {F.columnas.map(([c], j) => (
                    <td key={c} className={esImporte(c) ? 'amount' : j === 0 ? 'ref' : undefined} style={c === 'Descripción del producto' ? { minWidth: 280 } : esImporte(c) || j < 2 ? { whiteSpace: 'nowrap' } : undefined}>
                      {j === 0 ? <strong>#{String(f[c] ?? '')}</strong> : esImporte(c) ? (f[c] != null ? euros(Number(f[c])) : '—')
                        : c === 'ESTADO VIAJE' ? String(f[c] ?? '').replace(/_/g, ' ') : c === 'Concepto' ? conceptoTxt(f[c]) : (f[c] ?? '—')}
                    </td>
                  ))}
                  <td>{h ? <span className="badge badge-green">{fichero === 'bolsa' ? 'Publicado' : 'En Holded'}</span> : <span className="badge badge-prog">Pendiente</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <PaginadorLocal p={pg} nombre="filas" nombreUno="fila" />
      {pg.total > pg.porPagina && <p style={{ fontSize: 'var(--fs-s)', color: 'var(--gray-500)' }}>El CSV y los botones de marcar van con las {numero(lista.length, 0)} filas del filtro, no solo con la página que se ve.</p>}

      </>}

      {confirmar && (
        <Modal abierto ancho={520} onCerrar={() => !trabajando && setConfirmar(null)}
          titulo={confirmar === 'marcar' ? F.marcar : confirmar === 'quitar' ? 'Volver a pendientes' : confirmar === 'facturar' ? (fichero === 'venta' ? 'Marcar como facturados' : 'Marcar factura recibida') : 'Quitar facturado'}
          sub={`${F.titulo} · ${confirmar === 'facturar' ? sinFacturar.size : confirmar === 'desfacturar' ? refs.length - sinFacturar.size : refs.filter((r) => (confirmar === 'marcar') !== hechos.has(r)).length} envíos`}
          pie={<>
            <button className="btn-ghost" disabled={trabajando} onClick={() => setConfirmar(null)}>Cancelar</button>
            <button className="btn-primary" disabled={trabajando} onClick={() => (confirmar === 'facturar' || confirmar === 'desfacturar' ? facturar(confirmar === 'facturar') : marcar(confirmar === 'quitar'))}>{trabajando ? 'Guardando…' : confirmar === 'quitar' || confirmar === 'desfacturar' ? 'Sí, quitar' : 'Sí, marcar'}</button>
          </>}>
          <p style={{ margin: 0, lineHeight: 1.55 }}>
            {confirmar === 'facturar' ? <>Marca como {fichero === 'venta' ? <strong>facturados al cliente</strong> : <>con la <strong>factura del transportista recibida</strong></>} los envíos de la lista que ves ahora. Saldrá «SI» en la columna FACTURADO? del fichero.</>
              : confirmar === 'desfacturar' ? <>Quita la marca de facturado a los envíos de la lista que ves ahora. Hazlo solo si se marcaron por error.</>
              : confirmar === 'marcar'
              ? <>Márcalos <strong>solo si ya los has importado</strong> {fichero === 'bolsa' ? 'en Wtransnet' : 'en Holded'}. Desde entonces dejarán de salir en <em>Pendientes</em>. Se marcan los envíos de la lista que ves ahora (con el filtro aplicado).</>
              : <>Vuelven a <em>Pendientes</em> y saldrán en el próximo fichero. Hazlo solo si se marcaron por error.</>}
          </p>
        </Modal>
      )}
    </section>
  );
}
