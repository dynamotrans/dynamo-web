'use client';

// Administración: el diseño de #sec-facturas / #sec-albaranes de dashboard.html (pestañas
// arriba, buscador, tabla .data) con una pestaña más, PROFORMAS, que es lo que hoy tiene
// datos reales en la plataforma. Las facturas viven en Holded (llegarán al conectarlo).
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useRefrescar } from '@/lib/useRefrescar';
import Cargando from '@/components/Cargando';
import Modal from './Modal';
import { avisarNavegando } from '@/components/panel/CargandoNavegacion';
import { marcarPagadoAlmacenamiento } from '@/app/panel/(app)/almacenamientos/acciones';
import { marcarPagoEnvio, registrarTransferenciaEnvio } from '@/app/panel/(app)/envios/acciones';
import FormTransferencia, { type DatosTransferencia } from './FormTransferencia';
import { euros, fecha, fechaHora, textoBusqueda } from '@/lib/formato';
import PaginadorLocal, { usePaginas } from './PaginadorLocal';
import CuentaAtras from './CuentaAtras';

export type ProformaFila = {
  // Proformas de ENVÍOS y de almacenamientos en la misma lista (usuario, 2026-11-14).
  id: string; tipo: 'almacenamiento' | 'envio'; codigo: string; referencia_cliente: string; cliente: string | null;
  concepto: string; base: number; total: number; pagado_en: string | null; creado_en: string | null;
  banco?: string | null;   // banco de la transferencia (solo lo recibe Dynamo)
  limite?: string | null;  // sin pagar: hasta cuándo se puede pagar (pasado, el envío y la proforma se anulan)
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
  const [filtro, setFiltro] = useState<'sin_pagar' | 'pagadas' | 'todas'>('todas');   // por defecto TODAS, sin filtrar por pendientes (usuario, 2026-11-17)
  const [q, setQ] = useState('');
  const [trabajando, setTrabajando] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  // Marcar una proforma de envío como pagada pide banco, concepto y fecha en una ventana
  // (usuario, 2026-11-17: que no se marque por error de un solo toque).
  const [transferir, setTransferir] = useState<ProformaFila | null>(null);

  const sinPagar = proformas.filter((p) => !p.pagado_en).length;
  const lista = useMemo(() => {
    const w = norm(textoBusqueda(q)).split(/\s+/).filter(Boolean);
    const casa = (t: string) => w.every((x) => norm(t).includes(x));
    if (pestana === 'proformas') {
      return proformas.filter((p) => (filtro === 'todas' || (filtro === 'pagadas') === !!p.pagado_en)
        && casa([p.codigo, p.cliente, p.referencia_cliente, p.concepto, euros(p.total)].filter(Boolean).join(' ')));
    }
    return albaranes.filter((a) => casa([a.gx, a.ruta, a.nombre].filter(Boolean).join(' ')));
  }, [pestana, filtro, q, proformas, albaranes]);
  const pg = usePaginas<ProformaFila | AlbaranFila>(lista, `${pestana}|${filtro}|${q}`);

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
        <button className={`tab${pestana === 'proformas' ? ' active' : ''}`} onClick={() => { setPestana('proformas'); setQ(''); }}>Proformas{sinPagar ? ` (${sinPagar} sin pagar)` : ''}</button>
        <button className={`tab${pestana === 'albaranes' ? ' active' : ''}`} onClick={() => { setPestana('albaranes'); setQ(''); }}>Albaranes ({albaranes.length})</button>
        <button className={`tab${pestana === 'facturas' ? ' active' : ''}`} onClick={() => setPestana('facturas')}>Facturas</button>
      </div>

      {pestana === 'facturas' ? (
        <div className="pt-aviso info" style={{ maxWidth: 680 }}><div>
          <strong>Las facturas llegarán aquí al conectar la plataforma con la facturación.</strong> Mientras tanto, {dynamo ? 'se emiten y consultan como siempre.' : 'te las seguimos enviando por email como hasta ahora.'}
        </div></div>
      ) : <>
        <div className="filters">
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)}
            placeholder={pestana === 'proformas' ? `Buscar por nº de envío${dynamo ? ', cliente' : ''}, referencia, importe…` : 'Buscar por nº de envío, ruta, nombre del archivo…'} />
          {pestana === 'proformas' && (
            <select className="filter-estado" value={filtro} onChange={(e) => setFiltro(e.target.value as typeof filtro)} aria-label="Filtrar por pago">
              <option value="todas">Todas</option>
              <option value="sin_pagar">Sin pagar</option>
              <option value="pagadas">Pagadas</option>
            </select>
          )}
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
                      : <><span className="badge badge-red">Sin pagar</span>{p.limite && <div className="meta pago-plazo" title={`Se puede pagar hasta el ${fechaHora(p.limite)}; después el envío y su proforma se anulan solos`}>Caduca: <CuentaAtras hasta={p.limite} corto vencidoTxt="plazo vencido" /></div>}</>}
                      {gestor && <div style={{ marginTop: '0.3rem' }}>
                        <button type="button" className="btn-ghost" style={{ minHeight: 30, padding: '0 0.6rem', fontSize: 'var(--fs-s)' }} onClick={(ev) => { ev.stopPropagation(); pagar(p, !p.pagado_en); }}>
                          {p.pagado_en ? 'Quitar pago' : p.tipo === 'envio' ? 'Transferencia recibida' : 'Marcar pagada'}
                        </button>
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
