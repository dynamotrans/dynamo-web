'use client';

// Fichas de sitio editables en la confirmación de Nuevo envío (paso 4), como en el mockup:
// cada recogida/entrega es una tarjeta con cabecera azul que se despliega y enseña los datos
// del sitio editables, por si falta algún horario o teléfono de contacto que rellenar. Lo que
// se cambie se guarda en la ficha del sitio al crear el envío (los almacenes de Dynamo no:
// son datos fijos del catálogo). Las direcciones no se tocan aquí (se cambian en el paso 1).
import { useState } from 'react';
import EditorHorario from '../EditorHorario';
import CampoTelefono from '@/components/CampoTelefono';
import { resumenHorario } from '@/lib/horarios';
import { nombreTipo, IconoTipo } from '../TipoSitio';
import { CardEdit, DatosSitios, Punto, direccionCompleta, resolverFicha } from './comun';

const Chevron = () => (
  <span className="ptar-sitio-chev"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg></span>
);

export function FichasSitios({ puntos, datos, edic, setEdic, fechaCargaTxt, esCliente }: {
  puntos: Punto[]; datos: DatosSitios; edic: Record<number, CardEdit>;
  setEdic: React.Dispatch<React.SetStateAction<Record<number, CardEdit>>>;
  fechaCargaTxt: string; esCliente: boolean;
}) {
  const [abiertas, setAbiertas] = useState<Set<number>>(new Set());
  const toggle = (k: number) => setAbiertas((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const set = (p: Punto, cambios: Partial<CardEdit>) => setEdic((prev) => ({ ...prev, [p.k]: { ...prev[p.k], ...cambios } }));

  return (
    <div className="ptar-sitios-list">
      {puntos.map((p, i) => {
        const rec = p.tipo === 'carga';
        const f = resolverFicha(p, datos, edic[p.k]);
        const dir = direccionCompleta((p.sitio ?? p.nuevo)!);
        const falta = f.nuevo && !f.empresa.trim();   // sitio nuevo sin nombre: datos obligatorios pendientes
        const abierta = abiertas.has(p.k);
        return (
          <div key={p.k} className={`ptar-sitio-card${abierta ? ' open' : ''}${falta ? '' : ' req-ok'}`}>
            <button type="button" className="ptar-sitio-head" aria-expanded={abierta} onClick={() => toggle(p.k)}>
              <span className="ptar-sitio-head-main">
                <span className="ptar-sitio-head-l1">
                  <span className={`ptar-route-num ${rec ? 'rec' : 'ent'}`} style={{ verticalAlign: '-4px', marginRight: '0.35rem' }}>{i + 1}</span>
                  <span style={{ color: rec ? 'var(--orange)' : 'var(--green)' }}>{rec ? 'Recogida' : 'Entrega'}</span>
                  <span className={`ptar-sitio-head-tipo${f.tipo && f.tipo !== 'almacen_nave' ? ' esp' : ''}`}>
                    <IconoTipo tipo={f.tipo} /><span>({nombreTipo(f.tipo)})</span>
                  </span>
                </span>
                {rec && fechaCargaTxt && <span className="ptar-sitio-head-fecha shf-rec">{fechaCargaTxt}</span>}
                {f.horario.length > 0 && <span className="ptar-sitio-head-hor">({resumenHorario(f.horario)})</span>}
                {dir && <span className="ptar-sitio-head-dir">{dir}</span>}
                {f.empresa && <span className="ptar-sitio-head-empn">{f.empresa}</span>}
                {falta && <span className="ptar-sitio-warn">⚠ Faltan datos obligatorios</span>}
              </span>
              <Chevron />
            </button>
            <div className="ptar-sitio-body">
              <div className="ptar-sitio-body-meta">
                {f.dynamo
                  ? <><strong style={{ color: 'var(--purple)' }}>Almacén Dynamo</strong> · datos fijos: solo el administrador los edita, en la sección Almacenes</>
                  : f.nuevo
                  ? 'Sitio nuevo — revisa y completa los datos; se guardarán en su ficha.'
                  : 'De la agenda — corrige aquí lo que falte (se guarda en su ficha al crear el envío).'}
              </div>
              <div className="ptar-sitio-grid">
                {f.dynamo ? (<>
                  <div><label>Empresa</label><input className="sitio-f-lock" value={f.empresa} readOnly tabIndex={-1} /></div>
                  <div><label>Tipo de lugar</label><input className="sitio-f-lock" value={nombreTipo(f.tipo)} readOnly tabIndex={-1} /></div>
                  <div className="full"><label>Dirección</label><input className="sitio-f-lock" value={dir} readOnly tabIndex={-1} /></div>
                  {f.horario.length > 0 && <div className="full"><label>Horario</label><input className="sitio-f-lock" value={resumenHorario(f.horario)} readOnly tabIndex={-1} /></div>}
                  {f.telefono && <div><label>Teléfono</label><input className="sitio-f-lock" value={f.telefono} readOnly tabIndex={-1} /></div>}
                  {f.contacto && <div><label>Contacto</label><input className="sitio-f-lock" value={f.contacto} readOnly tabIndex={-1} /></div>}
                  {f.contactoEmail && <div><label>Email de contacto</label><input className="sitio-f-lock" value={f.contactoEmail} readOnly tabIndex={-1} /></div>}
                </>) : (<>
                  {/* Mismos campos, orden y etiquetas que la ficha de Sitios (usuario,
                      2026-11-09): empresa y tipo, dirección (del paso 1), contacto
                      (nombre · teléfono · email, sin cargo), notas internas y horario. */}
                  {f.nuevo
                    ? <div><label>Empresa{falta ? ' ' : ''}{falta && <span className="sitio-req">· obligatorio</span>}</label>
                        <input value={f.empresa} placeholder="Ej. Talleres Vega e Hijos S.L." onChange={(e) => set(p, { empresa: e.target.value })} /></div>
                    : <div><label>Empresa</label><input className="sitio-f-lock" value={f.empresa} readOnly tabIndex={-1} />
                        <div style={{ fontSize: 'var(--fs-s)', color: 'var(--gray-500)', lineHeight: 1.4, marginTop: '0.2rem' }}>El nombre se cambia en la sección Sitios.</div></div>}
                  <div><label>Tipo de sitio</label><input className="sitio-f-lock" value={nombreTipo(f.tipo)} readOnly tabIndex={-1} /></div>
                  <div className="full"><label>Dirección</label><input className="sitio-f-lock" value={dir} readOnly tabIndex={-1} />
                    <div style={{ fontSize: 'var(--fs-s)', color: 'var(--gray-500)', lineHeight: 1.4, marginTop: '0.2rem' }}>La dirección se cambia en el paso 1 (Ruta).</div></div>
                  <div className="full ptar-section-head" style={{ marginBottom: 0 }}>Contacto del sitio</div>
                  <div><label>Teléfono <span className="sitio-req">· obligatorio</span></label>
                    <CampoTelefono valor={f.telefono} onCambio={(v) => set(p, { telefono: v })} /></div>
                  <div><label>Email <span className="sitio-req">· obligatorio</span></label>
                    <input type="text" inputMode="email" value={f.contactoEmail} placeholder="nombre@empresa.com" onChange={(e) => set(p, { contactoEmail: e.target.value })} /></div>
                  <div className="full"><label>Nombre y apellidos <span style={{ color: 'var(--gray-500)', fontWeight: 600 }}>· opcional</span></label>
                    <input value={f.contacto} placeholder="Persona de contacto" onChange={(e) => set(p, { contacto: e.target.value })} /></div>
                  {!f.nuevo && <div className="full"><label>Notas internas del sitio <span style={{ color: 'var(--gray-500)', fontWeight: 600 }}>· privadas</span></label>
                    <input value={f.notas} placeholder="Ej. referencia de carga/entrega, pedir cita, báscula…" onChange={(e) => set(p, { notas: e.target.value })} /></div>}
                  <div className="full ptar-section-head" style={{ marginBottom: 0 }}>Horario de carga y descarga</div>
                  <div className="full"><EditorHorario valor={f.horario} onCambio={(g) => set(p, { horario: g })} /></div>
                  {f.nuevo ? null : esCliente
                    ? (f.maps ? <div className="full"><label>Enlace de Google Maps</label><input className="sitio-f-lock" value={f.maps} readOnly tabIndex={-1} /></div> : null)
                    : <div className="full"><label>Enlace de Google Maps · opcional</label>
                        <input value={f.maps} placeholder="https://maps.app.goo.gl/…" onChange={(e) => set(p, { maps: e.target.value })} /></div>}
                </>)}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
