'use client';

// Administración → Facturas, vista de Dynamo (usuario, 2026-11-21). Una sola lista con las
// facturas EMITIDAS (ingresos) y las RECIBIDAS (gastos), filtrable por tipo y por periodo.
// Es SOLO LECTURA: las facturas se crean y se modifican en el programa de facturación y llegan
// aquí por su API (aún sin conectar). Las recibidas de gastos financieros (confirming, líneas
// de crédito, préstamos, intereses y comisiones bancarias…) no se traen.
import { useMemo, useState } from 'react';
import { euros, fecha, textoBusqueda } from '@/lib/formato';
import PaginadorLocal, { usePaginas } from './PaginadorLocal';
import FiltroFechas, { useFiltroFechas } from './FiltroFechas';
import { enRango } from '@/lib/filtroFechas';

export type FacturaFila = {
  id: string;
  tipo: 'emitida' | 'recibida';
  fecha: string;              // aaaa-mm-dd (fecha de la factura)
  numero: string | null;
  concepto: string | null;
  empresa: string | null;
  cif: string | null;
  base: number;
  iva: number;
  retencion: number;          // importe retenido (IRPF), en positivo; 0 si no hay
  total: number;
  estado: 'pagada' | 'pendiente' | 'vencida' | null;
  vence: string | null;       // aaaa-mm-dd
  pdf_url?: string | null;
  gx?: string | null;         // el envío al que corresponde, si el concepto lo dice (GX…)
};

type Tipo = 'todas' | 'emitida' | 'recibida';

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Tipo: ingreso en azul (fondo azul claro, letra azul oscuro); gasto en rojo (fondo rojo claro, letra roja).
function TagTipo({ tipo }: { tipo: FacturaFila['tipo'] }) {
  return tipo === 'emitida'
    ? <span className="badge fac-ingreso" style={{ background: '#dbeafe', color: '#1e3a8a' }}>Ingreso</span>
    : <span className="badge fac-gasto" style={{ background: '#fee2e2', color: '#b91c1c' }}>Gasto</span>;
}
function TagEstado({ f }: { f: FacturaFila }) {
  if (f.estado === 'pagada') return <span className="badge badge-green">Pagada</span>;
  if (f.estado === 'vencida' || f.estado === 'pendiente') return <>
    <span className={`badge ${f.estado === 'vencida' ? 'badge-red' : 'badge-orange'}`}>{f.estado === 'vencida' ? 'Vencida' : 'Pendiente'}</span>
    {f.vence && <span className="meta" style={{ display: 'block', marginTop: 2 }}>vence {fecha(f.vence)}</span>}
  </>;
  return <span className="meta">—</span>;
}

