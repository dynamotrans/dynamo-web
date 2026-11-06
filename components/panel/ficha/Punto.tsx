'use client';

import { IconoTipo, nombreTipo } from '../TipoSitio';
import { paisDe, telBonito } from '@/lib/paises';
import type { ParadaFicha } from '@/lib/fichaEnvio';

export function Punto({ p, cls, num, label }: { p: ParadaFicha; cls: 'rec' | 'ent'; num: number; label: string }) {
  const s = p.sitio;
  const c = s?.contacto;
  return (
    <div className="det-punto">
      <div className="det-punto-head">
        <span className={`ptar-route-num ${cls}`}>{num}</span>
        <span className="det-punto-ico"><IconoTipo tipo={s?.tipo ?? 'almacen_nave'} /></span>
        <span className="det-punto-label">{label}</span>
        <span className="det-punto-tipo">{nombreTipo(s?.tipo)}</span>
      </div>
      <div className="det-punto-body">
        {p.nombre_empresa && <strong>{s?.url_google_maps ? <a href={s.url_google_maps} target="_blank" rel="noopener" style={{ color: 'var(--purple)' }}>{p.nombre_empresa}</a> : p.nombre_empresa}</strong>}
        {p.nombre_empresa && <br />}
        {[p.direccion, [p.codigo_postal, p.poblacion].filter(Boolean).join(' '), p.provincia && p.provincia !== p.poblacion ? p.provincia : '', paisDe(p.pais_codigo_iso ?? 'ES')].filter(Boolean).join(', ')}
        {(s?.horarios || c?.telefono) && (
          <div style={{ fontSize: 'var(--fs-m)', color: 'var(--gray-500)', marginTop: 2 }}>
            {s?.horarios && <>Horario: {s.horarios}</>}
            {s?.horarios && c?.telefono && ' · '}
            {c?.telefono && <>Tfno: <a href={`tel:${c.telefono}`} style={{ color: 'var(--purple)', fontWeight: 600 }}>{telBonito(c.telefono)}</a>{c.nombre ? ` (${c.nombre})` : ''}</>}
          </div>
        )}
        {(s?.requiere_cita || s?.tiene_medios_carga === false) && (
          <div style={{ fontSize: 'var(--fs-m)', color: '#b45309', fontWeight: 600, marginTop: 2 }}>{[s?.requiere_cita && 'Con cita previa', s?.tiene_medios_carga === false && 'Sin medios de carga (hace falta plataforma elevadora)'].filter(Boolean).join(' · ')}</div>
        )}
        {p.referencia && <div style={{ fontSize: 'var(--fs-m)', marginTop: 2 }}>Referencia: <strong>{p.referencia}</strong></div>}
        {[s?.anotaciones, p.anotaciones].filter(Boolean).map((n, i) => (
          <div key={i} style={{ fontSize: 'var(--fs-m)', color: '#b45309', background: '#fef3c7', borderRadius: 8, padding: '0.35rem 0.5rem', marginTop: 4 }}>⚠ {n}</div>
        ))}
      </div>
    </div>
  );
}
