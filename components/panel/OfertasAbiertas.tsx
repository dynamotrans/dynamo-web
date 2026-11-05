// Ofertas de carga abiertas para el TRANSPORTISTA (mis_ofertas(): el rango en euros, nunca
// el porcentaje). Cada una lleva a su página de aceptar carga.
import { euros, ventana, pesoTn } from '@/lib/formato';
import { creadoTxt } from '@/lib/envios';

export type Oferta = { id: string; envio_id: string; referencia_gx: string; token: string; canal: string;
  precio_ofertado: number; precio_minimo: number; precio_maximo: number; pronto_pago: boolean; caduca_en: string;
  fecha_carga_desde: string | null; fecha_carga_hasta: string | null; metros_lineales: number | null; toneladas: number | null;
  poblacion_origen: string | null; poblacion_destino: string | null };

const n = (x: number | null) => (x == null ? '' : String(x).replace('.', ','));

export default function OfertasAbiertas({ ofertas }: { ofertas: Oferta[] }) {
  return (
    <section className="section active" style={{ paddingBottom: 0 }}>
      <div className="sec-header"><h2>Cargas que te ofrecemos</h2></div>
      <div className="table-wrap" style={{ marginBottom: '1.2rem' }}>
        <table className="data">
          <thead><tr><th>Carga</th><th>Ruta</th><th>Recogida</th><th>m · Tn</th><th>Precio<br /><span style={{ fontWeight: 600, color: 'var(--gray-500)', fontSize: 'var(--fs-s)' }}>base sin IVA</span></th><th></th></tr></thead>
          <tbody>
            {ofertas.map((o) => (
              <tr key={o.id}>
                <td className="ref"><strong>#{o.referencia_gx}</strong><div className="meta">Vale hasta {creadoTxt(o.caduca_en)}</div></td>
                <td className="route"><strong>{o.poblacion_origen ?? '—'}</strong><span className="arrow">→</span><strong>{o.poblacion_destino ?? '—'}</strong></td>
                <td>{ventana(o.fecha_carga_desde, o.fecha_carga_hasta)}</td>
                <td className="amount">{n(o.metros_lineales)} m · {pesoTn(o.toneladas)}</td>
                <td className="amount"><strong>{euros(o.precio_ofertado)}</strong>
                  {o.precio_maximo !== o.precio_ofertado && <div className="meta">Puedes proponer de {euros(o.precio_minimo)} a {euros(o.precio_maximo)}</div>}
                  {o.pronto_pago && <div className="meta" style={{ color: '#0f6b3a', fontWeight: 700 }}>Con pronto pago</div>}</td>
                <td><a className="btn-primary" href={`/carga/${o.token}`} target="_blank" rel="noopener" style={{ whiteSpace: 'nowrap', textDecoration: 'none' }}>Ver y aceptar</a></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
