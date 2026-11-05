'use client';

// Dashboard admin (solo Dynamo), copiado de #sec-dashboard-admin de dashboard.html:
// indicadores de lo que hay que atender, últimos envíos y la línea de PRONTO PAGO a
// transportistas (interruptor, línea editable, barra de uso y anticipos de 60 días).
import { SIN_CONEXION } from '@/lib/mensajeError';
import { useState } from 'react';
import Link from 'next/link';
import { useRefrescar } from '@/lib/useRefrescar';
import Cargando from '@/components/Cargando';
import Modal from './Modal';
import { guardarLineaProntoPago, encenderProntoPago } from '@/app/panel/(app)/dashboard-admin/acciones';
import type { MiniEnvio } from './DashboardCliente';
import { euros, fecha, ventana, importe, fechaHora } from '@/lib/formato';

export type ProntoPago = {
  linea: number; encendido: boolean; ventana_dias: number; usado: number; disponible: number; activo: boolean;
  anticipos: { cuando: string; envio: string; transportista: string | null; importe: number; descuento: number; anticipado: number }[];
};
type Cifras = { enCurso: number; sinTransp: number; inc: number; pen: number; alm: number; contra: number; solicitudes: number };

const ESTADO: Record<string, [string, string]> = {
  programado: ['Programado', 'prog'], hacia_la_carga: ['Hacia la carga', 'hacia'], cargando: ['Cargando', 'cargando'],
  en_ruta: ['En ruta', 'enruta'], entregado: ['Entregado', 'entregado'], cancelado: ['Cancelado', 'cancelada'],
};

function Cifra({ href, label, valor, aviso }: { href: string; label: string; valor: number; aviso?: boolean }) {
  return (
    <Link href={href} className="stat-card stat-card-link" style={{ textDecoration: 'none' }}>
      <span className="stat-card-label">{label}</span>
      <span className="stat-card-value" style={aviso && valor > 0 ? { color: '#d97706' } : undefined}>{valor}</span>
    </Link>
  );
}

