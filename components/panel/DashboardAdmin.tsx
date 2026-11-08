'use client';

// Dashboard admin (solo Dynamo): una fila de cifras de lo que hay que atender —incluida la
// línea de PRONTO PAGO a transportistas, que al pulsarla abre su ventana (interruptor, línea
// editable, barra de uso y anticipos de 60 días)— y debajo el cuadro de mando.
// (Usuario, 2026-11-06: fuera «Solicitudes sin precio», «Últimos envíos creados» y la caja
// grande del pronto pago; todo en cifras.)
import { SIN_CONEXION } from '@/lib/mensajeError';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRefrescar } from '@/lib/useRefrescar';
import Cargando from '@/components/Cargando';
import Modal from './Modal';
import { guardarLineaProntoPago, encenderProntoPago, anticiposProntoPago, type AnticipoPP } from '@/app/panel/(app)/dashboard-admin/acciones';
import { euros, importe, fechaHora, numero } from '@/lib/formato';

export type ProntoPago = {
  linea: number; encendido: boolean; ventana_dias: number; usado: number; disponible: number; activo: boolean;
  anticipos_n: number;   // cuántos hay en la ventana; el detalle se pide por páginas al abrir
};
type Cifras = { enCurso: number; sinTransp: number; inc: number; pen: number; alm: number; contra: number };

function Cifra({ href, label, valor, aviso }: { href: string; label: string; valor: number; aviso?: boolean }) {
  return (
    <Link href={href} className="stat-card stat-card-link" style={{ textDecoration: 'none' }}>
      <span className="stat-card-label">{label}</span>
      <span className="stat-card-value" style={aviso && valor > 0 ? { color: '#d97706' } : undefined}>{valor}</span>
    </Link>
  );
}

export default function DashboardAdmin({ cifras, prontoPago, errorPP, cuadro }: {
  cifras: Cifras; prontoPago: ProntoPago | null; errorPP: string | null; cuadro?: React.ReactNode;
}) {
  return (
    <section className="section active" id="sec-dashboard-admin">
      <div className="sec-header"><h2>Dashboard admin</h2></div>
      <p style={{ color: 'var(--gray-500)', fontSize: 'var(--fs-m)', margin: '-0.4rem 0 0.9rem' }}>
        <span style={{ display: 'inline-block', background: 'rgba(51,0,204,0.10)', color: 'var(--purple)', fontWeight: 700, borderRadius: 6, padding: '1px 7px', fontSize: 'var(--fs-s)', marginRight: '0.4rem' }}>SOLO ADMIN</span>
        Indicadores internos de gestión: lo que hay que atender hoy y la línea de <strong>pronto pago a transportistas</strong>.
      </p>
      <div className="stats-row" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
        <Cifra href="/panel/envios?f=programada" label="Envíos en curso" valor={cifras.enCurso} />
        <Cifra href="/panel/envios?f=sin-asignar" label="Sin transportista" valor={cifras.sinTransp} aviso />
        <Cifra href="/panel/envios" label="Contraofertas por revisar" valor={cifras.contra} aviso />
        <Cifra href="/panel/incidencias" label="Incidencias abiertas" valor={cifras.inc} aviso />
        <Cifra href="/panel/penalizaciones" label="Penalizaciones por confirmar" valor={cifras.pen} aviso />
        <Cifra href="/panel/almacenamientos" label="Almacenamientos por confirmar" valor={cifras.alm} aviso />
        <LineaProntoPago pp={prontoPago} error={errorPP} />
      </div>
      {cuadro}
    </section>
  );
}

const ICO_EURO = <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 7a7 7 0 1 0 0 10" /><line x1="4" y1="10" x2="14" y2="10" /><line x1="4" y1="14" x2="14" y2="14" /></svg>;

