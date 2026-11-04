// PROTOCOLO DE SINIESTRO, visible para quien está con la mercancía (transportista, en su
// viaje y en la página de la carga; el cliente, en su envío): qué hacer si hay daños,
// roturas o faltan bultos, ANTES de descargar (o de terminar la carga).
import { CONTACTO } from '@/lib/atencion';

export default function AvisoSiniestro({ incidenciaHref, quien = 'transportista' }: { incidenciaHref?: string | null; quien?: 'transportista' | 'cliente' }) {
  return (
    <div style={{ border: '1.5px solid #fca5a5', background: '#fef2f2', borderRadius: 12, padding: '0.8rem 0.95rem', margin: '0 0 0.8rem', fontSize: 'var(--fs-m, 0.85rem)', color: '#7f1d1d', lineHeight: 1.5 }}>
      <div style={{ fontWeight: 800, marginBottom: '0.25rem' }}>¿Daños, roturas o falta mercancía? {quien === 'transportista' ? 'NO descargues todavía.' : 'Avísanos antes de que se vaya el camión.'}</div>
      <ol style={{ margin: '0 0 0.5rem', paddingLeft: '1.1rem' }}>
        <li><strong>Avisa a Dynamo ahora</strong>, en ese mismo momento ({CONTACTO.telefono}, 24 h).</li>
        <li><strong>Haz fotos</strong> de la mercancía, los embalajes y la caja del camión.</li>
        <li><strong>Anota las reservas en el CMR</strong> o el albarán (qué falta o qué está dañado) y que firmen las dos partes.</li>
      </ol>
      <div style={{ fontSize: '0.92em', marginBottom: '0.5rem' }}>Sin reservas escritas en el momento no se puede reclamar al seguro.</div>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <a href={CONTACTO.telHref} style={{ background: '#dc2626', color: '#fff', fontWeight: 800, borderRadius: 8, padding: '0.45rem 0.9rem', textDecoration: 'none' }}>Llamar a Dynamo</a>
        <a href={`${CONTACTO.waHref}?text=${encodeURIComponent('SINIESTRO: hay daños o faltantes en la mercancía. ')}`} target="_blank" rel="noopener" style={{ background: '#16a34a', color: '#fff', fontWeight: 800, borderRadius: 8, padding: '0.45rem 0.9rem', textDecoration: 'none' }}>WhatsApp</a>
        {incidenciaHref && <a href={incidenciaHref} style={{ background: '#fff', color: '#b91c1c', border: '1.5px solid #fca5a5', fontWeight: 800, borderRadius: 8, padding: '0.45rem 0.9rem', textDecoration: 'none' }}>Avisar con fotos (incidencia urgente)</a>}
      </div>
    </div>
  );
}
