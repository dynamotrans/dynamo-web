'use client';

// Administración: el diseño de #sec-facturas / #sec-albaranes de dashboard.html (pestañas
// arriba, buscador, tabla .data) con una pestaña más, PROFORMAS, que es lo que hoy tiene
// datos reales en la plataforma. Las facturas emitidas salen de la copia que se mantiene al día sola.
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useRefrescar } from '@/lib/useRefrescar';
import Cargando from '@/components/Cargando';
import Modal from './Modal';
import { avisarNavegando } from '@/components/panel/CargandoNavegacion';
import { marcarPagadoAlmacenamiento } from '@/app/panel/(app)/almacenamientos/acciones';
import { marcarPagoEnvio, registrarTransferenciaEnvio, rechazarPagoEnvio } from '@/app/panel/(app)/envios/acciones';
import FormTransferencia, { type DatosTransferencia } from './FormTransferencia';
import { euros, fecha, fechaHora, textoBusqueda } from '@/lib/formato';
import PaginadorLocal, { usePaginas } from './PaginadorLocal';
import CuentaAtras from './CuentaAtras';
import Facturas from './Facturas';
import FiltroFechas, { useFiltroFechas } from './FiltroFechas';
import { enRango, diaMadridDe } from '@/lib/filtroFechas';

export type ProformaFila = {
  // Proformas de ENVÍOS y de almacenamientos en la misma lista (usuario, 2026-11-14).
  id: string; tipo: 'almacenamiento' | 'envio'; codigo: string; referencia_cliente: string; cliente: string | null;
  concepto: string; base: number; total: number; pagado_en: string | null; creado_en: string | null;
  banco?: string | null;   // banco de la transferencia (solo lo recibe Dynamo)
  limite?: string | null;  // sin pagar: hasta cuándo se puede pagar (pasado, el envío y la proforma se anulan)
  avisado?: string | null; // sin pagar: el cliente avisó de su transferencia (plazo parado; Dynamo la valida o la rechaza)
};
export type AlbaranFila = {
  id: string; tipo: string; nombre: string; envio_id: string; creado_en: string; visible_cliente: boolean; gx: string | null; ruta: string;
};
type Pestana = 'proformas' | 'albaranes' | 'facturas';

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const diaMadrid = (ts: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date(ts));
// Regla 0-bis: todo PDF se ABRE en el visor (ventana nueva).
const abrir = (url: string) => { const w = window.open(url, '_blank'); if (!w) location.href = url; };