function LineaProntoPago({ pp, error }: { pp: ProntoPago | null; error: string | null }) {
  const refrescar = useRefrescar();
  const [editando, setEditando] = useState(false);
  const [linea, setLinea] = useState(pp ? String(pp.linea) : '');
  const [trabajando, setTrabajando] = useState<string | null>(null);
  const [fallo, setFallo] = useState<string | null>(null);

  const [abierto, setAbierto] = useState(false);
  // La cifra (como las demás de la fila) y, al pulsarla, la ventana con todo el detalle.
  const caja = (hijos: React.ReactNode) => (<>
    <button type="button" className="stat-card stat-card-link" style={{ font: 'inherit', textAlign: 'left', cursor: 'pointer', width: '100%' }} onClick={() => setAbierto(true)}>
      <span className="stat-card-label">Pronto pago · disponible</span>
      <span className="stat-card-value" style={{ color: !pp ? 'var(--red)' : !pp.encendido ? 'var(--gray-500)' : pp.activo ? 'var(--green-dark)' : 'var(--red)' }}>{pp ? euros(pp.disponible) : '—'}</span>
      <span className="stat-card-trend" style={{ color: 'var(--gray-500)' }}>{!pp ? 'sin datos' : !pp.encendido ? `apagado · línea ${euros(pp.linea)}` : `de ${euros(pp.linea)} · ${pp.activo ? 'activo' : 'agotado'}`}</span>
    </button>
    {abierto && (
      <Modal abierto titulo="Línea de pronto pago a transportistas" icono={ICO_EURO} onCerrar={() => { setAbierto(false); setEditando(false); setFallo(null); }}
        sub={<>Crédito propio para adelantar el cobro a los transportistas que eligen pronto pago. Si el disponible se agota (o se apaga), las nuevas ofertas de carga salen <strong>sin</strong> la opción: lo impone la base de datos al crear la oferta.</>}
        pie={<button className="btn-ghost" onClick={() => { setAbierto(false); setEditando(false); setFallo(null); }}>Cerrar</button>}>
        {hijos}
      </Modal>
    )}
  </>);
  if (!pp) return caja(<div className="pt-aviso error"><div>No se ha podido leer la línea{error ? `: ${error}` : ''}.</div></div>);

  const pct = pp.linea > 0 ? Math.min(100, Math.round(pp.usado / pp.linea * 100)) : 100;
  const col = pct < 70 ? 'var(--green)' : pct < 90 ? '#d97706' : 'var(--red)';
  async function hacer(fn: () => Promise<{ ok: boolean; error?: string }>, txt: string) {
    setFallo(null); setTrabajando(txt);
    // Si la acción revienta (sin conexión, o justo tras publicar una versión nueva), no se
    // queda el «trabajando…» para siempre: se avisa y se puede reintentar.
    const r: Awaited<ReturnType<typeof fn>> = await fn().catch(() => ({ ok: false, error: SIN_CONEXION }));
    setTrabajando(null);
    if (!r.ok) { setFallo(r.error ?? 'No se ha podido guardar.'); return; }
    setEditando(false); refrescar();
  }
  const aviso = (bg: string, borde: string, color: string, t: React.ReactNode) =>
    <div style={{ marginTop: '0.8rem', padding: '0.6rem 0.75rem', background: bg, border: `1px solid ${borde}`, borderRadius: 9, fontSize: 'var(--fs-m)', fontWeight: 700, color }}>{t}</div>;

  return caja(<>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.8rem', flexWrap: 'wrap', marginBottom: '0.8rem' }}>
      <button type="button" className="btn-primary" disabled={!!trabajando}
        style={pp.encendido ? { background: '#fff', border: '1.5px solid #f5b5b5', color: '#b42318' } : { background: 'var(--green)', border: '1.5px solid var(--green)', color: '#fff' }}
        onClick={() => hacer(() => encenderProntoPago(!pp.encendido), pp.encendido ? 'Apagando' : 'Encendiendo')}>
        {pp.encendido ? 'Apagar pronto pago' : 'Encender pronto pago'}
      </button>
      <div style={{ fontSize: 'var(--fs-m)', color: 'var(--gray-700)' }}>Línea total: <strong>{euros(pp.linea)}</strong>{' '}
        <button type="button" className="btn-ghost" style={{ padding: '0.2rem 0.6rem', fontSize: 'var(--fs-m)' }} onClick={() => { setLinea(importe(pp.linea)); setFallo(null); setEditando(true); }}>Editar línea</button>
      </div>
    </div>
    {editando && (
      <div className="ptar-admin-precio" style={{ margin: '0 0 0.9rem' }}>
        <div className="ptar-admin-precio-head">Línea total <span>· amplía o minora según tesorería</span></div>
        <label className="ptar-admin-precio-lbl" htmlFor="pp-linea">Línea total (€)</label>
        <input id="pp-linea" type="text" inputMode="decimal" value={linea} placeholder="50.000,00" onChange={(e) => setLinea(e.target.value)} autoFocus />
        <p style={{ fontSize: 'var(--fs-s)', color: 'var(--gray-500)', margin: '0.5rem 0 0' }}>Ahora mismo: <strong>{euros(pp.linea)}</strong> · anticipado en los últimos {pp.ventana_dias} días: <strong>{euros(pp.usado)}</strong>.</p>
        {fallo && <div className="wiz-warn show" role="alert">⚠ {fallo}</div>}
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.7rem' }}>
          <button type="button" className="btn-primary" disabled={!!trabajando}
            onClick={() => hacer(() => guardarLineaProntoPago(Number(linea.replace(/\./g, '').replace(',', '.'))), 'Guardando la línea')}>Guardar línea</button>
          <button type="button" className="btn-ghost" onClick={() => { setFallo(null); setEditando(false); }} disabled={!!trabajando}>Cancelar</button>
        </div>
      </div>
    )}
    <div style={{ height: 14, borderRadius: 999, background: 'var(--gray-200)', overflow: 'hidden' }}>
      <div style={{ height: '100%', width: `${pct}%`, background: col, borderRadius: 999, transition: 'width 0.4s' }} />
    </div>
    <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.45rem', fontSize: 'var(--fs-m)', color: 'var(--gray-700)' }}>
      <span>Anticipado (últ. {pp.ventana_dias} días): <strong>{euros(pp.usado)}</strong> ({pct} %)</span>
      <span>Disponible: <strong style={{ color: pp.activo ? 'var(--green-dark)' : 'var(--red)' }}>{euros(pp.disponible)}</strong> de {euros(pp.linea)}</span>
    </div>
    {!pp.encendido ? aviso('#fdecec', '#f5b5b5', '#b42318', 'PRONTO PAGO APAGADO A MANO — las nuevas ofertas de carga salen sin la opción hasta volver a encenderlo.')
      : !pp.activo ? aviso('#fdecec', '#f5b5b5', '#b42318', 'NO DISPONIBLE TEMPORALMENTE — línea agotada: las nuevas ofertas de carga salen sin pronto pago.')
      : aviso('#eafaf0', '#b7ebcd', '#0f6b3a', 'PRONTO PAGO ACTIVO — se ofrece a los transportistas en las ofertas de carga.')}
    <Anticipos ventanaDias={pp.ventana_dias} n={pp.anticipos_n} />
    {fallo && !editando && <div className="wiz-warn show" role="alert">⚠ {fallo}</div>}
    {trabajando && <Cargando texto={trabajando} />}
  </>);
}

