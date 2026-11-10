// Seguimiento del envío (usuario, 2026-11-06): todas sus etapas en orden, con la hora real
// (las hechas) o la prevista (las que faltan). El estado avanza solo con estos plazos; Dynamo
// lo corrige a mano y desde ahí sigue (ver migración seguimiento_automatico). Lo ven Dynamo,
// el cliente y el transportista, con los datos de etapas_envio().
//
// Se pinta como LÍNEA TEMPORAL (usuario, 2026-11-10: «unifica ruta y seguimiento, una línea
// temporal con hitos, más visual»): hitos conectados por una línea vertical y, si la ficha
// pasa `fichaParada`, la ficha completa de cada parada incrustada en su hito de carga o
// descarga — la ruta y el seguimiento son UNA sola cosa, sin repetir direcciones.
import type { ReactNode } from 'react';
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

/** Lo que hace falta de una parada para pintar su dirección en el seguimiento. */
export type ParadaDir = { codigo_postal: string | null; poblacion: string | null; provincia: string | null; pais_codigo_iso: string | null };

// «15001 A Coruña, A Coruña, ES»: CP y localidad, provincia (si no repite) y el país
// SIEMPRE en siglas ISO (usuario, 2026-11-10: «cp, localidad, provincia y país con siglas»).
function dirEtapa(p: ParadaDir): string {
  const prov = p.provincia && p.provincia !== p.poblacion ? p.provincia : null;
  return [[p.codigo_postal, p.poblacion].filter(Boolean).join(' '), prov, (p.pais_codigo_iso ?? 'ES').toUpperCase()].filter(Boolean).join(', ');
}

export default function Etapas({ etapas, pausado, paradas, fichaParada }: {
  etapas: Etapa[]; pausado?: boolean; paradas?: ParadaDir[];
  /** La ficha completa de la parada n (1-based), para incrustarla en su hito; con ella, las
      direcciones en texto sobran (van dentro de la ficha). */
  fichaParada?: (parada: number) => ReactNode;
}) {
  if (etapas.length === 0) return null;
  return (
    <div className="pen-envio-sum" aria-label="Etapas del envío">
      {pausado && <div className="pen-sum-row" style={{ marginBottom: '0.4rem' }}><span className="k" style={{ color: '#b45309', fontWeight: 800 }}>Seguimiento automático en pausa</span><span className="v">El estado solo cambia a mano</span></div>}
      <div className="tl">
        {etapas.map((x) => {
          const color = x.actual ? 'var(--purple)' : x.hecha ? '#047857' : 'var(--gray-500)';
          // Hito EN una parada (cargando o descargando): lleva su ficha incrustada.
          const card = fichaParada && x.estado === 'cargando' && x.parada ? fichaParada(x.parada) : null;
          // Sin fichas incrustadas, la dirección en una línea de texto (fichas de cliente
          // y transportista, que tienen su propia sección de Ruta).
          const p = !fichaParada && paradas && x.parada ? paradas[x.parada - 1] : null;
          const dir = p ? dirEtapa(p) : '';
          const sub = [
            x.hora ? `${x.hecha ? '' : 'prevista '}${fechaHora(x.hora)}` : '',
            x.km != null ? `${Math.round(Number(x.km))} km${x.km_estimado ? ' (estimados)' : ''}` : '',
          ].filter(Boolean).join(' · ');
          return (
            <div key={x.paso} className={`tl-item${x.actual ? ' tl-actual' : ''}${x.hecha ? ' tl-hecha' : ''}`} aria-current={x.actual ? 'step' : undefined}>
              <span className="tl-dot" aria-hidden="true" />
              <span className="tl-tit" style={{ color, fontWeight: x.actual ? 800 : 600 }}>{dir ? nombreEtapa({ ...x, poblacion: '' }) : nombreEtapa(x)}</span>
              {dir && <span className="tl-sub" style={{ fontWeight: 600, color: x.hecha ? 'var(--navy)' : 'var(--gray-500)' }}>{dir}</span>}
              {(sub || x.marcada) && (
                <span className="tl-sub" style={{ color: x.hecha ? 'var(--navy)' : 'var(--gray-500)' }}>
                  {sub}
                  {x.marcada && <span style={{ color: '#b45309', fontWeight: 700 }}>{sub ? ' · ' : ''}marcada a mano</span>}
                </span>
              )}
              {card && <div className="tl-card">{card}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
