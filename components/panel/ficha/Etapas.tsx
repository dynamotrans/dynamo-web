// Seguimiento del envío (usuario, 2026-11-06): todas sus etapas en orden, con la hora real
// (las hechas) o la prevista (las que faltan). El estado avanza solo con estos plazos; Dynamo
// lo corrige a mano y desde ahí sigue (ver migración seguimiento_automatico). Lo ven Dynamo,
// el cliente y el transportista, con los datos de etapas_envio().
import { fechaHora } from '@/lib/formato';
import { etiquetaEtapa, ordinal, type Etapa } from '@/lib/estados';
export type { Etapa };

/** Nombre de la etapa: «Yendo a la carga · Sevilla», «En ruta a 2.ª parada · Madrid»… */
export function nombreEtapa(x: Pick<Etapa, 'paso' | 'estado' | 'parada' | 'tipo_parada' | 'poblacion'>): string {
  if (x.paso === 0) return 'Programado';
  if (x.estado === 'entregado') return 'Entregado';
  const base = x.estado === 'hacia_la_carga' ? `Yendo a la carga (${ordinal(1)} parada)` : etiquetaEtapa(x.estado, x.parada, x.tipo_parada).label;
  return x.poblacion ? `${base} · ${x.poblacion}` : base;
}

export default function Etapas({ etapas, pausado }: { etapas: Etapa[]; pausado?: boolean }) {
  if (etapas.length === 0) return null;
  return (
    <div className="pen-envio-sum" aria-label="Etapas del envío">
      {pausado && <div className="pen-sum-row"><span className="k" style={{ color: '#b45309', fontWeight: 800 }}>Seguimiento automático en pausa</span><span className="v">El estado solo cambia a mano</span></div>}
      {etapas.map((x) => {
        const color = x.actual ? 'var(--purple)' : x.hecha ? '#047857' : 'var(--gray-500)';
        // DOS líneas limpias a la izquierda (usuario, 2026-11-10: la fecha a la derecha
        // se partía y se amontonaba en móvil): el nombre, y debajo fecha · km · notas.
        const sub = [
          x.hora ? `${x.hecha ? '' : 'prevista '}${fechaHora(x.hora)}` : '',
          x.km != null ? `${Math.round(Number(x.km))} km${x.km_estimado ? ' (estimados)' : ''}` : '',
        ].filter(Boolean).join(' · ');
        return (
          <div key={x.paso} className="pen-sum-row" aria-current={x.actual ? 'step' : undefined}
               style={{ display: 'block', ...(x.actual ? { background: 'rgba(51,0,204,0.06)', borderRadius: 8 } : {}) }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color, fontWeight: x.actual ? 800 : 600 }}>
              <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
                background: x.hecha ? color : '#fff', boxShadow: `inset 0 0 0 2px ${color}` }} />
              {nombreEtapa(x)}
            </span>
            {(sub || x.marcada) && (
              <span style={{ display: 'block', margin: '0.15rem 0 0 calc(10px + 0.5rem)', fontSize: 'var(--fs-s)',
                             color: x.hecha ? 'var(--navy)' : 'var(--gray-500)' }}>
                {sub}
                {x.marcada && <span style={{ color: '#b45309', fontWeight: 700 }}>{sub ? ' · ' : ''}marcada a mano</span>}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