// Lista de anticipos por páginas (10 por página): se pide a la base de datos al abrir la
// ventana y al cambiar de página — con cientos de anticipos en la ventana, la lista entera
// ni viaja ni se pinta (usuario, 2026-11-09).
const PP_POR_PAGINA = 10;
function Anticipos({ ventanaDias, n }: { ventanaDias: number; n: number }) {
  const [pagina, setPagina] = useState(1);
  const [filas, setFilas] = useState<AnticipoPP[] | null>(null);
  const [total, setTotal] = useState(n);
  const [fallo, setFallo] = useState<string | null>(null);
  useEffect(() => {
    let vivo = true;
    setFallo(null);
    anticiposProntoPago(pagina)
      .then((r) => { if (!vivo) return; if (r.ok) { setFilas(r.filas); if (r.filas.length || pagina === 1) setTotal(r.total); } else setFallo(r.error); })
      .catch(() => { if (vivo) setFallo(SIN_CONEXION); });
    return () => { vivo = false; };
  }, [pagina]);
  const paginas = Math.max(1, Math.ceil(total / PP_POR_PAGINA));
  const pag = Math.min(pagina, paginas);
  return (<>
    <h4 style={{ margin: '1.1rem 0 0.4rem', fontSize: 'var(--fs-m)' }}>Anticipos con pronto pago · últimos {ventanaDias} días ({numero(total, 0)})</h4>
    {fallo ? <div className="wiz-warn show" role="alert">⚠ No se han podido leer los anticipos: {fallo}</div>
      : filas === null ? <Cargando texto="Leyendo los anticipos" />
      : total === 0 ? <p style={{ fontSize: 'var(--fs-m)', color: 'var(--gray-500)', margin: 0 }}>Ningún transportista ha elegido pronto pago en este periodo.</p>
      : filas.map((a, i) => (
        <div key={`${a.envio}-${a.cuando}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', flexWrap: 'wrap', border: '1px solid var(--gray-200)', borderRadius: 9, padding: '0.45rem 0.7rem', marginBottom: '0.35rem', fontSize: 'var(--fs-m)' }}>
          <span style={{ color: 'var(--gray-500)', minWidth: 86 }}>{fechaHora(a.cuando)}</span>
          <strong>#{a.envio}</strong>
          <span style={{ flex: 1, minWidth: 120 }}>{a.transportista ?? '—'}</span>
          <span style={{ color: 'var(--gray-500)' }}>{euros(a.importe)} − {euros(a.descuento)}</span>
          <strong>{euros(a.anticipado)}</strong>
        </div>
      ))}
    {paginas > 1 && (
      <div className="pagination" style={{ marginTop: '0.5rem', padding: '0.6rem 0.75rem' }}>
        <div className="pagination-left">
          <span>Mostrando {numero((pag - 1) * PP_POR_PAGINA + 1, 0)}–{numero(Math.min(pag * PP_POR_PAGINA, total), 0)} de {numero(total, 0)} anticipos</span>
        </div>
        <div className="pagination-pages">
          {pag > 1 && <button type="button" aria-label="Anterior" onClick={() => setPagina(pag - 1)}>‹</button>}
          {Array.from({ length: paginas }, (_, i) => i + 1)
            .filter((x) => x === 1 || x === paginas || Math.abs(x - pag) <= 2)
            .map((x, i, arr) => (
              <span key={x} style={{ display: 'contents' }}>
                {i > 0 && x - arr[i - 1] > 1 && <span style={{ padding: '0 0.3rem', color: 'var(--gray-500)' }}>…</span>}
                <button type="button" className={x === pag ? 'active' : ''} onClick={() => setPagina(x)}>{x}</button>
              </span>
            ))}
          {pag < paginas && <button type="button" aria-label="Siguiente" onClick={() => setPagina(pag + 1)}>›</button>}
        </div>
      </div>
    )}
  </>);
}
