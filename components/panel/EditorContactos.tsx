'use client';

// Personas de contacto de una ficha (clientes, transportistas, sitios): una o varias, cada
// una con teléfono y/o email, y el botón "+ Añadir contacto adicional". Se monta dentro de
// la rejilla .ptar-sitio-grid de la ficha, con sus mismos campos (regla 0-quater).
import { useState } from 'react';
import { CONTACTO_VACIO, FUNCIONES, type ContactoDatos, type Funcion } from '@/lib/contactos';
import { partirTel } from '@/lib/paises';
import SelectorPais from '@/components/SelectorPais';
import Req from '@/components/Req';

export default function EditorContactos({ valor, onCambio, conFuncion = false, conCargo = true, conAvisos = true, obligatorios = false, roles, funcionNueva = 'general', ayuda }: {
  valor: ContactoDatos[]; onCambio: (l: ContactoDatos[]) => void;
  // conAvisos: enseña el conmutador «Recibe los avisos». En los SITIOS solo lo ve Dynamo:
  // el cliente no; todo contacto nuevo nace recibiendo avisos (CONTACTO_VACIO).
  // obligatorios: marca Teléfono y Email como obligatorios y el nombre como opcional
  // (los SITIOS exigen un contacto con teléfono y email; nombre opcional).
  // roles: UN solo desplegable «Rol» con estas opciones (sustituye a Cargo + «Para qué»;
  // usuario 2026-11-09): clientes Logística/Contabilidad · transportistas Tráfico/
  // Contabilidad. Un valor antiguo fuera de la lista se añade para no perderlo.
  roles?: [Funcion, string][];
  conFuncion?: boolean; conCargo?: boolean; conAvisos?: boolean; obligatorios?: boolean; funcionNueva?: Funcion; ayuda?: React.ReactNode;
}) {
  const cambiar = (i: number, c: ContactoDatos) => onCambio(valor.map((x, j) => (j === i ? c : x)));
  return (
    <div style={{ gridColumn: '1/-1', display: 'grid', gap: '0.6rem' }}>
      {valor.length === 0 && <div style={{ fontSize: 'var(--fs-m)', color: 'var(--gray-500)' }}>Sin personas de contacto.</div>}
      {valor.map((c, i) => (
        <Persona key={c.id ?? `n${i}`} c={c} i={i} total={valor.length} conFuncion={conFuncion} conCargo={conCargo} conAvisos={conAvisos} obligatorios={obligatorios} roles={roles}
          onCambio={(x) => cambiar(i, x)} onQuitar={() => onCambio(valor.filter((_, j) => j !== i))} />
      ))}
      <div>
        <button type="button" className="btn-secondary" onClick={() => onCambio([...valor, CONTACTO_VACIO(funcionNueva)])}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
          {valor.length ? 'Añadir contacto adicional' : 'Añadir contacto'}
        </button>
      </div>
      {ayuda && <div style={{ fontSize: 'var(--fs-s)', color: 'var(--gray-500)', lineHeight: 1.5 }}>{ayuda}</div>}
    </div>
  );
}

function Persona({ c, i, total, conFuncion, conCargo, conAvisos, obligatorios, roles, onCambio, onQuitar }: {
  c: ContactoDatos; i: number; total: number; conFuncion: boolean; conCargo: boolean; conAvisos: boolean; obligatorios: boolean;
  roles?: [Funcion, string][];
  onCambio: (c: ContactoDatos) => void; onQuitar: () => void;
}) {
  const t = partirTel(c.telefono);
  const [pref, setPref] = useState(t.pref);
  const num = t.num;
  const ponTel = (p: string, n: string) => onCambio({ ...c, telefono: n.trim() ? p + n.replace(/\D/g, '') : '' });
  const id = `ct-${i}`;
  return (
    <div style={{ border: '1.5px solid var(--gray-200)', borderRadius: 12, padding: '0.7rem 0.8rem', background: 'var(--gray-50)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.45rem' }}>
        <strong style={{ fontSize: 'var(--fs-m)', color: 'var(--navy)' }}>
          Contacto {i + 1}{i === 0 && total > 1 ? ' · principal' : ''}
        </strong>
        <button type="button" className="btn-ghost" style={{ minHeight: 30, padding: '0 0.6rem', color: '#dc2626' }} onClick={onQuitar}>Quitar</button>
      </div>
      <div className="ptar-sitio-grid">
        <div>
          <label htmlFor={`${id}-tel`}>Teléfono <Req si={obligatorios} /></label>
          <div className="tel-group">
            <SelectorPais modo="prefijo" valor={pref} onCambio={(v) => { setPref(v); ponTel(v, num); }} />
            <input id={`${id}-tel`} type="tel" inputMode="tel" value={num} placeholder="600 000 000" onChange={(e) => ponTel(pref, e.target.value)} />
          </div>
        </div>
        <div>
          <label htmlFor={`${id}-email`}>Email <Req si={obligatorios} /></label>
          <input id={`${id}-email`} type="email" inputMode="email" value={c.email} placeholder="nombre@empresa.com" onChange={(e) => onCambio({ ...c, email: e.target.value })} />
        </div>
        <div>
          <label htmlFor={`${id}-nombre`}>Nombre y apellidos <Req si={false} /></label>
          <input id={`${id}-nombre`} type="text" value={c.nombre} placeholder="Persona de contacto" onChange={(e) => onCambio({ ...c, nombre: e.target.value })} />
        </div>
        {roles ? (
          <div>
            <label htmlFor={`${id}-rol`}>Rol</label>
            <select id={`${id}-rol`} value={c.funcion} onChange={(e) => onCambio({ ...c, funcion: e.target.value as Funcion })}>
              {!roles.some(([k]) => k === c.funcion) && <option value={c.funcion}>{FUNCIONES.find(([k]) => k === c.funcion)?.[1] ?? c.funcion}</option>}
              {roles.map(([k, n]) => <option key={k} value={k}>{n}</option>)}
            </select>
          </div>
        ) : conCargo && (
          <div>
            <label htmlFor={`${id}-cargo`}>Cargo <Req si={false} /></label>
            <input id={`${id}-cargo`} type="text" value={c.cargo} placeholder="Jefe de almacén, tráfico…" onChange={(e) => onCambio({ ...c, cargo: e.target.value })} />
          </div>
        )}
        {conFuncion && !roles && (
          <div>
            <label htmlFor={`${id}-funcion`}>Para qué</label>
            <select id={`${id}-funcion`} value={c.funcion} onChange={(e) => onCambio({ ...c, funcion: e.target.value as Funcion })}>
              {FUNCIONES.map(([k, n]) => <option key={k} value={k}>{n}</option>)}
            </select>
          </div>
        )}
        {conAvisos && (
          <div>
            <label>Recibe los avisos</label>
            <label className="ptar-tramp-box">
              <input type="checkbox" className="ptar-switch-input" checked={c.recibe_avisos} onChange={(e) => onCambio({ ...c, recibe_avisos: e.target.checked })} />
              <span className="ptar-switch" aria-hidden="true" />
              <span className="ptar-tramp-state" aria-hidden="true"><span className="tramp-off">No</span><span className="tramp-on">Sí</span></span>
            </label>
          </div>
        )}
      </div>
    </div>
  );
}
