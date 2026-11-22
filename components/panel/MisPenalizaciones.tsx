'use client';
// Penalizaciones del CLIENTE (etapa B): solo lectura y solo su importe (mis_penalizaciones();
// el del transportista nunca). Diseño de la tabla de #sec-penalizaciones del mockup.
import Link from 'next/link';
import { euros, fechaHora, textoBusqueda } from '@/lib/formato';
import PaginadorLocal, { usePaginas } from './PaginadorLocal';
import { CONTACTO } from '@/lib/atencion';
import FiltroFechas, { useFiltroFechas } from './FiltroFechas';
import { enRango, diaMadridDe } from '@/lib/filtroFechas';

export type MiPenalizacion = { id: string; codigo: string; envio_id: string; referencia_gx: string; tipo: string;
  descripcion: string | null; importe_cliente: number | null; estado: string; creado_en: string };

const ESTADO: Record<string, [string, string]> = { pendiente_confirmar: ['En revisión', 'prog'], confirmada: ['Confirmada', 'red'] };
// Para el transportista el importe es A SU FAVOR (usuario, 2026-11-22): «Confirmada» en verde.
const ESTADO_T: Record<string, [string, string]> = { pendiente_confirmar: ['En revisión', 'prog'], confirmada: ['Confirmada', 'green'] };

// esTransportista: las del transportista, con SU importe (mis_penalizaciones_transportista()).
export default function MisPenalizaciones({ filas: todas, error, esTransportista = false, q = '' }: { filas: MiPenalizacion[]; error: string | null; esTransportista?: boolean; q?: string }) {
  // ?q=…: se llega desde el buscador global con una penalización buscada; se enseña esa
  // (por código, envío, tipo o descripción) y un enlace para volver a verlas todas.
  const norm = (t: string) => t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const ws = norm(textoBusqueda(q)).split(/\s+/).filter(Boolean);
  const ff = useFiltroFechas();
  const filas = todas.filter((p) => enRango(diaMadridDe(p.creado_en), ff.rango)
    && (!ws.length || (() => { const b = norm([p.codigo, p.referencia_gx, p.tipo, p.descripcion].filter(Boolean).join(' ')); return ws.every((w) => b.includes(w)); })()));
  const pg = usePaginas(filas, `${q}|${ff.clave}`);
  return (
    <section className="section active" id="sec-penalizaciones">
      <div className="sec-header"><h2>Penalizaciones</h2></div>
      <p style={{ margin: '-0.4rem 0 1rem', fontSize: 'var(--fs-l)', color: 'var(--gray-500)', maxWidth: 820, lineHeight: 1.5 }}>
        {esTransportista
          ? <>Importes a tu favor en un envío: lo que te pagamos de más por una paralización, una parada que no estaba prevista o una cancelación. Se suman a lo que te pagamos por ese envío. Si echas en falta alguno, llámanos al <a href={CONTACTO.telHref} style={{ color: 'var(--purple)', fontWeight: 700 }}>{CONTACTO.telefono}</a> y la revisamos.</>
          : <>Costes que se aplican a un envío por una cancelación fuera de plazo, una paralización del camión o una parada que no estaba prevista.
            Si no estás conforme con alguna, abre una <Link href="/panel/incidencias?abrir=1" style={{ color: 'var(--purple)', fontWeight: 700 }}>incidencia</Link> y la revisamos.</>}
      </p>
      {todas.length > 0 && <div className="filters">
        <FiltroFechas valor={ff.valor} desde={ff.desde} hasta={ff.hasta} onCambio={ff.onCambio} etiqueta="Filtrar por fecha de la penalización" />
      </div>}
      {error && <div className="pt-aviso error">No se han podido cargar las penalizaciones: {error}</div>}
      {ws.length > 0 && <div className="pt-aviso info" style={{ marginBottom: '0.8rem' }}><div>Buscando «{q.trim()}»: {filas.length} de {todas.length}. <Link href="/panel/penalizaciones" style={{ color: 'var(--purple)', fontWeight: 700 }}>Ver todas</Link></div></div>}
      <div className="table-wrap" tabIndex={0}>
        <table className="data">
          <thead><tr><th>Penalización</th><th>Envío</th><th>Tipo</th><th>Importe<br /><span style={{ fontWeight: 600, color: 'var(--gray-500)', fontSize: 'var(--fs-s)' }}>base sin IVA</span></th><th>Fecha</th></tr></thead>
          <tbody>
            {filas.length === 0 ? (
              <tr><td colSpan={5} style={{ textAlign: 'center', padding: '2rem', color: 'var(--gray-500)' }}>{ws.length ? 'Ninguna penalización casa con la búsqueda.' : todas.length ? 'No hay penalizaciones en estas fechas.' : 'No tienes ninguna penalización.'}</td></tr>
            ) : pg.visibles.map((p) => {
              const est = (esTransportista ? ESTADO_T : ESTADO)[p.estado] ?? [p.estado, 'prog'];
              return (
                <tr key={p.id}>
                  <td className="ref"><strong>{p.codigo}</strong>{p.descripcion && <div className="meta">{p.descripcion}</div>}</td>
                  <td><Link href={`/panel/envios?f=todas&ver=${p.envio_id}`} style={{ color: 'var(--purple)', fontWeight: 700 }}>#{p.referencia_gx}</Link></td>
                  <td><span className="badge badge-prog">{p.tipo}</span> <span className={`badge badge-${est[1]}`}>{est[0]}</span></td>
                  <td className="amount"><strong>{p.importe_cliente != null ? euros(p.importe_cliente) : '—'}</strong></td>
                  <td>{fechaHora(p.creado_en)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <PaginadorLocal p={pg} nombre="penalizaciones" nombreUno="penalización" />
    </section>
  );
}
