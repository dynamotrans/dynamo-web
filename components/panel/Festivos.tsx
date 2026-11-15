'use client';

// Festivos de la plataforma (solo equipo Dynamo): lista + alta + baja. Nacionales,
// autonómicos (comunidad por ISO, la misma que sale del CP del sitio) y locales (por
// población). Los nacionales afectan al corte de cancelación y a los avisos a sitios;
// los autonómicos y locales, solo a los avisos de SUS sitios.
import { useState } from 'react';
import { useRefrescar } from '@/lib/useRefrescar';
import Cargando from '@/components/Cargando';
import { fecha } from '@/lib/formato';
import { crearFestivo, borrarFestivo, type FestivoNuevo } from '@/app/panel/(app)/festivos/acciones';

export type FestivoFila = {
  id: string; fecha: string; pais_codigo_iso: string; region: string | null; poblacion: string | null;
  nombre: string; repetir: string; dias_desde_pascua: number | null; vigente_hasta: string | null;
};
export type ComunidadOpcion = { iso: string; nombre: string };

export default function Festivos({ filas, comunidades, error }: { filas: FestivoFila[]; comunidades: ComunidadOpcion[]; error: string | null }) {
  const refrescar = useRefrescar();
  const [trabajando, setTrabajando] = useState(false);
  const [fallo, setFallo] = useState<string | null>(error);
  const [f, setF] = useState<FestivoNuevo>({ fecha: '', nombre: '', ambito: 'nacional', comunidad: null, poblacion: null, pais: 'ES', cada_anio: true });
  const nombreCom = (iso: string | null) => comunidades.find((c) => c.iso === iso)?.nombre ?? iso ?? '';
  const ambitoTxt = (x: FestivoFila) => x.region == null ? `Nacional · ${x.pais_codigo_iso}`
    : x.poblacion ? `${nombreCom(x.region)} · ${x.poblacion}` : nombreCom(x.region);
  const repiteTxt = (x: FestivoFila) => x.repetir === 'cada_anio' ? 'Cada año'
    : x.repetir === 'pascua' ? `Según la Pascua (${x.dias_desde_pascua! >= 0 ? '+' : ''}${x.dias_desde_pascua} días)` : 'Solo ese año';
  async function crear() {
    setFallo(null); setTrabajando(true);
    const r = await crearFestivo(f);
    setTrabajando(false);
    if (!r.ok) { setFallo(r.error); return; }
    setF({ fecha: '', nombre: '', ambito: f.ambito, comunidad: f.comunidad, poblacion: null, pais: f.pais, cada_anio: f.cada_anio });
    refrescar();
  }
  async function borrar(id: string) {
    setFallo(null); setTrabajando(true);
    const r = await borrarFestivo(id);
    setTrabajando(false);
    if (!r.ok) { setFallo(r.error); return; }
    refrescar();
  }
  // Nacionales primero y luego por comunidad, cada grupo por fecha.
  const orden = [...filas].sort((a, b) => (a.region ?? '').localeCompare(b.region ?? '') || (a.poblacion ?? '').localeCompare(b.poblacion ?? '') || a.fecha.localeCompare(b.fecha));
  const campo = { display: 'grid', gap: '0.25rem' } as const;
  return (
    <section className="section active" id="sec-festivos">
      <div className="sec-header"><h2>Festivos</h2></div>
      <p style={{ color: 'var(--gray-500)', fontSize: 'var(--fs-m)', margin: '-0.4rem 0 0.9rem', maxWidth: 820 }}>
        Los <strong>nacionales</strong> cuentan para el corte de cancelación y para los avisos de recogida/entrega a los sitios.
        Los <strong>autonómicos</strong> y <strong>locales</strong> solo afectan a los avisos de los sitios a los que les tocan:
        la comunidad sale sola del código postal del sitio, y el local casa por su población.
      </p>
      <div style={{ maxWidth: 900, background: '#fff', border: '1px solid var(--gray-200)', borderRadius: 14, padding: '1.1rem 1.2rem', marginBottom: '1rem' }}>
        <strong style={{ color: 'var(--navy)' }}>Añadir festivo</strong>
        <div style={{ display: 'flex', gap: '0.7rem', flexWrap: 'wrap', alignItems: 'end', marginTop: '0.7rem' }}>
          <label style={campo}>Fecha
            <input type="date" value={f.fecha} onChange={(ev) => setF({ ...f, fecha: ev.target.value })} /></label>
          <label style={{ ...campo, minWidth: 220, flex: 1 }}>Nombre
            <input type="text" value={f.nombre} placeholder="Ej. Día de Andalucía" maxLength={200} onChange={(ev) => setF({ ...f, nombre: ev.target.value })} /></label>
          <label style={campo}>Ámbito
            <select value={f.ambito} onChange={(ev) => setF({ ...f, ambito: ev.target.value as FestivoNuevo['ambito'], pais: ev.target.value === 'nacional' ? f.pais : 'ES' })}>
              <option value="nacional">Nacional</option>
              <option value="comunidad">Comunidad autónoma</option>
              <option value="local">Local (población)</option>
            </select></label>
          {f.ambito === 'nacional' ? (
            <label style={campo}>País (ISO)
              <input type="text" value={f.pais ?? 'ES'} maxLength={2} style={{ width: 70, textTransform: 'uppercase' }}
                onChange={(ev) => setF({ ...f, pais: ev.target.value.toUpperCase() })} /></label>
          ) : (
            <label style={campo}>Comunidad
              <select value={f.comunidad ?? ''} onChange={(ev) => setF({ ...f, comunidad: ev.target.value || null })}>
                <option value="">Elige…</option>
                {comunidades.map((c) => <option key={c.iso} value={c.iso}>{c.nombre}</option>)}
              </select></label>
          )}
          {f.ambito === 'local' && (
            <label style={{ ...campo, minWidth: 180 }}>Población
              <input type="text" value={f.poblacion ?? ''} placeholder="Tal y como está en los sitios" maxLength={120}
                onChange={(ev) => setF({ ...f, poblacion: ev.target.value })} /></label>
          )}
          <label style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', paddingBottom: '0.55rem' }}>
            <input type="checkbox" checked={f.cada_anio} onChange={(ev) => setF({ ...f, cada_anio: ev.target.checked })} />Se repite cada año
          </label>
          <button className="btn-primary" onClick={crear} disabled={trabajando}>Añadir</button>
        </div>
        <p style={{ fontSize: 'var(--fs-s)', color: 'var(--gray-500)', margin: '0.6rem 0 0' }}>
          Para un festivo de varios días (una feria), añade un festivo por día. Los que dependen de la Pascua (Jueves y Viernes Santo) ya vienen de serie y se recalculan solos.
        </p>
      </div>
      {fallo && <div className="wiz-warn show" role="alert">⚠ {fallo}</div>}
      <div style={{ maxWidth: 900, background: '#fff', border: '1px solid var(--gray-200)', borderRadius: 14, padding: '0.4rem 1.2rem 0.8rem' }}>
        <table className="data" style={{ width: '100%', minWidth: 0 }}>
          <thead><tr><th>Fecha</th><th>Festivo</th><th>Ámbito</th><th>Repetición</th><th /></tr></thead>
          <tbody>
            {orden.map((x) => (
              <tr key={x.id}>
                <td style={{ whiteSpace: 'nowrap' }}>{x.repetir === 'cada_anio' ? x.fecha.slice(8, 10) + '/' + x.fecha.slice(5, 7) + ' (cada año)' : fecha(x.fecha)}</td>
                <td><strong>{x.nombre}</strong></td>
                <td>{ambitoTxt(x)}</td>
                <td>{repiteTxt(x)}</td>
                <td style={{ textAlign: 'right' }}>
                  <button className="btn-ghost" style={{ color: '#dc2626', padding: '0.15rem 0.6rem' }} onClick={() => borrar(x.id)} disabled={trabajando}>Quitar</button>
                </td>
              </tr>
            ))}
            {!orden.length && <tr><td colSpan={5} style={{ color: 'var(--gray-500)' }}>No hay ningún festivo en la lista.</td></tr>}
          </tbody>
        </table>
      </div>
      {trabajando && <Cargando texto="Guardando" />}
    </section>
  );
}
