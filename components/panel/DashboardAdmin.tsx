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
import { CajaBuscadorGlobal } from './BuscadorGlobal';

export type ProntoPago = {
  linea: number; encendido: boolean; ventana_dias: number; usado: number; disponible: number; activo: boolean;
  anticipos_n: number;   // cuántos hay en la ventana; el detalle se pide por páginas al abrir
};
// Lo pendiente (antes la sección «Para hoy», usuario 2026-11-09): cada bloque es una caja
// con contador y, al pulsarla, su ventana con las primeras líneas (cada línea abre su ficha).
export type Fila = { href: string; t: string; s?: string; desde: string | null; urgente?: boolean };
export type Bloque = {
  id: string; nivel: 'urgente' | 'aviso' | 'info';
  corto: string;      // etiqueta de la caja
  titulo: string;     // título de la ventana
  sub: string;        // explicación bajo el título de la ventana
  total: number; todo: string; filas: Fila[];
};

// «hace 25 min», «hace 3 h», «hace 2 días»: cuánto lleva esperando.
function espera(iso: string | null): string {
  if (!iso) return '';
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (min < 1) return 'ahora';
  if (min < 60) return `hace ${min} min`;
  if (min < 48 * 60) return `hace ${Math.round(min / 60)} h`;
  return `hace ${Math.round(min / 1440)} días`;
}

function Cifra({ href, label, valor, aviso }: { href: string; label: string; valor: number; aviso?: boolean }) {
  return (
    <Link href={href} className="stat-card stat-card-link" style={{ textDecoration: 'none' }}>
      <span className="stat-card-label">{label}</span>
      <span className="stat-card-value" style={aviso && valor > 0 ? { color: '#d97706' } : undefined}>{valor}</span>
    </Link>
  );
}

const Svg = ({ children }: { children: React.ReactNode }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);

export default function DashboardAdmin({ enCurso, bloques, errorBloques, prontoPago, errorPP, cuadro, susp24 = 0, suspTotal = 0 }: {
  enCurso: number; bloques: Bloque[]; errorBloques: string | null;
  prontoPago: ProntoPago | null; errorPP: string | null; cuadro?: React.ReactNode; susp24?: number; suspTotal?: number;
}) {
  return (
    <section className="section active" id="sec-dashboard-admin">
      <div className="sec-header"><h2>Dashboard admin</h2></div>
      <p style={{ color: 'var(--gray-500)', fontSize: 'var(--fs-m)', margin: '-0.4rem 0 0.9rem' }}>
        <span style={{ display: 'inline-block', background: 'rgba(51,0,204,0.10)', color: 'var(--purple)', fontWeight: 700, borderRadius: 6, padding: '1px 7px', fontSize: 'var(--fs-s)', marginRight: '0.4rem' }}>SOLO ADMIN</span>
        Indicadores internos de gestión: cada caja abre su ventana con lo pendiente, y la línea de <strong>pronto pago a transportistas</strong>.
      </p>
      {errorBloques && <div className="pt-aviso error" style={{ marginBottom: '0.8rem' }}><div>No se ha podido cargar todo: {errorBloques}</div></div>}
      {/* El buscador global, también aquí (usuario, 2026-11-13): la misma caja del
          dashboard principal, encima de los accesos. */}
      <div style={{ marginBottom: '0.8rem' }}><CajaBuscadorGlobal /></div>
      {/* Accesos rápidos del dashboard principal, también aquí (usuario, 2026-11-13):
          una fila a lo ancho con los cinco botones del mismo tamaño. */}
      <div className="dashadm-accesos">
        <Link className="dash-cta-mini primario" href="/panel/nuevo-envio"><span className="dash-cta-mini-ico"><Svg><rect x="1" y="3" width="15" height="13" rx="1.5" /><polygon points="16 8 20 8 23 11 23 16 16 16 16 8" /><circle cx="5.5" cy="18.5" r="2.5" /><circle cx="18.5" cy="18.5" r="2.5" /></Svg></span><span>Nuevo envío</span></Link>
        <Link className="dash-cta-mini" href="/panel/incidencias?abrir=1"><span className="dash-cta-mini-ico"><Svg><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></Svg></span><span>Reportar incidencia</span></Link>
        <Link className="dash-cta-mini" href="/panel/sitios"><span className="dash-cta-mini-ico"><Svg><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></Svg></span><span>Crear sitio</span></Link>
        <Link className="dash-cta-mini" href="/panel/nuevo-envio"><span className="dash-cta-mini-ico"><Svg><rect x="4" y="2" width="16" height="20" rx="2" /><line x1="8" y1="6" x2="16" y2="6" /><line x1="8" y1="11" x2="8.01" y2="11" /><line x1="12" y1="11" x2="12.01" y2="11" /><line x1="16" y1="11" x2="16.01" y2="11" /><line x1="8" y1="15" x2="8.01" y2="15" /><line x1="12" y1="15" x2="12.01" y2="15" /><line x1="16" y1="15" x2="16" y2="18" /></Svg></span><span>Calculadora de precios</span></Link>
        <Link className="dash-cta-mini" href="/panel/administracion"><span className="dash-cta-mini-ico"><Svg><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="8" y1="13" x2="16" y2="13" /><line x1="8" y1="17" x2="16" y2="17" /><line x1="8" y1="9" x2="10" y2="9" /></Svg></span><span>Administración</span></Link>
      </div>
      <div className="stats-row stats-compactas" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
        <Cifra href="/panel/envios?f=programada" label="Envíos en curso" valor={enCurso} />
        {bloques.map((b) => <BloqueCard key={b.id} b={b} />)}
        {/* Cuentas suspendidas (usuario, 2026-11-14): últimas 24 h en grande y el total
            histórico debajo; abre Usuarios ya filtrado por suspendidas. */}
        <Link href="/panel/usuarios?estado=suspendida" className="stat-card stat-card-link" style={{ textDecoration: 'none' }}>
          <span className="stat-card-label">Suspendidos · últimas 24 h</span>
          <span className="stat-card-value" style={susp24 > 0 ? { color: 'var(--red)' } : undefined}>{susp24}</span>
          <span className="stat-card-trend" style={{ color: 'var(--gray-500)' }}>{suspTotal} suspendidas en total</span>
        </Link>
        <LineaProntoPago pp={prontoPago} error={errorPP} />
      </div>
      {cuadro}
    </section>
  );
}

