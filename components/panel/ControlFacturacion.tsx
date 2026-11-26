'use client';

// Control de facturación (solo Dynamo) — usuario, 2026-11-20: «que todos los envíos que se han
// hecho exista su pedido de compra y de venta, y que no falte… al igual que las paralizaciones
// o penalizaciones… aunque sea cero». No mira facturas, cobros ni margen (eso es de Holded y
// del propio Dynamo). Arriba, el cuadre por meses (pedidos de venta frente a pedidos de
// compra pasados a Holded); debajo, cada envío al que le falta algo, con enlace a su ficha.
import { useMemo, useState } from 'react';
import { useRefrescar } from '@/lib/useRefrescar';
import { controlFacturacionResuelto } from '@/app/panel/(app)/exportaciones/acciones';
import { euros, fecha, numero } from '@/lib/formato';
import PaginadorLocal, { usePaginas } from './PaginadorLocal';
import FiltroFechas, { useFiltroFechas } from './FiltroFechas';
import { enRango } from '@/lib/filtroFechas';

export type FilaControl = {
  envio_id: string; referencia: string | null; cliente: string | null; transportista: string | null; estado: string | null;
  tipo: string; gravedad: string; detalle: string; importe: number | null; fecha: string | null; total_tipo: number;
};
export type FilaCuadre = {
  mes: string; envios: number; con_transportista: number; venta_en_holded: number; compra_en_holded: number;
  penalizaciones: number; venta: number; compra: number;
};

