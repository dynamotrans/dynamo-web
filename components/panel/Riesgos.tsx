'use client';

// CESCE - Riesgos (solo Dynamo). Por cliente: crédito CESCE, manual de Dynamo, el que
// limita (manual si es distinto de 0; si no, CESCE), riesgo asumido (envíos de los
// últimos días sin cobrar, IVA incluido; lo pagado por adelantado no cuenta) y disponible.
// Por páginas desde la base de datos: buscador y filtro por la URL; los totales de arriba
// los calcula el servidor sobre todos los clientes.
import Link from 'next/link';
import { euros, fecha, numero } from '@/lib/formato';
import Paginador, { BuscadorUrl } from './Paginador';

export type RiesgoFila = {
  id: string; nombre: string; cif: string; cesce: number | null; plazo: number | null; manual: number | null;
  limite: number | null; manda: 'manual' | 'cesce' | 'ninguno'; envios: number; base: number; asumido: number;
  disponible: number | null; ultimo: string | null;
};
export type Totales = { limite: number; asumido: number; pasados: number };
export type ListaRiesgos = { q: string; filtro: string; pagina: number; porPagina: number; total: number };
const uso = (f: RiesgoFila) => (f.limite && f.limite > 0 ? f.asumido / f.limite : f.asumido > 0 ? Infinity : 0);

