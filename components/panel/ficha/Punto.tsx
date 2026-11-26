'use client';

import { nombreTipo } from '../TipoSitio';
import EtiquetaParada from '../EtiquetaParada';
import { paisDe, telBonito } from '@/lib/paises';
import { telefonosSitio } from '@/lib/contactos';
import type { ParadaFicha } from '@/lib/fichaEnvio';

export function Punto({ p, cls, num, label }: { p: ParadaFicha; cls: 'rec' | 'ent'; num: number; label: string }) {
  const s = p.sitio;
  const c = s?.contacto;
  const tels = telefonosSitio(c);
  // Lo propio de ESTE envío en la parada: «MERCANCÍA: …» (el campo «A recoger / A
  // entregar» de Nuevo envío) y el resto como anotaciones. Las líneas que repiten las
  // indicaciones fijas del sitio no se duplican: ya salen en su bloque (los envíos de antes
  // del 2026-11-16 llevaban copiada la «info de mercancía por defecto», hoy unida a ellas).
  const m = p.anotaciones?.match(/(?:^|\n|· )MERCANCÍA:\s*([\s\S]+)$/);
  const fijas = new Set((s?.anotaciones ?? '').split('\n').map((x) => x.trim()).filter(Boolean));
  const merc = m ? m[1].split('\n').map((x) => x.trim()).filter((x) => x && !fijas.has(x)).join('\n') : '';
  const notas = (m ? p.anotaciones!.slice(0, m.index).replace(/\s*·\s*$/, '') : p.anotaciones ?? '').trim();
  return (
    <div className="det-punto">
      <div className="det-punto-head">
        <EtiquetaParada num={num} tipo={cls === 'rec' ? 'carga' : 'descarga'} tipoSitio={s?.tipo} />
        <span className="det-punto-tipo">{nombreTipo(s?.tipo)}</span>
      </div>
      <div className="det-punto-body">
        {p.nombre_empresa && <strong>{s?.url_google_maps ? <a href={s.url_google_maps} target="_blank" rel="noopener" style={{ color: 'var(--purple)' }}>{p.nombre_empresa}</a> : p.nombre_empresa}</strong>}
        {p.nombre_empresa && <br />}
        {[p.direccion, [p.codigo_postal, p.poblacion].filter(Boolean).join(' '), p.provincia && p.provincia !== p.poblacion ? p.provincia : '', paisDe(p.pais_codigo_iso ?? 'ES')].filter(Boolean).join(', ')}
        {(s?.horarios || tels.length > 0) && (
          <div style={{ fontSize: 'var(--fs-m)', color: 'var(--gray-500)', marginTop: 2 }}>
            {s?.horarios && <>Horario: {s.horarios}</>}
            {s?.horarios && tels.length > 0 && ' · '}
            {/* El móvil (WhatsApp) y el fijo del sitio, cada uno con su nombre (usuario, 2026-11-26). */}
            {tels.map((x, i) => <span key={x.que}>{i > 0 && ' · '}{x.que}: <a href={`tel:${x.tel}`} style={{ color: 'var(--purple)', fontWeight: 600 }}>{telBonito(x.tel)}</a></span>)}
            {tels.length > 0 && c?.nombre ? ` (${c.nombre})` : ''}
          </div>
        )}
        {(s?.requiere_cita || s?.tiene_medios_carga === false) && (
          <div style={{ fontSize: 'var(--fs-m)', color: '#b45309', fontWeight: 600, marginTop: 2 }}>{[s?.requiere_cita && 'Con cita previa', s?.tiene_medios_carga === false && 'Sin medios de carga (hace falta plataforma elevadora)'].filter(Boolean).join(' · ')}</div>
        )}
        {p.referencia && <div style={{ fontSize: 'var(--fs-m)', marginTop: 2 }}>Referencia: <strong>{p.referencia}</strong></div>}
        {s?.anotaciones && (
          <div style={{ marginTop: 6, borderLeft: '3px solid var(--purple)', background: '#f4f2fb', borderRadius: 8, padding: '0.4rem 0.6rem', fontSize: 'var(--fs-m)' }}>
            <div style={{ whiteSpace: 'pre-line' }}><strong>Indicaciones del sitio:</strong> {s.anotaciones}</div>
          </div>
        )}
        {merc && <div style={{ fontSize: 'var(--fs-m)', marginTop: 4, whiteSpace: 'pre-line' }}><strong>{label === 'Recogida' ? 'Recogida' : 'Entrega'}:</strong> {merc}</div>}
        {notas && (
          <div style={{ fontSize: 'var(--fs-m)', color: '#b45309', background: '#fef3c7', borderRadius: 8, padding: '0.35rem 0.5rem', marginTop: 4, whiteSpace: 'pre-line' }}>⚠ {notas}</div>
        )}
      </div>
    </div>
  );
}