export const TIPOS_CONTROL: Record<string, string> = {
  venta_sin_holded: 'Sin pedido de venta en Holded',
  compra_sin_holded: 'Sin pedido de compra en Holded',
  compra_sin_venta: 'Compra pasada, venta no',
  venta_sin_compra: 'Venta pasada, compra no',
  cambio_tras_holded: 'Cambiados después de pasarlos',
  penalizacion_sin_confirmar: 'Penalizaciones sin confirmar',
  sin_transportista: 'Entregados sin transportista',
  venta_sin_precio: 'Porte a 0 € al cliente',
  compra_sin_precio: 'Porte a 0 € al transportista',
};
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const mesTxt = (m: string) => `${MESES[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
const fechaTxt = (d: string | null) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : '—');

// Celda «x de y»: en rojo si falta alguno.
function Parte({ n, de }: { n: number; de: number }) {
  const falta = de - n;
  return <span style={{ fontWeight: 700, color: falta > 0 ? '#c0262d' : 'var(--green-dark, #15803d)', whiteSpace: 'nowrap' }}>{numero(n, 0)}{falta > 0 && <span style={{ fontWeight: 600, fontSize: 'var(--fs-s)' }}> · faltan {numero(falta, 0)}</span>}</span>;
}

export default function ControlFacturacion({ filas, cuadre, error, desde = null }: { filas: FilaControl[]; cuadre: FilaCuadre[]; error: string | null; desde?: string | null }) {
  const refrescar = useRefrescar();
  const [tipo, setTipo] = useState('');
  const ff = useFiltroFechas();   // por la fecha de carga del envío
  const [trabajando, setTrabajando] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ ok: boolean; txt: string } | null>(null);

  // Un resumen por tipo de problema (el total viene de la base de datos aunque la lista se corte).
  const tipos = useMemo(() => {
    const m = new Map<string, { tipo: string; gravedad: string; total: number }>();
    for (const f of filas) if (!m.has(f.tipo)) m.set(f.tipo, { tipo: f.tipo, gravedad: f.gravedad, total: f.total_tipo });
    return [...m.values()].sort((a, b) => (a.gravedad === b.gravedad ? b.total - a.total : a.gravedad === 'grave' ? -1 : 1));
  }, [filas]);
  const graves = tipos.filter((t) => t.gravedad === 'grave').reduce((s, t) => s + t.total, 0);
  const lista = useMemo(() => filas.filter((f) => (!tipo || f.tipo === tipo) && enRango(f.fecha, ff.rango)), [filas, tipo, ff.rango]);
  const pg = usePaginas(lista, `${tipo}|${ff.clave}`, 25);
  const cortado = !ff.rango && tipos.find((t) => t.tipo === tipo && t.total > lista.length);

  async function resuelto(f: FilaControl) {
    setTrabajando(f.envio_id); setAviso(null);
    const r = await controlFacturacionResuelto(f.envio_id);
    setTrabajando(null);
    setAviso(r.ok ? { ok: true, txt: `#${f.referencia}: anotado como corregido en Holded.` } : { ok: false, txt: r.error });
    if (r.ok) refrescar();
  }

  return (
    <div id="control-facturacion">
      {/* «Revisar desde» de Parámetros (2026-11-23): los envíos anteriores no se miran. */}
      {desde && <p className="meta" data-control-desde="" style={{ margin: '0 0 0.6rem' }}>
        Se revisan los envíos entregados o cancelados <strong>desde el {fecha(desde)}</strong> (se cambia en Parámetros → Control de facturación).
      </p>}
      <p style={{ margin: '0 0 1rem', fontSize: 'var(--fs-l)', color: 'var(--gray-500)', maxWidth: 820, lineHeight: 1.5 }}>
        Cada envío saca <strong>a la vez</strong> su pedido de venta (al cliente) y su pedido de compra (al transportista), con el <strong>mismo número</strong> (la referencia GX).
        Cada penalización o paralización confirmada va al pedido del lado que la paga: al de venta si se cobra al cliente y al de compra si se paga al transportista (<strong>a 0 € no va</strong>). Aquí se comprueba que no falte ninguno en Holded y que no haya cambiado nada después de pasarlo.
        Solo envíos de Dynamo: los del transportista propio del cliente no llevan pedidos.
      </p>
      {error && <div className="pt-aviso error" style={{ marginBottom: '0.8rem' }}><div>No se ha podido leer el control: {error}</div></div>}
      {aviso && <div className={`pt-aviso ${aviso.ok ? 'info' : 'error'}`} role="status" style={{ marginBottom: '0.8rem' }}><div>{aviso.txt}</div></div>}

      <h3 style={{ fontSize: 'var(--fs-l)', margin: '0 0 0.5rem' }}>Cuadre por meses</h3>
      <div className="table-wrap" tabIndex={0} style={{ marginBottom: '1.4rem' }}>
        <table className="data" id="cuadre-meses">
          <thead><tr><th>Mes (fecha de carga)</th><th>Envíos</th><th>Pedidos de venta en Holded</th><th>Pedidos de compra en Holded</th><th>Líneas de penalización</th><th className="amount">Venta</th><th className="amount">Compra</th></tr></thead>
          <tbody>
            {cuadre.length === 0 ? <tr><td colSpan={7} style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--gray-500)' }}>Aún no hay envíos entregados.</td></tr>
              : cuadre.map((c) => (
                <tr key={c.mes}>
                  <td style={{ whiteSpace: 'nowrap', fontWeight: 700, textTransform: 'capitalize' }}>{mesTxt(c.mes)}</td>
                  <td><strong>{numero(c.envios, 0)}</strong>{c.envios > c.con_transportista && <span className="meta" style={{ display: 'block' }}>{c.envios - c.con_transportista} sin transportista</span>}</td>
                  <td><Parte n={c.venta_en_holded} de={c.envios} /></td>
                  <td><Parte n={c.compra_en_holded} de={c.con_transportista} /></td>
                  <td>{numero(c.penalizaciones, 0)}</td>
                  <td className="amount">{euros(Number(c.venta))}</td>
                  <td className="amount">{euros(Number(c.compra))}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      <h3 style={{ fontSize: 'var(--fs-l)', margin: '0 0 0.5rem' }}>
        {error ? 'No se ha podido comprobar' : filas.length === 0 ? 'Todo cuadra' : graves > 0 ? `${numero(graves, 0)} caso${graves === 1 ? '' : 's'} grave${graves === 1 ? '' : 's'}` : 'Nada grave · algunas cosas por revisar'}
      </h3>
      {error ? null : filas.length === 0 ? (
        <div className="modal-ok-box" id="control-todo-ok">Todos los envíos entregados tienen su pedido de venta y su pedido de compra en Holded, todas las penalizaciones están confirmadas y nada ha cambiado después de pasarlo.</div>
      ) : (
        <>
          <div className="tabs" id="control-tipos">
            <button className={`tab${tipo === '' ? ' active' : ''}`} onClick={() => setTipo('')}>Todos ({numero(tipos.reduce((s, t) => s + t.total, 0), 0)})</button>
            {tipos.map((t) => (
              <button key={t.tipo} data-tipo={t.tipo} className={`tab${tipo === t.tipo ? ' active' : ''}`} onClick={() => setTipo(t.tipo)} style={{ color: t.gravedad === 'grave' ? '#c0262d' : '#b45309' }}>
                {TIPOS_CONTROL[t.tipo] ?? t.tipo} ({numero(t.total, 0)})
              </button>
            ))}
          </div>
          <div className="filters">
            <FiltroFechas valor={ff.valor} desde={ff.desde} hasta={ff.hasta} onCambio={ff.onCambio} etiqueta="Filtrar por fecha de carga" />
          </div>
          {cortado && <div className="pt-aviso info" style={{ marginBottom: '0.6rem' }}><div>Se ven los {numero(lista.length, 0)} más antiguos de {numero(cortado.total, 0)}.</div></div>}
          <div className="table-wrap" tabIndex={0}>
            <table className="data" id="control-lista">
              <thead><tr><th>Envío</th><th>Fecha</th><th>Cliente</th><th>Transportista</th><th>Qué pasa</th><th className="amount">Importe</th><th></th></tr></thead>
              <tbody>
                {lista.length === 0 && <tr><td colSpan={7} style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--gray-500)' }}>Ningún caso en estas fechas.</td></tr>}
                {pg.visibles.map((f) => (
                  <tr key={`${f.tipo}|${f.envio_id}|${f.detalle}`} data-tipo={f.tipo}>
                    <td className="ref" style={{ whiteSpace: 'nowrap' }}><a href={`/panel/envios?ver=${f.envio_id}`} style={{ color: 'var(--purple)', fontWeight: 700 }}>#{f.referencia}</a>
                      {f.estado && <span className="meta" style={{ display: 'block' }}>{f.estado.replace(/_/g, ' ')}</span>}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{fechaTxt(f.fecha)}</td>
                    <td>{f.cliente ?? '—'}</td>
                    <td>{f.transportista ?? '—'}</td>
                    <td style={{ minWidth: 260 }}>
                      <span className={`badge ${f.gravedad === 'grave' ? 'badge-red' : 'badge-orange'}`} style={{ marginRight: '0.4rem' }}>{f.gravedad === 'grave' ? 'Grave' : 'Revisar'}</span>
                      {f.detalle}
                    </td>
                    <td className="amount">{f.importe != null ? euros(Number(f.importe)) : '—'}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {f.tipo === 'cambio_tras_holded' && (
                        <button className="btn-ghost" style={{ minHeight: 30, padding: '0 0.6rem', fontSize: 'var(--fs-s)' }} disabled={trabajando === f.envio_id} onClick={() => resuelto(f)} title="Ya he corregido el pedido en Holded: guardar lo que vale ahora">
                          {trabajando === f.envio_id ? 'Guardando…' : 'Ya corregido en Holded'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <PaginadorLocal p={pg} nombre="casos" nombreUno="caso" />
        </>
      )}
    </div>
  );
}
