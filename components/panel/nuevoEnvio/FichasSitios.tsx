'use client';

// Fichas de sitio editables en la confirmación de Nuevo envío (paso 4), como en el mockup:
// cada recogida/entrega es una tarjeta con cabecera azul que se despliega y enseña los datos
// del sitio editables, por si falta algún horario o teléfono de contacto que rellenar. Lo que
// se cambie se guarda en la ficha del sitio al crear el envío (los almacenes de Dynamo no:
// son datos fijos del catálogo). Las direcciones no se tocan aquí (se cambian en el paso 1).
import { useEffect, useState } from 'react';
import EditorHorario from '../EditorHorario';
import AvisoCierreSitio from './AvisoCierreSitio';
import { Interruptor } from './Interruptor';
import CampoTelefono from '@/components/CampoTelefono';
import { resumenHorario } from '@/lib/horarios';
import { nombreTipo, IconoTipo } from '../TipoSitio';
import { CardEdit, ContactoExtra, DatosSitios, Punto, direccionCompleta, resolverFicha } from './comun';
import Req from '@/components/Req';
import Tip from '@/components/Tip';

const Chevron = () => (
  <span className="ptar-sitio-chev"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg></span>
);

export function FichasSitios({ puntos, datos, edic, setEdic, fechaCargaTxt, faltas, cargaHoy }: {
  puntos: Punto[]; datos: DatosSitios; edic: Record<number, CardEdit>;
  setEdic: React.Dispatch<React.SetStateAction<Record<number, CardEdit>>>;
  fechaCargaTxt: string;
  faltas?: Set<number>;   // puntos con datos obligatorios sin rellenar (los marca el padre al crear)
  cargaHoy?: boolean;     // la carga empieza HOY: avisa si el sitio de recogida cierra pronto
}) {
  const [abiertas, setAbiertas] = useState<Set<number>>(new Set());
  // Campos opcionales REPLEGADOS (usuario, 2026-11-09): nombre de contacto, notas
  // internas y enlace de Google Maps se abren Y SE CIERRAN pulsando su etiqueta; al
  // cerrarlos, el valor (si lo hay) queda a la vista en la propia etiqueta.
  const [opcAbiertos, setOpcAbiertos] = useState<Set<string>>(new Set());
  const toggleOpc = (k: string) => setOpcAbiertos((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  // Función (no componente): si fuera un componente definido aquí dentro, React lo
  // remontaría en cada render y el input perdería el foco al teclear.
  const opc = (k: string, etiqueta: React.ReactNode, valor: string, campo: React.ReactNode) => {
    const ab = opcAbiertos.has(k);
    return (
      <div className="full" key={k}>
        <button type="button" className="campo-plegado" aria-expanded={ab} onClick={() => toggleOpc(k)}>
          <span className="cp-ico" aria-hidden="true">{ab ? '−' : '+'}</span>
          <span className="cp-txt">{etiqueta}{!ab && valor.trim() ? <span className="cp-val">· {valor.length > 42 ? valor.slice(0, 41) + '…' : valor}</span> : null}</span>
        </button>
        {ab && <div style={{ marginTop: '0.45rem' }}>{campo}</div>}
      </div>
    );
  };
  // Horario replegado por tarjeta (como en la ficha de Sitios).
  const [horAbierto, setHorAbierto] = useState<Set<number>>(new Set());
  const toggleHor = (k: number) => setHorAbierto((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const toggle = (k: number) => setAbiertas((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  // Al intentar crear con faltas, las tarjetas afectadas se ABREN solas (usuario, 2026-11-09).
  useEffect(() => { if (faltas && faltas.size) setAbiertas((s) => new Set([...s, ...faltas])); }, [faltas]);
  const set = (p: Punto, cambios: Partial<CardEdit>) => setEdic((prev) => ({ ...prev, [p.k]: { ...prev[p.k], ...cambios } }));
  // Cambia un campo de un contacto ADICIONAL (usuario, 2026-11-10).
  const setExtra = (p: Punto, i: number, cambios: Partial<ContactoExtra>) =>
    setEdic((prev) => { const e = prev[p.k] ?? {}; const l = [...(e.extra ?? [])]; l[i] = { ...l[i], ...cambios }; return { ...prev, [p.k]: { ...e, extra: l } }; });

  return (
    <div className="ptar-sitios-list">
      {puntos.map((p, i) => {
        const rec = p.tipo === 'carga';
        const f = resolverFicha(p, datos, edic[p.k]);
        const dir = direccionCompleta((p.sitio ?? p.nuevo)!);
        const falta = f.nuevo && !f.empresa.trim();   // sitio nuevo sin nombre: datos obligatorios pendientes
        // Marcada por el padre al intentar crear: lo que siga vacío se pinta en rojo.
        const marcada = !!faltas?.has(p.k) && !f.dynamo;
        const telOk = !!f.telefono.trim();
        const faltaCampos = marcada && ((f.nuevo && !f.empresa.trim()) || !telOk);
        const abierta = abiertas.has(p.k);
        // CITA PREVIA por sitio (usuario, 2026-11-09): el activador vive aquí, encima del
        // horario, y su texto va a las anotaciones de ESA parada al crear el envío.
        const ed = edic[p.k];
        const citaBloque = (<>
          <div className="full" style={{ marginBottom: 0 }}>
            <Interruptor titulo="Cita previa" valor={ed?.cita ?? false} noTxt="No (sin hora fija)" siTxt="Sí (con hora fija)"
              onCambio={(v) => set(p, { cita: v, citaHora: v && !ed?.citaHora ? '08:00' : ed?.citaHora })} />
          </div>
          {ed?.cita && (<>
            <div className="ptar-cita-grid" style={{ display: 'contents' }}>
              <div><label>Hora de la cita</label>
                <input type="time" value={ed?.citaHora ?? '08:00'} onChange={(e) => set(p, { citaHora: e.target.value })} /></div>
              <div className="full"><label>Detalles de la cita <Req si={false} /></label>
                <input type="text" placeholder="Ej. muelle 4, preguntar por recepción…" value={ed?.citaDetalle ?? ''} onChange={(e) => set(p, { citaDetalle: e.target.value })} /></div>
            </div>
          </>)}
        </>);
        return (
          <div key={p.k} className={`ptar-sitio-card${abierta ? ' open' : ''}${falta || faltaCampos ? ' falta' : ' req-ok'}`}>
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
                {(falta || faltaCampos) && <span className="ptar-sitio-warn">⚠ Faltan datos obligatorios</span>}
              </span>
              <Chevron />
            </button>
            {/* Carga HOY y el sitio de recogida cierra pronto (o ya cerró): caja roja con
                cuenta atrás, SIEMPRE visible aunque la tarjeta esté plegada. No prohíbe. */}
            {rec && cargaHoy && f.horario.length > 0 && <AvisoCierreSitio empresa={f.empresa || 'El sitio de recogida'} horario={f.horario} />}
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
                  {citaBloque}
                  {f.horario.length > 0 && <div className="full"><label>Horario</label><input className="sitio-f-lock" value={resumenHorario(f.horario)} readOnly tabIndex={-1} /></div>}
                  {/* El nombre va ANTES del teléfono también aquí (usuario, 2026-11-10). */}
                  {f.contacto && <div><label>Contacto</label><input className="sitio-f-lock" value={f.contacto} readOnly tabIndex={-1} /></div>}
                  {f.telefono && <div><label>Teléfono</label><input className="sitio-f-lock" value={f.telefono} readOnly tabIndex={-1} /></div>}
                  {f.contactoEmail && <div><label>Email de contacto</label><input className="sitio-f-lock" value={f.contactoEmail} readOnly tabIndex={-1} /></div>}
                </>) : (<>
                  {/* Mismos campos, orden y etiquetas que la ficha de Sitios (usuario,
                      2026-11-09): empresa y tipo, dirección (del paso 1), contacto
                      (nombre · teléfono · email, sin cargo), notas internas y horario. */}
                  {f.nuevo
                    ? <div><label>Empresa <Req /></label>
                        <input value={f.empresa} style={marcada && !f.empresa.trim() ? { borderColor: '#dc2626' } : undefined} placeholder="Ej. Talleres Vega e Hijos S.L." onChange={(e) => set(p, { empresa: e.target.value })} /></div>
                    : <div><label>Empresa</label><input className="sitio-f-lock" value={f.empresa} readOnly tabIndex={-1} />
                        <div style={{ fontSize: 'var(--fs-s)', color: 'var(--gray-500)', lineHeight: 1.4, marginTop: '0.2rem' }}>El nombre se cambia en la sección Sitios.</div></div>}
                  <div><label>Tipo de sitio</label><input className="sitio-f-lock" value={nombreTipo(f.tipo)} readOnly tabIndex={-1} /></div>
                  <div className="full"><label>Dirección</label><input className="sitio-f-lock" value={dir} readOnly tabIndex={-1} />
                    <div style={{ fontSize: 'var(--fs-s)', color: 'var(--gray-500)', lineHeight: 1.4, marginTop: '0.2rem' }}>La dirección se cambia en el paso 1 (Ruta).</div></div>
                  {citaBloque}
                  {/* Horario REPLEGADO con resumen, igual que en la ficha de Sitios
                      (usuario, 2026-11-09): pulsando se abre el editor. */}
                  <div className="full">
                    <button type="button" className="campo-plegado" aria-expanded={horAbierto.has(p.k)} onClick={() => toggleHor(p.k)}>
                      <span className="cp-ico" aria-hidden="true">{horAbierto.has(p.k) ? '−' : '+'}</span>
                      <span className="cp-txt">Horario de carga y descarga<span className="cp-val">· {resumenHorario(f.horario) || 'sin definir'}</span></span>
                    </button>
                  </div>
                  {horAbierto.has(p.k) && <div className="full"><EditorHorario valor={f.horario} onCambio={(g) => set(p, { horario: g })} /></div>}
                  <div className="full ptar-section-head" style={{ marginBottom: 0 }}>Contacto del sitio</div>
                  {/* El nombre va ANTES de los campos de teléfono (usuario, 2026-11-09). */}
                  {opc(`${p.k}:nom`, <>Nombre y apellidos <Req si={false} /></>, f.contacto,
                    <input value={f.contacto} placeholder="Persona de contacto" onChange={(e) => set(p, { contacto: e.target.value })} />)}
                  <div className={marcada && !telOk ? 'sitio-f-falta' : undefined}><label>Teléfono <Req /></label>
                    <CampoTelefono valor={f.telefono} onCambio={(v) => set(p, { telefono: v })} /></div>
                  {/* La explicación del email va en un tooltip ⓘ (usuario, 2026-11-10). */}
                  <div><label>Email <Req util /> <Tip texto="Con email avisamos al sitio de cada recogida y entrega: operativa más ágil y mejor imagen ante proveedores y clientes." aria="Por qué el email es muy útil" /></label>
                    <input type="text" inputMode="email" value={f.contactoEmail} placeholder="nombre@empresa.com" onChange={(e) => set(p, { contactoEmail: e.target.value })} /></div>
                  {/* Contactos ADICIONALES del sitio (usuario, 2026-11-10): mismo botón fino
                      que en la ficha de Sitios; se crean en la agenda del sitio al guardar. */}
                  {!f.nuevo && (ed?.extra ?? []).map((x, xi) => (
                    <div className="full" key={xi} style={{ border: '1.5px solid var(--gray-200)', borderRadius: 12, padding: '0.7rem 0.8rem', background: 'var(--gray-50)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.45rem' }}>
                        <strong style={{ fontSize: 'var(--fs-m)', color: 'var(--navy)' }}>Contacto {xi + 2}</strong>
                        <button type="button" className="btn-ghost" style={{ minHeight: 30, padding: '0 0.6rem', color: '#dc2626' }}
                          onClick={() => set(p, { extra: (ed?.extra ?? []).filter((_, j) => j !== xi) })}>Quitar</button>
                      </div>
                      <div className="ptar-sitio-grid">
                        <div><label>Nombre y apellidos <Req si={false} /></label>
                          <input value={x.nombre} placeholder="Persona de contacto" onChange={(e) => setExtra(p, xi, { nombre: e.target.value })} /></div>
                        <div><label>Teléfono <Req si={false} /></label>
                          <CampoTelefono valor={x.telefono} onCambio={(v) => setExtra(p, xi, { telefono: v })} /></div>
                        <div><label>Email <Req si={false} /></label>
                          <input type="text" inputMode="email" value={x.email} placeholder="nombre@empresa.com" onChange={(e) => setExtra(p, xi, { email: e.target.value })} /></div>
                      </div>
                    </div>
                  ))}
                  {!f.nuevo && (ed?.extra ?? []).length < 5 && <div className="full">
                    <button type="button" className="campo-plegado btn-mas-contacto" onClick={() => set(p, { extra: [...(ed?.extra ?? []), { nombre: '', telefono: '', email: '' }] })}>
                      <span className="cp-ico" aria-hidden="true">+</span><span className="cp-txt">Añadir contacto adicional</span>
                    </button>
                  </div>}
                  {/* Las notas internas del sitio y el enlace de Google Maps NO se muestran
                      ni se editan aquí (usuario, 2026-11-09): se gestionan en la sección
                      Sitios. Los que tenga el sitio se conservan tal cual al guardar. */}
                </>)}
              </div>
            </div>
            {/* DETALLE DE MERCANCÍA de esta parada (usuario, 2026-11-09): al pie de la
                caja y SIEMPRE visible (fuera del desplegable de los datos del sitio).
                Su texto va a las anotaciones de ESA parada al crear el envío. */}
            <div className="ptar-sitio-merc">
              <button type="button" className="campo-plegado" aria-expanded={opcAbiertos.has(`${p.k}:merc`)} onClick={() => toggleOpc(`${p.k}:merc`)}>
                <span className="cp-ico" aria-hidden="true"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg></span>
                <span className="cp-txt">Añadir detalle de mercancía <Req si={false} />
                  {!opcAbiertos.has(`${p.k}:merc`) && (ed?.mercancia ?? '').trim()
                    ? <span className="cp-val">· {ed!.mercancia!.length > 42 ? ed!.mercancia!.slice(0, 41) + '…' : ed!.mercancia}</span> : null}</span>
              </button>
              {opcAbiertos.has(`${p.k}:merc`) && <div style={{ marginTop: '0.45rem' }}>
                <textarea className="campo-texto" rows={2} value={ed?.mercancia ?? ''}
                  placeholder={rec ? 'Ej. aquí se cargan 4 palets de recambios, 1 caja de 2×1 m…' : 'Ej. aquí se entregan 2 de los 6 palets…'}
                  onChange={(e) => set(p, { mercancia: e.target.value })} /></div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
