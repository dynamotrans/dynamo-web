// Penalizaciones del CLIENTE (etapa B): solo lectura y solo su importe (mis_penalizaciones();
// el del transportista nunca). Diseño de la tabla de #sec-penalizaciones del mockup.
import Link from 'next/link';
import { euros, fechaHora } from '@/lib/formato';

export type MiPenalizacion = { id: string; codigo: string; envio_id: string; referencia_gx: string; tipo: string;
  descripcion: string | null; importe_cliente: number | null; estado: string; creado_en: string };

const ESTADO: Record<string, [string, string]> = { pendiente_confirmar: ['En revisión', 'prog'], confirmada: ['Confirmada', 'red'] };

// esTransportista: las del transportista, con SU importe (mis_penalizaciones_transportista()).
export default function MisPenalizaciones({ filas, error, esTransportista = false }: { filas: MiPenalizacion[]; error: string | null; esTransportista?: boolean }) {
  return (
    <section className="section active" id="sec-penalizaciones">
      <div className="sec-header"><h2>Penalizaciones</h2></div>
      <p style={{ margin: '-0.4rem 0 1rem', fontSize: 'var(--fs-l)', color: 'var(--gray-500)', maxWidth: 820, lineHeight: 1.5 }}>
        {esTransportista
          ? <>Lo que se te descuenta o se te abona en un viaje (un retraso, una paralización, una parada de más…). Si no estás conforme con alguna, llámanos al <a href="tel:+34955225945" style={{ color: 'var(--purple)', fontWeight: 700 }}>+34 955 225 945</a> y la revisamos.</>
          : <>Costes que se aplican a un envío por una cancelación fuera de plazo, una paralización del camión o una parada que no estaba prevista.
            Si no estás conforme con alguna, abre una <Link href="/panel/incidencias?abrir=1" style={{ color: 'var(--purple)', fontWeight: 700 }}>incidencia</Link> y la revisamos.</>}
      </p>
      {error && <div className="pt-aviso error">No se han podido cargar las penalizaciones: {error}</div>}
      <div className="table-wrap">
        <table className="data">
          <thead><tr><th>Penalización</th><th>Envío</th><th>Tipo</th><th>Importe<br /><span style={{ fontWeight: 600, color: 'var(--gray-500)', fontSize: 'var(--fs-s)' }}>base sin IVA</span></th><th>Fecha</th></tr></thead>
          <tbody>
            {filas.length === 0 ? (
              <tr><td colSpan={5} style={{ textAlign: 'center', padding: '2rem', color: 'var(--gray-500)' }}>No tienes ninguna penalización.</td></tr>
            ) : filas.map((p) => {
              const est = ESTADO[p.estado] ?? [p.estado, 'prog'];
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
    </section>
  );
}