export default function DashboardAdmin({ cifras, ultimos, prontoPago, errorPP }: {
  cifras: Cifras; ultimos: (MiniEnvio & { importe: number | null })[]; prontoPago: ProntoPago | null; errorPP: string | null;
}) {
  return (
    <section className="section active" id="sec-dashboard-admin">
      <div className="sec-header"><h2>Dashboard admin</h2></div>
      <p style={{ color: 'var(--gray-500)', fontSize: 'var(--fs-m)', margin: '-0.4rem 0 0.9rem' }}>
        <span style={{ display: 'inline-block', background: 'rgba(51,0,204,0.10)', color: 'var(--purple)', fontWeight: 700, borderRadius: 6, padding: '1px 7px', fontSize: 'var(--fs-s)', marginRight: '0.4rem' }}>SOLO ADMIN</span>
        Indicadores internos de gestión: lo que hay que atender hoy y la línea de <strong>pronto pago a transportistas</strong>.
      </p>
      <div className="stats-row" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
        <Cifra href="/panel/envios?f=solicitudes" label="Solicitudes sin precio" valor={cifras.solicitudes} aviso />
        <Cifra href="/panel/envios?f=programada" label="Envíos en curso" valor={cifras.enCurso} />
        <Cifra href="/panel/envios?f=sin-asignar" label="Sin transportista" valor={cifras.sinTransp} aviso />
        <Cifra href="/panel/envios" label="Contraofertas por revisar" valor={cifras.contra} aviso />
        <Cifra href="/panel/incidencias" label="Incidencias abiertas" valor={cifras.inc} aviso />
        <Cifra href="/panel/penalizaciones" label="Penalizaciones por confirmar" valor={cifras.pen} aviso />
        <Cifra href="/panel/almacenamientos" label="Almacenamientos por confirmar" valor={cifras.alm} aviso />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1rem', alignItems: 'start' }}>
        <div className="mini-list-card">
          <div className="mini-list-head"><h4>Últimos envíos creados</h4><Link href="/panel/envios">Ver todos →</Link></div>
          <ul className="mini-list">
            {ultimos.length === 0 ? <li style={{ color: 'var(--gray-500)' }}>Todavía no hay envíos.</li> : ultimos.map((e) => {
              const est = ESTADO[e.estado] ?? ESTADO.programado;
              return (
                <li key={e.id}>
                  <Link href={`/panel/envios?ver=${e.id}`} className="mini-list-left" style={{ textDecoration: 'none', color: 'inherit' }}>
                    <span className="mini-list-date"><span className="ml-ref">#{e.referencia_gx}</span>{e.cliente ? ` · ${e.cliente}` : ''} · {e.fecha_carga_hasta && e.fecha_carga_hasta !== e.fecha_carga_desde ? ventana(e.fecha_carga_desde, e.fecha_carga_hasta) : fecha(e.fecha_carga_desde)}</span>
                    <span className="mini-list-route"><span className="ml-dot orig" />{e.origen || '—'}</span>
                    <span className="mini-list-route"><span className="ml-dot dest" />{e.destino || '—'}</span>
                  </Link>
                  <div className="mini-list-right">
                    <span className={`badge badge-${est[1]}`}>{est[0]}</span>
                    {e.importe != null && <span className="mini-list-amount">{euros(e.importe)}</span>}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
        <LineaProntoPago pp={prontoPago} error={errorPP} />
      </div>
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

  const caja = (hijos: React.ReactNode) => (
    <div style={{ background: '#fff', border: '1px solid var(--gray-200)', borderRadius: 14, padding: '1.1rem 1.2rem' }}>
      <h4 style={{ margin: '0 0 0.2rem' }}>Línea de PRONTO PAGO a transportistas</h4>
      <p style={{ fontSize: 'var(--fs-m)', color: 'var(--gray-500)', margin: '0 0 0.8rem' }}>Crédito propio para adelantar el cobro a los transportistas que eligen pronto pago. Si el disponible se agota (o se apaga), las nuevas ofertas de carga salen <strong>sin</strong> la opción: lo impone la base de datos al crear la oferta.</p>
      {hijos}
    </div>
  );
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
      <Modal abierto titulo="Línea de pronto pago" sub="Amplía o minora la línea según tesorería" icono={ICO_EURO} onCerrar={() => { setFallo(null); setEditando(false); }}
        pie={<>
          <button className="btn-ghost" onClick={() => { setFallo(null); setEditando(false); }} disabled={!!trabajando}>Cancelar</button>
          <button className="btn-primary" disabled={!!trabajando}
            onClick={() => hacer(() => guardarLineaProntoPago(Number(linea.replace(/\./g, '').replace(',', '.'))), 'Guardando la línea')}>Guardar línea</button>
        </>}>
        <div className="ptar-sitio-grid" style={{ gridTemplateColumns: '1fr' }}>
          <div><label htmlFor="pp-linea">Línea total (€)</label>
            <input id="pp-linea" type="text" inputMode="decimal" value={linea} placeholder="50.000,00" onChange={(e) => setLinea(e.target.value)} /></div>
        </div>
        <p style={{ fontSize: 'var(--fs-s)', color: 'var(--gray-500)', margin: '0.6rem 0 0' }}>Ahora mismo: <strong>{euros(pp.linea)}</strong> · anticipado en los últimos {pp.ventana_dias} días: <strong>{euros(pp.usado)}</strong>.</p>
        {fallo && <div className="wiz-warn show" role="alert">⚠ {fallo}</div>}
      </Modal>
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
    <h4 style={{ margin: '1.1rem 0 0.4rem', fontSize: 'var(--fs-m)' }}>Anticipos con pronto pago · últimos {pp.ventana_dias} días ({pp.anticipos.length})</h4>
    {pp.anticipos.length === 0 ? <p style={{ fontSize: 'var(--fs-m)', color: 'var(--gray-500)', margin: 0 }}>Ningún transportista ha elegido pronto pago en este periodo.</p>
      : pp.anticipos.map((a, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', flexWrap: 'wrap', border: '1px solid var(--gray-200)', borderRadius: 9, padding: '0.45rem 0.7rem', marginBottom: '0.35rem', fontSize: 'var(--fs-m)' }}>
          <span style={{ color: 'var(--gray-500)', minWidth: 86 }}>{fechaHora(a.cuando)}</span>
          <strong>#{a.envio}</strong>
          <span style={{ flex: 1, minWidth: 120 }}>{a.transportista ?? '—'}</span>
          <span style={{ color: 'var(--gray-500)' }}>{euros(a.importe)} − {euros(a.descuento)}</span>
          <strong>{euros(a.anticipado)}</strong>
        </div>
      ))}
    {fallo && !editando && <div className="wiz-warn show" role="alert">⚠ {fallo}</div>}
    {trabajando && <Cargando texto={trabajando} />}
  </>);
}