// Caja con contador que abre la ventana del bloque: sus primeras líneas (cada una lleva a
// su ficha), «Ver N más» y el botón «Ver todo» a la sección correspondiente.
function BloqueCard({ b }: { b: Bloque }) {
  const [abierto, setAbierto] = useState(false);
  const color = b.total === 0 ? 'var(--gray-500)' : b.nivel === 'urgente' ? 'var(--red)' : b.nivel === 'aviso' ? '#d97706' : 'var(--navy)';
  return (<>
    <button type="button" className="stat-card stat-card-link" style={{ font: 'inherit', textAlign: 'left', cursor: 'pointer', width: '100%' }} onClick={() => setAbierto(true)}>
      <span className="stat-card-label">{b.corto}</span>
      <span className="stat-card-value" style={{ color }}>{b.total}</span>
      <span className="stat-card-trend" style={{ color: 'var(--gray-500)' }}>{b.total === 0 ? 'al día' : 'ver pendientes'}</span>
    </button>
    {abierto && (
      <Modal abierto titulo={b.titulo} sub={b.sub} onCerrar={() => setAbierto(false)}
        pie={<>
          <button className="btn-ghost" onClick={() => setAbierto(false)}>Cerrar</button>
          <Link className="btn-primary" href={b.todo} style={{ textDecoration: 'none' }}>Ver todo →</Link>
        </>}>
        <div className="ph-caja">
          {b.total === 0
            ? <p style={{ fontSize: 'var(--fs-m)', color: 'var(--gray-500)', margin: 0 }}><strong>Al día.</strong> No hay nada esperando respuesta.</p>
            : (<ul className="ph-lista">
                {b.filas.map((f, i) => (
                  <li key={i}>
                    <Link href={f.href} className={`ph-fila${f.urgente ? ' urgente' : ''}`}>
                      <span className="ph-t">{f.t}</span>
                      {f.s && <span className="ph-s">{f.s}</span>}
                      {f.desde && <span className="ph-h" title={fechaHora(f.desde)}>{espera(f.desde)}</span>}
                    </Link>
                  </li>
                ))}
                {b.total > b.filas.length && (
                  <li><Link href={b.todo} className="ph-mas">Ver {b.total - b.filas.length} más →</Link></li>
                )}
              </ul>)}
        </div>
      </Modal>
    )}
  </>);
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
        <input id="pp-linea" type="text" inputMode="decimal" value={linea} placeholder="Ej. 50.000,00" onChange={(e) => setLinea(e.target.value)} autoFocus />
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
