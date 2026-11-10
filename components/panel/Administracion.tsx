'use client';

// Administración: el diseño de #sec-facturas / #sec-albaranes de dashboard.html (pestañas
// arriba, buscador, tabla .data) con una pestaña más, PROFORMAS, que es lo que hoy tiene
// datos reales en la plataforma. Las facturas viven en Holded (llegarán al conectarlo).
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useRefrescar } from '@/lib/useRefrescar';
import Cargando from '@/components/Cargando';
import { avisarNavegando } from '@/components/panel/CargandoNavegacion';
import { marcarPagadoAlmacenamiento } from '@/app/panel/(app)/almacenamientos/acciones';
import { euros, fecha } from '@/lib/formato';

export type ProformaFila = {
  id: string; codigo: string; referencia_cliente: string; cliente: string | null; estado: string;
  fecha_entrada: string; fecha_salida: string; base: number; total: number; pagado_en: string | null; creado_en: string;
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
  const refrescar = useRefrescar();
  const [pestana, setPestana] = useState<Pestana>(pestanaInicial);
  const [filtro, setFiltro] = useState<'sin_pagar' | 'pagadas' | 'todas'>('sin_pagar');
  const [q, setQ] = useState('');
  const [trabajando, setTrabajando] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const sinPagar = proformas.filter((p) => !p.pagado_en).length;
  const lista = useMemo(() => {
    const w = norm(q).split(/\s+/).filter(Boolean);
    const casa = (t: string) => w.every((x) => norm(t).includes(x));
    if (pestana === 'proformas') {
      return proformas.filter((p) => (filtro === 'todas' || (filtro === 'pagadas') === !!p.pagado_en)
        && casa([p.codigo, p.cliente, p.referencia_cliente, euros(p.total)].filter(Boolean).join(' ')));
    }
    return albaranes.filter((a) => casa([a.gx, a.ruta, a.nombre].filter(Boolean).join(' ')));
  }, [pestana, filtro, q, proformas, albaranes]);

  async function pagar(p: ProformaFila, pagado: boolean) {
    setAviso(null); setTrabajando(pagado ? 'Marcando como pagada' : 'Quitando el pago');
    const r = await marcarPagadoAlmacenamiento(p.id, pagado);
    setTrabajando(null);
    if (!r.ok) { setAviso(r.error); return; }
    refrescar();
  }

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
            placeholder={pestana === 'proformas' ? `Buscar por nº de almacenamiento${dynamo ? ', cliente' : ''}, referencia, importe…` : 'Buscar por nº de envío, ruta, nombre del archivo…'} />
          {pestana === 'proformas' && (
            <select className="filter-estado" value={filtro} onChange={(e) => setFiltro(e.target.value as typeof filtro)} aria-label="Filtrar por pago">
              <option value="sin_pagar">Sin pagar</option>
              <option value="pagadas">Pagadas</option>
              <option value="todas">Todas</option>
            </select>
          )}
        </div>
        {error && <div className="pt-aviso error">No se ha podido cargar: {error}</div>}
        {aviso && <div className="wiz-warn show" role="alert">⚠ {aviso}</div>}

        {pestana === 'proformas' ? (
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>Proforma</th>{dynamo && <th>Cliente</th>}<th>Almacenamiento</th><th>Base (sin IVA)</th><th>Total (IVA incl.)</th><th>Pago</th><th /></tr></thead>
              <tbody>
                {lista.length === 0 ? (
                  <tr><td colSpan={dynamo ? 7 : 6} style={{ textAlign: 'center', padding: '2rem', color: 'var(--gray-500)' }}>
                    {proformas.length ? 'No hay proformas con este filtro.' : 'Aún no hay proformas. Salen solas de los almacenamientos con pago por adelantado.'}
                  </td></tr>
                ) : (lista as ProformaFila[]).map((p) => (
                  <tr key={p.id}>
                    <td className="ref"><strong>#{p.codigo}</strong><div className="meta">Emitida el {fecha(diaMadrid(p.creado_en))}{p.referencia_cliente ? ` · ${p.referencia_cliente}` : ''}</div></td>
                    {dynamo && <td>{p.cliente ?? '—'}</td>}
                    <td>{fecha(p.fecha_entrada)} – {fecha(p.fecha_salida)}</td>
                    <td>{euros(p.base)}</td>
                    <td><strong>{euros(p.total)}</strong></td>
                    <td>{p.pagado_en
                      ? <span className="badge badge-entregado">Pagada el {fecha(diaMadrid(p.pagado_en))}</span>
                      : <span className="badge badge-red">Sin pagar</span>}
                      {gestor && <div style={{ marginTop: '0.3rem' }}>
                        <button type="button" className="btn-ghost" style={{ minHeight: 30, padding: '0 0.6rem', fontSize: 'var(--fs-s)' }} onClick={() => pagar(p, !p.pagado_en)}>
                          {p.pagado_en ? 'Quitar pago' : 'Marcar pagada'}
                        </button>
                      </div>}
                    </td>
                    <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                      <button type="button" className="btn-secondary" style={{ minHeight: 34, padding: '0 0.8rem' }} onClick={() => abrir(`/panel/almacenamientos/${p.id}/proforma`)}>Ver PDF</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>Envío</th><th>Documento</th><th>Subido</th>{dynamo && <th>Lo ve el cliente</th>}<th /></tr></thead>
              <tbody>
                {lista.length === 0 ? (
                  <tr><td colSpan={dynamo ? 5 : 4} style={{ textAlign: 'center', padding: '2rem', color: 'var(--gray-500)' }}>
                    {albaranes.length ? 'No hay albaranes que coincidan.' : 'Aún no hay albaranes. Se suben desde la ficha de cada envío.'}
                  </td></tr>
                ) : (lista as AlbaranFila[]).map((a) => (
                  // La ficha se abre con ?ver=: /panel/envios/<id> a secas NO existe y daba
                  // 404 al tocar la fila (usuario, 2026-11-10).
                  <tr key={a.id} style={{ cursor: 'pointer' }} onClick={() => { avisarNavegando(); router.push(`/panel/envios?ver=${a.envio_id}`, { scroll: false }); }}>
                    <td className="ref"><strong>{a.gx ? `#${a.gx}` : 'Envío'}</strong>{a.ruta && <div className="meta">{a.ruta}</div>}</td>
                    <td>{a.tipo === 'cmr_firmado' ? 'CMR firmado' : 'Albarán'}<div className="meta">{a.nombre}</div></td>
                    <td>{fecha(diaMadrid(a.creado_en))}</td>
                    {dynamo && <td>{a.visible_cliente ? 'Sí' : 'No'}</td>}
                    <td style={{ textAlign: 'right' }}>
                      <button type="button" className="btn-secondary" style={{ minHeight: 34, padding: '0 0.8rem' }} onClick={(ev) => { ev.stopPropagation(); abrir(`/panel/documentos/${a.id}`); }}>Ver</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </>}
      {trabajando && <Cargando texto={trabajando} />}
    </section>
  );
}
