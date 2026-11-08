'use client';

// Horario de un sitio: grupos de días (L M X J V S D) con uno o varios tramos cada uno
// (mañana y tarde). Ej.: L-J 8:00-14:00 y 15:00-17:30 · V 8:00-14:00. Los días que no
// están en ningún grupo, cerrado. Va dentro de la rejilla .ptar-sitio-grid de la ficha.
import { DIAS, resumenHorario, type GrupoHorario, type Tramo } from '@/lib/horarios';

const chip = (on: boolean, libre: boolean): React.CSSProperties => ({
  minWidth: 38, height: 38, borderRadius: 10, fontWeight: 800, fontSize: 'var(--fs-m)', cursor: libre ? 'pointer' : 'not-allowed',
  border: `1.5px solid ${on ? 'var(--purple)' : 'var(--gray-200)'}`, background: on ? 'var(--purple)' : libre ? '#fff' : 'var(--gray-100)',
  color: on ? '#fff' : libre ? 'var(--navy)' : 'var(--gray-300)',
});

export default function EditorHorario({ valor, onCambio }: { valor: GrupoHorario[]; onCambio: (g: GrupoHorario[]) => void }) {
  const usados = new Map<number, number>();
  valor.forEach((g, i) => g.dias.forEach((d) => usados.set(d, i)));
  const libres = DIAS.filter(([d]) => !usados.has(d));
  const cambiar = (i: number, g: GrupoHorario) => onCambio(valor.map((x, j) => (j === i ? g : x)));
  const resumen = resumenHorario(valor);

  return (
    <div style={{ gridColumn: '1/-1', display: 'grid', gap: '0.6rem' }}>
      {valor.map((g, i) => (
        <div key={i} style={{ border: '1.5px solid var(--gray-200)', borderRadius: 12, padding: '0.7rem 0.8rem', background: 'var(--gray-50)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }} role="group" aria-label="Días de este horario">
              {DIAS.map(([d, letra, nombre]) => {
                const on = g.dias.includes(d), libre = on || !usados.has(d);
                return (
                  <button key={d} type="button" style={chip(on, libre)} disabled={!libre} title={libre ? nombre : `${nombre}: ya está en otro horario`}
                    aria-pressed={on} aria-label={nombre}
                    onClick={() => cambiar(i, { ...g, dias: on ? g.dias.filter((x) => x !== d) : [...g.dias, d].sort() })}>{letra}</button>
                );
              })}
            </div>
            {valor.length > 1 && <button type="button" className="btn-ghost" style={{ minHeight: 30, padding: '0 0.6rem', color: '#dc2626' }}
              onClick={() => onCambio(valor.filter((_, j) => j !== i))}>Quitar</button>}
          </div>
          <div style={{ display: 'grid', gap: '0.4rem', marginTop: '0.6rem' }}>
            {g.tramos.map((t, k) => (
              <div key={k}>
                <div style={{ fontSize: 'var(--fs-s)', color: 'var(--gray-500)', fontWeight: 600, marginBottom: 2 }}>{g.tramos.length > 1 ? `Tramo ${k + 1}` : 'Horario'}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Hora valor={t.abre} etiqueta="Abre" onCambio={(v) => cambiar(i, { ...g, tramos: g.tramos.map((x, j) => (j === k ? { ...x, abre: v } : x)) })} />
                <span style={{ color: 'var(--gray-500)' }}>a</span>
                <Hora valor={t.cierra} etiqueta="Cierra" onCambio={(v) => cambiar(i, { ...g, tramos: g.tramos.map((x, j) => (j === k ? { ...x, cierra: v } : x)) })} />
                {g.tramos.length > 1 && <button type="button" className="btn-ghost" style={{ minHeight: 30, padding: '0 0.5rem' }} aria-label="Quitar este tramo"
                  onClick={() => cambiar(i, { ...g, tramos: g.tramos.filter((_, j) => j !== k) })}>✕</button>}
                </div>
              </div>
            ))}
            {g.tramos.length < 3 && (
              <div><button type="button" className="btn-ghost" style={{ minHeight: 32, padding: '0 0.6rem', color: 'var(--purple)' }}
                onClick={() => cambiar(i, { ...g, tramos: [...g.tramos, nuevoTramo(g.tramos)] })}>+ Añadir tramo</button></div>
            )}
          </div>
        </div>
      ))}
      {libres.length > 0 && (
        <div>
          <button type="button" className="btn-secondary" onClick={() => onCambio([...valor, { dias: [], tramos: [{ abre: '08:00', cierra: '14:00' }] }])}>
            + Otro horario para otros días
          </button>
        </div>
      )}
      <div style={{ fontSize: 'var(--fs-s)', color: 'var(--gray-500)', lineHeight: 1.5 }}>
        {resumen ? <>Queda así: <strong style={{ color: 'var(--navy)' }}>{resumen}</strong>. </> : null}
        {libres.length ? <>Cerrado: {libres.map(([, , n]) => n.toLowerCase()).join(', ')}.</> : 'Abre todos los días.'}
      </div>
    </div>
  );
}

function nuevoTramo(t: Tramo[]): Tramo {
  const ultimo = [...t].sort((a, b) => a.abre.localeCompare(b.abre)).pop();
  return ultimo && ultimo.cierra <= '15:00' ? { abre: '15:00', cierra: '18:00' } : { abre: '16:00', cierra: '19:00' };
}

// Desplegable de horas en formato 24 h y pasos de 15 minutos: igual en cualquier móvil u
// ordenador (el <input type="time"> se ve en AM/PM según el idioma del sistema).
const HORAS = Array.from({ length: 96 }, (_, i) => `${String(Math.floor(i / 4)).padStart(2, '0')}:${String((i % 4) * 15).padStart(2, '0')}`);
function Hora({ valor, etiqueta, onCambio }: { valor: string; etiqueta: string; onCambio: (v: string) => void }) {
  const opciones = HORAS.includes(valor) || !valor ? HORAS : [...HORAS, valor].sort();
  return (
    <select value={valor} aria-label={etiqueta} onChange={(e) => onCambio(e.target.value)}
      style={{ width: 104, minWidth: 0, flex: '0 1 104px' }}>
      {opciones.map((h) => <option key={h} value={h}>{h}</option>)}
    </select>
  );
}
