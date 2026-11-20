'use client';

// Control de facturación (solo Dynamo) — usuario, 2026-11-20: «si han sido 160 enviados y no
// los estoy facturando y cobrando a clientes… tenemos que tener ciertos controles».
// Arriba, el cuadre por meses (entregados frente a pedidos pasados a Holded y facturados);
// debajo, cada envío que se puede quedar sin cobrar o con el pedido de Holded mal, con el
// enlace a su ficha. Lo grave va en rojo; lo que hay que revisar, en naranja.
import { useMemo, useState } from 'react';
import { useRefrescar } from '@/lib/useRefrescar';
import { controlFacturacionResuelto } from '@/app/panel/(app)/exportaciones/acciones';
import { euros, numero } from '@/lib/formato';
import PaginadorLocal, { usePaginas } from './PaginadorLocal';

export type FilaControl = {
  envio_id: string; referencia: string | null; cliente: string | null; transportista: string | null; estado: string | null;
  tipo: string; gravedad: string; detalle: string; importe: number | null; fecha: string | null; total_tipo: number;
};
export type FilaCuadre = {
  mes: string; entregados: number; venta_en_holded: number; compra_en_holded: number; venta_facturados: number;
  compra_facturados: number; venta: number; compra: number; cancelados_con_cobro: number;
};