export default function Riesgos({ filas, dias, error, totales, lista }: {
  filas: RiesgoFila[]; dias: number; error: string | null; totales: Totales; lista: ListaRiesgos;
}) {
  const url = (p: number) => {
    const u = new URLSearchParams();
    if (lista.q) u.set('q', lista.q); if (lista.filtro) u.set('f', lista.filtro);
    if (p > 1) u.set('p', String(p)); if (lista.porPagina !== 50) u.set('n', String(lista.porPagina));
    const s = u.toString(); return `/panel/riesgos${s ? `?${s}` : ''}`;
  };

  return (
    <section className="section active" id="sec-riesgos">
      <div className="sec-header"><h2>CESCE - Riesgos ({numero(lista.total, 0)})</h2></div>
      <p style={{ color: 'var(--gray-500)', fontSize: 'var(--fs-m)', margin: '-0.4rem 0 0.9rem' }}>
        <span style={{ display: 'inline-block', background: 'rgba(51,0,204,0.10)', color: 'var(--purple)', fontWeight: 700, borderRadius: 6, padding: '1px 7px', fontSize: 'var(--fs-s)', marginRight: '0.4rem' }}>SOLO ADMIN</span>
        Crédito de cada cliente frente a lo que tiene pendiente. <strong>Límite</strong>: el manual de Dynamo si es distinto de 0; si es 0 o está vacío, el de CESCE.
        {' '}<strong>Asumido</strong>: envíos de los últimos {dias} días sin cobrar, con IVA (lo pagado por adelantado no cuenta). <strong>Disponible</strong> = límite − asumido. Los importes se cambian en la ficha del cliente.
      </p>
      <div className="stats-row" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.7rem', marginBottom: '0.9rem' }}>
        <div className="table-wrap" style={{ padding: '0.8rem 1rem' }}><div className="meta">Crédito concedido (límites)</div><div style={{ fontWeight: 800, fontSize: 'var(--fs-l)', color: 'var(--navy)' }}>{euros(totales.limite)}</div></div>
        <div className="table-wrap" style={{ padding: '0.8rem 1rem' }}><div className="meta">Riesgo asumido ({dias} días)</div><div style={{ fontWeight: 800, fontSize: 'var(--fs-l)', color: 'var(--navy)' }}>{euros(totales.asumido)}</div></div>
        <div className="table-wrap" style={{ padding: '0.8rem 1rem' }}><div className="meta">Clientes por encima de su límite</div><div style={{ fontWeight: 800, fontSize: 'var(--fs-l)', color: totales.pasados ? '#dc2626' : '#0f6b3a' }}>{totales.pasados}</div></div>
      </div>
      <BuscadorUrl accion="/panel/riesgos" valor={lista.q} placeholder="Buscar cliente o CIF…" campos={<>
        <select name="f" defaultValue={lista.filtro} onChange={(ev) => ev.currentTarget.form?.requestSubmit()} aria-label="Filtrar">
          <option value="">Todos los clientes</option>
          <option value="riesgo">Con riesgo asumido</option>
          <option value="alto">80 % o más del límite usado</option>
          <option value="pasado">Por encima del límite</option>
          <option value="con">Con crédito</option>
          <option value="sin">Sin crédito</option>
        </select>
        {lista.porPagina !== 50 && <input type="hidden" name="n" value={lista.porPagina} />}
      </>} />
      {error && <div className="pt-aviso error">No se han podido cargar los riesgos: {error}</div>}
      <div className="table-wrap">
        <table className="data">
          <thead><tr>
            <th>Cliente</th><th className="amount">CESCE</th><th className="amount">Manual (Álvaro)</th><th className="amount">Límite</th>
            <th className="amount">Envíos {dias} d</th><th className="amount">Asumido (IVA incl.)</th><th className="amount">Disponible</th><th style={{ minWidth: 130 }}>Uso</th><th>Último envío</th>
          </tr></thead>
          <tbody>
            {filas.length === 0 ? (
              <tr><td colSpan={9} style={{ textAlign: 'center', padding: '2rem', color: 'var(--gray-500)' }}>Sin clientes que coincidan</td></tr>
            ) : filas.map((x) => {
              const u = uso(x), pct = Number.isFinite(u) ? Math.round(u * 100) : null;
              const color = !Number.isFinite(u) || u > 1 ? '#dc2626' : u >= 0.8 ? '#d97706' : '#16a34a';
              return (
                <tr key={x.id}>
                  <td><Link href={`/panel/clientes?ver=${x.id}`} style={{ color: 'var(--navy)', fontWeight: 700 }}>{x.nombre}</Link><div className="meta">{x.cif}</div></td>
                  <td className="amount" style={x.manda === 'cesce' ? { fontWeight: 800 } : { color: 'var(--gray-500)' }}>{x.cesce != null ? euros(x.cesce) : '—'}{x.plazo ? <div className="meta">{x.plazo} días</div> : null}</td>
                  <td className="amount" style={x.manda === 'manual' ? { fontWeight: 800 } : { color: 'var(--gray-500)' }}>{x.manual ? euros(x.manual) : '—'}</td>
                  <td className="amount"><strong>{x.limite != null ? euros(x.limite) : 'Sin crédito'}</strong><div className="meta">{x.manda === 'manual' ? 'manda el manual' : x.manda === 'cesce' ? 'manda CESCE' : 'previo pago'}</div></td>
                  <td className="amount">{x.envios || '—'}</td>
                  <td className="amount">{x.asumido ? euros(x.asumido) : '—'}{x.asumido ? <div className="meta">{euros(x.base)} sin IVA</div> : null}</td>
                  <td className="amount" style={{ fontWeight: 800, color: x.disponible != null && x.disponible < 0 ? '#dc2626' : 'var(--navy)' }}>{x.disponible != null ? euros(x.disponible) : '—'}</td>
                  <td>
                    {x.limite && x.limite > 0 ? <>
                      <div style={{ height: 7, borderRadius: 99, background: 'var(--gray-200)', overflow: 'hidden' }}><div style={{ width: `${Math.min(100, pct ?? 100)}%`, height: '100%', background: color }} /></div>
                      <div className="meta" style={{ color, fontWeight: 700 }}>{pct} % usado</div>
                    </> : x.asumido > 0 ? <span className="meta" style={{ color: '#dc2626', fontWeight: 700 }}>Riesgo sin crédito</span> : <span className="meta">—</span>}
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>{x.ultimo ? fecha(x.ultimo) : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Paginador total={lista.total} pagina={lista.pagina} porPagina={lista.porPagina} url={url} nombre="clientes" nombreUno="cliente" />
    </section>
  );
}
