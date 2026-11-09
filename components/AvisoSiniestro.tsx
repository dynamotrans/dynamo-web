// Aviso de dudas e incidencias (protocolo de siniestro en tono suave — usuario 2026-11-09):
// antes era una caja roja de alarma; ahora invita a contactar («¿Dudas o alguna
// incidencia?») y resume qué hacer si hay daños o faltantes, con botones de Llamar,
// WhatsApp y Email. Visible para quien está con la mercancía (transportista, en su viaje
// y en la página de la carga; el cliente, en su envío).
import { CONTACTO } from '@/lib/atencion';

export default function AvisoSiniestro({ incidenciaHref, quien = 'transportista' }: { incidenciaHref?: string | null; quien?: 'transportista' | 'cliente' }) {
  const btn = { fontWeight: 800, borderRadius: 8, padding: '0.45rem 0.9rem', textDecoration: 'none' } as const;
  return (
    <div style={{ border: '1.5px solid rgba(51,0,204,0.22)', background: 'rgba(51,0,204,0.04)', borderRadius: 12, padding: '0.8rem 0.95rem', margin: '0 0 0.8rem', fontSize: 'var(--fs-m, 0.85rem)', color: 'var(--gray-700, #3f4759)', lineHeight: 1.5 }}>
      <div style={{ fontWeight: 800, marginBottom: '0.25rem', color: 'var(--navy, #0a0230)' }}>¿Dudas o alguna incidencia?</div>
      <p style={{ margin: '0 0 0.45rem' }}>Estamos disponibles 24 h: llámanos o escríbenos y lo resolvemos al momento.</p>
      <p style={{ margin: '0 0 0.55rem' }}>Si hay <strong>daños, roturas o faltan bultos</strong>, avísanos {quien === 'transportista' ? 'antes de descargar' : 'antes de que se vaya el camión'}, haz <strong>fotos</strong> y anota las <strong>reservas en el CMR</strong> o el albarán, firmadas por las dos partes: son las que permiten reclamar al seguro.</p>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <a href={CONTACTO.telHref} style={{ ...btn, background: 'var(--purple, #3300cc)', color: '#fff' }}>Llamar</a>
        <a href={`${CONTACTO.waHref}?text=${encodeURIComponent('Hola, os escribo por un envío: ')}`} target="_blank" rel="noopener" style={{ ...btn, background: '#16a34a', color: '#fff' }}>WhatsApp</a>
        <a href={`mailto:${CONTACTO.email}`} style={{ ...btn, background: '#fff', color: 'var(--purple, #3300cc)', border: '1.5px solid rgba(51,0,204,0.35)' }}>Email</a>
        {incidenciaHref && <a href={incidenciaHref} style={{ ...btn, background: '#fff', color: '#b45309', border: '1.5px solid rgba(217,119,6,0.45)' }}>Avisar con fotos (incidencia)</a>}
      </div>
    </div>
  );
}