export const TIPOS_CONTROL: Record<string, string> = {
  venta_sin_precio: 'Entregados sin precio para el cliente',
  sin_transportista: 'Entregados sin transportista',
  compra_sin_precio: 'Entregados sin precio del transportista',
  compra_sin_venta: 'Compra pasada a Holded sin su venta',
  compra_facturada_venta_no: 'Factura del transportista recibida y cliente sin facturar',
  cambio_tras_holded: 'Cambiados después de pasarlos a Holded',
  venta_sin_holded: 'Entregados sin pasar a Holded como venta',
  compra_sin_holded: 'Entregados sin pasar a Holded como compra',
  sin_facturar: 'En Holded y sin facturar al cliente',
  margen_negativo: 'Con margen negativo',
  penalizacion_sin_confirmar: 'Penalizaciones sin confirmar',
};
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const mesTxt = (m: string) => `${MESES[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
const fechaTxt = (d: string | null) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : '—');

// Celda «x de y»: en rojo si falta alguno.
function Parte({ n, de }: { n: number; de: number }) {
  const falta = de - n;
  return <span style={{ fontWeight: 700, color: falta > 0 ? '#c0262d' : 'var(--green-dark, #15803d)', whiteSpace: 'nowrap' }}>{numero(n, 0)}{falta > 0 && <span style={{ fontWeight: 600, fontSize: 'var(--fs-s)' }}> · faltan {numero(falta, 0)}</span>}</span>;
}

export default function ControlFacturacion({ filas, cuadre, error }: { filas: FilaControl[]; cuadre: FilaCuadre[]; error: string | null }) {
  const refrescar = useRefrescar();
  const [tipo, setTipo] = useState('');
  const [trabajando, setTrabajando] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ ok: boolean; txt: string } | null>(null);

  // Un resumen por tipo de problema (el total viene de la base de datos aunque la lista se corte).
  const tipos = useMemo(() => {
    const m = new Map<string, { tipo: string; gravedad: string; total: number }>();
    for (const f of filas) if (!m.has(f.tipo)) m.set(f.tipo, { tipo: f.tipo, gravedad: f.gravedad, total: f.total_tipo });
    return [...m.values()].sort((a, b) => (a.gravedad === b.gravedad ? b.total - a.total : a.gravedad === 'grave' ? -1 : 1));
  }, [filas]);
  const graves = tipos.filter((t) => t.gravedad === 'grave').reduce((s, t) => s + t.total, 0);
  const lista = useMemo(() => (tipo ? filas.filter((f) => f.tipo === tipo) : filas), [filas, tipo]);
  const pg = usePaginas(lista, tipo, 25);
  const cortado = tipos.find((t) => t.tipo === tipo && t.total > lista.length);

  async function resuelto(f: FilaControl) {
    setTrabajando(f.envio_id); setAviso(null);
    const r = await controlFacturacionResuelto(f.envio_id);
    setTrabajando(null);
    setAviso(r.ok ? { ok: true, txt: `#${f.referencia}: anotado como corregido en Holded.` } : { ok: false, txt: r.error });
    if (r.ok) refrescar();
  }

  return (
    <div id="control-facturacion">
      <p style={{ margin: '0 0 1rem', fontSize: 'var(--fs-l)', color: 'var(--gray-500)', maxWidth: 820, lineHeight: 1.5 }}>
        Comprueba que <strong>cada envío entregado</strong> tiene su pedido de venta (al cliente) y su pedido de compra (al transportista), que están pasados a Holded con el mismo importe
        y que se han facturado. Así no se queda ningún envío sin cobrar. Solo envíos de Dynamo: los del transportista propio del cliente no se facturan.
      </p>
      {error && <div className="pt-aviso error" style={{ marginBottom: '0.8rem' }}><div>No se ha podido leer el control: {error}</div></div>}
      {aviso && <div className={`pt-aviso ${aviso.ok ? 'info' : 'error'}`} role="status" style={{ marginBottom: '0.8rem' }}><div>{aviso.txt}</div></div>}

      <h3 style={{ fontSize: 'var(--fs-l)', margin: '0 0 0.5rem' }}>Cuadre por meses</h3>
      <div className="table-wrap" tabIndex={0} style={{ marginBottom: '1.4rem' }}>
        <table className="data" id="cuadre-meses">
          <thead><tr><th>Mes (fecha de carga)</th><th>Entregados</th><th>Venta en Holded</th><th>Venta facturada</th><th>Compra en Holded</th><th>Factura transportista</th><th className="amount">Venta</th><th className="amount">Compra</th><th className="amount">Margen</th></tr></thead>
          <tbody>
            {cuadre.length === 0 ? <tr><td colSpan={9} style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--gray-500)' }}>Aún no hay envíos entregados.</td></tr>
              : cuadre.map((c) => (
                <tr key={c.mes}>
                  <td style={{ whiteSpace: 'nowrap', fontWeight: 700, textTransform: 'capitalize' }}>{mesTxt(c.mes)}</td>
                  <td><strong>{numero(c.entregados, 0)}</strong>{c.cancelados_con_cobro > 0 && <span className="meta" style={{ display: 'block' }}>+ {c.cancelados_con_cobro} cancelado{c.cancelados_con_cobro === 1 ? '' : 's'} con cobro</span>}</td>
                  <td><Parte n={c.venta_en_holded} de={c.entregados} /></td>
                  <td><Parte n={c.venta_facturados} de={c.entregados} /></td>
                  <td><Parte n={c.compra_en_holded} de={c.entregados} /></td>
                  <td><Parte n={c.compra_facturados} de={c.entregados} /></td>
                  <td className="amount">{euros(Number(c.venta))}</td>
                  <td className="amount">{euros(Number(c.compra))}</td>
                  <td className="amount" style={{ color: Number(c.venta) - Number(c.compra) < 0 ? '#c0262d' : undefined }}>{euros(Number(c.venta) - Number(c.compra))}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      <h3 style={{ fontSize: 'var(--fs-l)', margin: '0 0 0.5rem' }}>
        {error ? 'No se ha podido comprobar' : filas.length === 0 ? 'Todo cuadra' : graves > 0 ? `${numero(graves, 0)} caso${graves === 1 ? '' : 's'} grave${graves === 1 ? '' : 's'}` : 'Nada grave · algunas cosas por revisar'}
      </h3>
      {error ? null : filas.length === 0 ? (
        <div className="modal-ok-box" id="control-todo-ok">Ningún envío entregado se ha quedado sin precio, sin pedido de venta, sin pasar a Holded o sin facturar. Ningún pedido ha cambiado después de pasarlo a Holded.</div>
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
          {cortado && <div className="pt-aviso info" style={{ marginBottom: '0.6rem' }}><div>Se ven los {numero(lista.length, 0)} más antiguos de {numero(cortado.total, 0)}.</div></div>}
          <div className="table-wrap" tabIndex={0}>
            <table className="data" id="control-lista">
              <thead><tr><th>Envío</th><th>Fecha</th><th>Cliente</th><th>Transportista</th><th>Qué pasa</th><th className="amount">Importe</th><th></th></tr></thead>
              <tbody>
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