export default function Administracion({ proformas, albaranes, dynamo, gestor, pestanaInicial, error }: {
  proformas: ProformaFila[]; albaranes: AlbaranFila[]; dynamo: boolean; gestor: boolean; pestanaInicial: Pestana; error: string | null;
}) {
  const router = useRouter();
  // Al pulsar un albarán se elige qué abrir (usuario, 2026-11-14): 1º ver el PDF, 2º el envío.
  const [elegirAlb, setElegirAlb] = useState<AlbaranFila | null>(null);
  const refrescar = useRefrescar();
  const [pestana, setPestana] = useState<Pestana>(pestanaInicial);
  const [filtro, setFiltro] = useState<'sin_pagar' | 'pagadas' | 'todas' | 'por_validar'>('todas');   // por defecto TODAS, sin filtrar por pendientes (usuario, 2026-11-17)
  const [q, setQ] = useState('');
  const ff = useFiltroFechas();   // proformas: día de creación; albaranes: día en que se subió
  const [trabajando, setTrabajando] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  // Marcar una proforma de envío como pagada pide banco, concepto y fecha en una ventana
  // (usuario, 2026-11-17: que no se marque por error de un solo toque).
  const [transferir, setTransferir] = useState<ProformaFila | null>(null);
  const [rechazar, setRechazar] = useState<ProformaFila | null>(null);   // «Pago no recibido»: se pregunta antes de anular
  const [motivoRechazo, setMotivoRechazo] = useState('');

  const sinPagar = proformas.filter((p) => !p.pagado_en).length;
  const porValidar = proformas.filter((p) => !p.pagado_en && p.avisado).length;
  const lista = useMemo(() => {
    const w = norm(textoBusqueda(q)).split(/\s+/).filter(Boolean);
    const casa = (t: string) => w.every((x) => norm(t).includes(x));
    if (pestana === 'proformas') {
      return proformas.filter((p) => (filtro === 'todas' || (filtro === 'por_validar' ? !p.pagado_en && !!p.avisado : (filtro === 'pagadas') === !!p.pagado_en))
        && enRango(p.creado_en ? diaMadridDe(p.creado_en) : null, ff.rango)
        && casa([p.codigo, p.cliente, p.referencia_cliente, p.concepto, euros(p.total)].filter(Boolean).join(' ')));
    }
    return albaranes.filter((a) => enRango(diaMadridDe(a.creado_en), ff.rango) && casa([a.gx, a.ruta, a.nombre].filter(Boolean).join(' ')));
  }, [pestana, filtro, q, proformas, albaranes, ff.rango]);
  const pg = usePaginas<ProformaFila | AlbaranFila>(lista, `${pestana}|${filtro}|${q}|${ff.clave}`);

  async function pagar(p: ProformaFila, pagado: boolean) {
    // La transferencia de un ENVÍO no se marca de un toque: abre su ventana.
    if (p.tipo === 'envio' && pagado) { setAviso(null); setTransferir(p); return; }
    setAviso(null); setTrabajando(pagado ? 'Marcando como pagada' : 'Quitando el pago');
    // El pago de un ENVÍO se deshace con su propia acción; tarjeta y exento viven en la
    // ficha del envío, con sus motivos.
    const r = p.tipo === 'envio' ? await marcarPagoEnvio(p.id, 'deshacer') : await marcarPagadoAlmacenamiento(p.id, pagado);
    setTrabajando(null);
    if (!r.ok) { setAviso(r.error); return; }
    refrescar();
  }

  async function confirmarTransferencia(d: DatosTransferencia) {
    if (!transferir) return;
    setTrabajando('Marcando como pagada');
    const r = await registrarTransferenciaEnvio(transferir.id, d);
    setTrabajando(null);
    if (!r.ok) { setAviso(r.error); return; }
    setTransferir(null); refrescar();
  }
  // Pulsar una proforma de envío lleva al detalle del envío (usuario, 2026-11-17).
  const alEnvio = (p: ProformaFila) => { if (p.tipo !== 'envio') return; avisarNavegando(); router.push(`/panel/envios?ver=${p.id}`); };

  return (
    <section className="section active" id="sec-facturas">
      <div className="sec-header"><h2>Administración</h2></div>
      <div className="tabs" style={{ marginBottom: '0.8rem' }}>
        {/* Orden pedido por el usuario (2026-11-24): Albaranes · Proformas · Facturas. La que se abre
            al entrar sigue siendo Proformas (ahí llevan los avisos de pago). */}
        <button className={`tab${pestana === 'albaranes' ? ' active' : ''}`} onClick={() => { setPestana('albaranes'); setQ(''); }}>Albaranes ({albaranes.length})</button>
        <button className={`tab${pestana === 'proformas' ? ' active' : ''}`} onClick={() => { setPestana('proformas'); setQ(''); }}>Proformas{sinPagar ? ` (${sinPagar} sin pagar)` : ''}</button>
        <button className={`tab${pestana === 'facturas' ? ' active' : ''}`} onClick={() => setPestana('facturas')}>Facturas</button>
      </div>

      {pestana === 'facturas' ? (
        <Facturas dynamo={dynamo} />
      ) : <>
        <div className="filters">
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)}
            placeholder={pestana === 'proformas' ? `Buscar por nº de envío${dynamo ? ', cliente' : ''}, referencia, importe…` : 'Buscar por nº de envío, ruta, nombre del archivo…'} />
          {pestana === 'proformas' && (
            <select className="filter-estado" value={filtro} onChange={(e) => setFiltro(e.target.value as typeof filtro)} aria-label="Filtrar por pago">
              <option value="todas">Todas</option>
              <option value="sin_pagar">Sin pagar</option>
              <option value="por_validar">Transferencia avisada · por validar{porValidar ? ` (${porValidar})` : ''}</option>
              <option value="pagadas">Pagadas</option>
            </select>
          )}
          <FiltroFechas valor={ff.valor} desde={ff.desde} hasta={ff.hasta} onCambio={ff.onCambio} etiqueta={pestana === 'proformas' ? 'Filtrar por fecha de la proforma' : 'Filtrar por fecha del albarán'} />
        </div>
        {error && <div className="pt-aviso error">No se ha podido cargar: {error}</div>}
        {aviso && <div className="wiz-warn show" role="alert">⚠ {aviso}</div>}

        {pestana === 'proformas' ? (
          <div className="table-wrap" tabIndex={0}>
            <table className="data">
              <thead><tr><th>Proforma</th>{dynamo && <th>Cliente</th>}<th>Concepto</th><th>Base (sin IVA)</th><th>Total (IVA incl.)</th><th>Pago</th><th /></tr></thead>
              <tbody>
                {lista.length === 0 ? (
                  <tr><td colSpan={dynamo ? 7 : 6} style={{ textAlign: 'center', padding: '2rem', color: 'var(--gray-500)' }}>
                    {proformas.length ? 'No hay proformas con este filtro.' : 'Aún no hay proformas. Salen solas de los envíos con pago por adelantado; también las tienes en la ficha de cada envío.'}
                  </td></tr>
                ) : (pg.visibles as ProformaFila[]).map((p) => (
                  <tr key={p.id} onClick={() => alEnvio(p)} style={p.tipo === 'envio' ? { cursor: 'pointer' } : undefined}
                    title={p.tipo === 'envio' ? 'Abrir el detalle del envío' : undefined}>
                    <td className="ref"><strong>#{p.codigo}</strong><div className="meta">{p.creado_en ? `Emitida el ${fecha(diaMadrid(p.creado_en))}` : ''}{p.referencia_cliente ? `${p.creado_en ? ' · ' : ''}${p.referencia_cliente}` : ''}</div></td>
                    {dynamo && <td>{p.cliente ?? '—'}</td>}
                    <td>{p.concepto}</td>
                    <td>{euros(p.base)}</td>
                    <td><strong>{euros(p.total)}</strong></td>
                    <td>{p.pagado_en
                      ? <><span className="badge badge-entregado">Pagada el {fecha(diaMadrid(p.pagado_en))}</span>{p.banco ? <div className="meta">{p.banco}</div> : null}</>
                      : p.avisado
                        ? <><span className="badge badge-orange pago-avisado-chip">{dynamo ? 'Transferencia avisada · validar' : 'Validando tu transferencia'}</span><div className="meta">Avisada el {fechaHora(p.avisado)} · plazo parado</div></>
                        : <><span className="badge badge-red">Sin pagar</span>{p.limite && <div className="meta pago-plazo" title={`Se puede pagar hasta el ${fechaHora(p.limite)}; después el envío y su proforma se anulan solos`}><CuentaAtras hasta={p.limite} corto etiqueta="Caduca" vencidoTxt="Plazo vencido" /></div>}</>}
                      {gestor && <div style={{ marginTop: '0.3rem' }}>
                        <button type="button" className="btn-ghost" style={{ minHeight: 30, padding: '0 0.6rem', fontSize: 'var(--fs-s)' }} onClick={(ev) => { ev.stopPropagation(); pagar(p, !p.pagado_en); }}>
                          {p.pagado_en ? 'Quitar pago' : p.tipo === 'envio' ? 'Transferencia recibida' : 'Marcar pagada'}
                        </button>
                        {p.tipo === 'envio' && !p.pagado_en && (
                          <button type="button" className="btn-ghost pago-no-recibido" style={{ minHeight: 30, padding: '0 0.6rem', fontSize: 'var(--fs-s)', color: '#b42318', marginLeft: '0.3rem' }}
                            onClick={(ev) => { ev.stopPropagation(); setAviso(null); setMotivoRechazo(''); setRechazar(p); }}>Pago no recibido</button>
                        )}
                      </div>}
                    </td>
                    <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                      <button type="button" className="btn-secondary" style={{ minHeight: 34, padding: '0 0.8rem' }} onClick={(ev) => { ev.stopPropagation(); abrir(`/panel/${p.tipo === 'envio' ? 'envios' : 'almacenamientos'}/${p.id}/proforma`); }}>Ver PDF</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="table-wrap" tabIndex={0}>
            <table className="data">
              <thead><tr><th>Envío</th><th>Documento</th><th>Subido</th>{dynamo && <th>Lo ve el cliente</th>}<th /></tr></thead>
              <tbody>
                {lista.length === 0 ? (
                  <tr><td colSpan={dynamo ? 5 : 4} style={{ textAlign: 'center', padding: '2rem', color: 'var(--gray-500)' }}>
                    {albaranes.length ? 'No hay albaranes que coincidan.' : 'Aún no hay albaranes. Se suben desde la ficha de cada envío.'}
                  </td></tr>
                ) : (pg.visibles as AlbaranFila[]).map((a) => (
                  // La ficha se abre con ?ver=: /panel/envios/<id> a secas NO existe y daba
                  // 404 al tocar la fila (usuario, 2026-11-10).
                  <tr key={a.id} style={{ cursor: 'pointer' }} onClick={() => setElegirAlb(a)}>
                    <td className="ref"><strong>{a.gx ? `#${a.gx}` : 'Envío'}</strong>{a.ruta && <div className="meta">{a.ruta}</div>}</td>
                    <td>{a.tipo === 'cmr_firmado' ? 'CMR firmado' : 'Albarán'}<div className="meta">{a.nombre}</div></td>
                    <td>{fecha(diaMadrid(a.creado_en))}</td>
                    {dynamo && <td>{a.visible_cliente ? 'Sí' : 'No'}</td>}
                    <td style={{ textAlign: 'right' }}>
                      <button type="button" className="btn-secondary" style={{ minHeight: 34, padding: '0 0.8rem' }} onClick={(ev) => { ev.stopPropagation(); setElegirAlb(a); }}>Ver</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <PaginadorLocal p={pg} nombre={pestana === 'proformas' ? 'proformas' : 'albaranes'} nombreUno={pestana === 'proformas' ? 'proforma' : 'albarán'} />
      </>}
      {trabajando && <Cargando texto={trabajando} />}
      {rechazar && (
        <Modal abierto ancho={480} onCerrar={() => { if (!trabajando) setRechazar(null); }} titulo={`Pago no recibido · PRO-${rechazar.codigo}`}
          sub={`${rechazar.cliente ? `${rechazar.cliente} · ` : ''}${euros(rechazar.total)} (IVA incl.)`}
          pie={<>
            <button className="btn-ghost" disabled={!!trabajando} onClick={() => setRechazar(null)}>Volver</button>
            <button className="btn-primary" style={{ background: 'var(--red)' }} disabled={!!trabajando} onClick={async () => {
              setTrabajando('Anulando el envío');
              const r = await rechazarPagoEnvio(rechazar.id, motivoRechazo);
              setTrabajando(null);
              if (!r.ok) { setAviso(r.error ?? 'No se ha podido rechazar el pago.'); setRechazar(null); return; }
              setRechazar(null); refrescar();
            }}>Sí, anular el envío</button>
          </>}>
          <p style={{ margin: '0 0 0.7rem', fontSize: 'var(--fs-m)', color: 'var(--gray-700)' }}>
            No te consta la transferencia en el banco. El envío <strong>#{rechazar.codigo}</strong> y esta proforma quedan <strong>anulados sin pago</strong> (no cuenta como cancelación del cliente) y el cliente recibe el aviso de volver a pedirlo.
          </p>
          <label htmlFor="adm-rechazo">Nota para el historial <span style={{ fontWeight: 500, color: 'var(--gray-500)' }}>· opcional</span></label>
          <input id="adm-rechazo" type="text" maxLength={200} value={motivoRechazo} onChange={(e) => setMotivoRechazo(e.target.value)} placeholder="Ej. no aparece en el banco a las 12:30" />
        </Modal>
      )}
      {transferir && (
        <Modal abierto onCerrar={() => { if (!trabajando) setTransferir(null); }} titulo={`Marcar como pagada · PRO-${transferir.codigo}`}
          sub={`${transferir.cliente ? `${transferir.cliente} · ` : ''}${euros(transferir.total)} (IVA incl.)`}>
          <p style={{ margin: '0 0 0.7rem', fontSize: 'var(--fs-m)', color: 'var(--gray-700)' }}>
            Confirma dónde y cuándo ha entrado la transferencia. Al marcarla, el envío pasa a <strong>pendiente de asignar</strong>.
          </p>
          {aviso && <div className="pt-aviso error" role="alert"><div>{aviso}</div></div>}
          <FormTransferencia gx={transferir.codigo} ocupado={!!trabajando} onCancelar={() => setTransferir(null)} onConfirmar={confirmarTransferencia} />
        </Modal>
      )}
      {elegirAlb && (
        <Modal abierto onCerrar={() => setElegirAlb(null)}
          titulo={`${elegirAlb.tipo === 'cmr_firmado' ? 'CMR firmado' : 'Albarán'} · ${elegirAlb.gx ? `#${elegirAlb.gx}` : 'envío'}`}
          sub={elegirAlb.nombre}
          pie={<button type="button" className="btn-ghost" onClick={() => setElegirAlb(null)}>Cancelar</button>}>
          <div style={{ display: 'grid', gap: '0.55rem' }}>
            <button type="button" className="btn-primary" style={{ minHeight: 48 }}
              onClick={() => { abrir(`/panel/documentos/${elegirAlb.id}`); setElegirAlb(null); }}>
              Ver {elegirAlb.tipo === 'cmr_firmado' ? 'el CMR firmado' : 'el albarán'} (PDF)
            </button>
            <button type="button" className="btn-secondary" style={{ minHeight: 48 }}
              onClick={() => { const id = elegirAlb.envio_id; setElegirAlb(null); avisarNavegando(); router.push(`/panel/envios?ver=${id}`, { scroll: false }); }}>
              Abrir el envío relacionado
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}