export default function FacturasDynamo({ facturas, conectado }: { facturas: FacturaFila[]; conectado: boolean }) {
  const [tipo, setTipo] = useState<Tipo>('todas');
  const ff = useFiltroFechas();
  const [q, setQ] = useState('');

  const lista = useMemo(() => {
    const w = norm(textoBusqueda(q)).split(/\s+/).filter(Boolean);
    return facturas
      .filter((f) => (tipo === 'todas' || f.tipo === tipo) && enRango(f.fecha, ff.rango)
        && w.every((x) => norm([f.numero, f.gx, f.concepto, f.empresa, f.cif, euros(f.total)].filter(Boolean).join(' ')).includes(x)))
      .sort((a, b) => (a.fecha === b.fecha ? 0 : a.fecha < b.fecha ? 1 : -1));
  }, [facturas, tipo, ff.rango, q]);
  const pg = usePaginas(lista, `${tipo}|${ff.clave}|${q}`, 25);

  const suma = (t: FacturaFila['tipo']) => lista.filter((f) => f.tipo === t).reduce((s, f) => s + Number(f.base), 0);
  const ingresos = suma('emitida'), gastos = suma('recibida');

  return (
    <div id="facturas-dynamo">
      <div className="filters">
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nº de factura, concepto, empresa, CIF, importe…" />
        <select className="filter-estado" id="fac-tipo" style={{ minWidth: 230 }} value={tipo} onChange={(e) => setTipo(e.target.value as Tipo)} aria-label="Tipo de factura">
          <option value="todas">Todas (ingresos y gastos)</option>
          <option value="emitida">Ingresos · emitidas</option>
          <option value="recibida">Gastos · recibidas</option>
        </select>
        <FiltroFechas id="fac-periodo" valor={ff.valor} desde={ff.desde} hasta={ff.hasta} onCambio={ff.onCambio} etiqueta="Filtrar por fecha de la factura" />
      </div>

      {!conectado && (
        <div className="pt-aviso info" id="facturas-sin-conectar" style={{ marginBottom: '0.8rem' }}><div>
          <strong>Las facturas llegarán aquí al conectar la plataforma con la facturación:</strong> las emitidas (ingresos) y todas las recibidas (gastos) <strong>menos las de gastos financieros</strong> (confirming, líneas y pólizas de crédito, préstamos, intereses y comisiones bancarias, descuento de efectos y factoring), que no se traen. Mientras tanto, se emiten y consultan como siempre.
        </div></div>
      )}
      <p className="meta" style={{ margin: '0 0 0.6rem' }}>Solo lectura: las facturas se crean, se modifican y se cobran en el programa de facturación; aquí se consultan.</p>

      {lista.length > 0 && (
        <div className="meta" id="facturas-totales" style={{ margin: '0 0 0.6rem', display: 'flex', gap: '1.2rem', flexWrap: 'wrap' }}>
          {tipo !== 'recibida' && <span>Ingresos (base): <strong style={{ color: '#1e3a8a' }}>{euros(ingresos)}</strong></span>}
          {tipo !== 'emitida' && <span>Gastos (base): <strong style={{ color: '#b91c1c' }}>{euros(gastos)}</strong></span>}
          {tipo === 'todas' && <span>Diferencia: <strong>{euros(ingresos - gastos)}</strong></span>}
        </div>
      )}

      <div className="table-wrap" tabIndex={0}>
        <table className="data" id="facturas-lista">
          <thead><tr>
            <th>Fecha</th><th>Tipo</th><th>Concepto</th><th>Empresa</th><th>CIF</th>
            <th className="amount">Base</th><th className="amount">IVA</th><th className="amount">Retención</th><th className="amount">Total</th><th>Pago</th>
          </tr></thead>
          <tbody>
            {lista.length === 0 ? (
              <tr><td colSpan={10} style={{ textAlign: 'center', padding: '2rem', color: 'var(--gray-500)' }}>
                {facturas.length ? 'No hay facturas con estos filtros.' : 'Aún no hay facturas en la plataforma.'}
              </td></tr>
            ) : pg.visibles.map((f) => (
              <tr key={f.id} data-tipo={f.tipo} onClick={f.pdf_url ? () => { const w = window.open(f.pdf_url!, '_blank'); if (!w) location.href = f.pdf_url!; } : undefined} style={f.pdf_url ? { cursor: 'pointer' } : undefined}>
                <td style={{ whiteSpace: 'nowrap' }}>{fecha(f.fecha)}</td>
                <td><TagTipo tipo={f.tipo} /></td>
                {/* El concepto puede ser larguísimo (toda la ruta y la mercancía): dos líneas y el
                    resto, al pasar el ratón o en el PDF (usuario, 2026-11-25: «habrá que ajustar cosas»). */}
                <td style={{ minWidth: 220, maxWidth: 380 }}>
                  {f.numero && <strong style={{ display: 'block', color: 'var(--navy)' }}>{f.numero}{f.gx ? <span className="meta" style={{ fontWeight: 600 }}> · {f.gx}</span> : null}</strong>}
                  <span className="fac-concepto" title={f.concepto ?? undefined}>{f.concepto ?? '—'}</span>
                </td>
                <td>{f.empresa ?? '—'}</td>
                <td style={{ whiteSpace: 'nowrap' }}>{f.cif ?? '—'}</td>
                <td className="amount" style={{ whiteSpace: 'nowrap' }}>{euros(f.base)}</td>
                <td className="amount" style={{ whiteSpace: 'nowrap' }}>{euros(f.iva)}</td>
                <td className="amount" style={{ whiteSpace: 'nowrap' }}>{f.retencion ? `−${euros(f.retencion)}` : '—'}</td>
                <td className="amount" style={{ whiteSpace: 'nowrap' }}><strong>{euros(f.total)}</strong></td>
                <td style={{ whiteSpace: 'nowrap' }}><TagEstado f={f} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <PaginadorLocal p={pg} nombre="facturas" nombreUno="factura" />
    </div>
  );
}
