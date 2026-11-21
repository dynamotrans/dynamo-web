'use client';

// Fichas de sitio editables en la confirmación de Nuevo envío (paso 4), como en el mockup:
// cada recogida/entrega es una tarjeta con cabecera azul que se despliega y enseña los datos
// del sitio editables, por si falta algún horario o teléfono de contacto que rellenar. Lo que
// se cambie se guarda en la ficha del sitio al crear el envío (los almacenes de Dynamo no:
// son datos fijos del catálogo). Las direcciones no se tocan aquí (se cambian en el paso 1).
import CampoHora from '@/components/CampoHora';
import { useEffect, useState } from 'react';
import AvisoCierreSitio from './AvisoCierreSitio';
import { Interruptor } from './Interruptor';
import CampoTelefono from '@/components/CampoTelefono';
import { resumenHorario } from '@/lib/horarios';
import { HorarioSitio } from '../Sitios';
import { nombreTipo, IconoTipo } from '../TipoSitio';
import { CardEdit, ContactoExtra, DatosSitios, Punto, direccionCompleta, resolverFicha } from './comun';
import Req from '@/components/Req';
import Tip from '@/components/Tip';
import { AVISO_DIAS_HABILES } from '@/lib/fechasCarga';

const Chevron = () => (
  <span className="ptar-sitio-chev"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg></span>
);

export function FichasSitios({ puntos, datos, edic, setEdic, fechaCargaTxt, faltas, cargaHoy, mercanciaDefecto, fechasParada }: {
  puntos: Punto[]; datos: DatosSitios; edic: Record<number, CardEdit>;
  setEdic: React.Dispatch<React.SetStateAction<Record<number, CardEdit>>>;
  fechaCargaTxt: string;
  faltas?: Set<number>;   // puntos con datos obligatorios sin rellenar (los marca el padre al crear)
  cargaHoy?: boolean;     // la carga empieza HOY: avisa si el sitio de recogida cierra pronto
  mercanciaDefecto?: string;   // resumen del paso 2 («6 metros - Paletizada - …»): prerrellena el detalle de mercancía de cada parada (usuario, 2026-11-10)
  fechasParada?: Record<number, string>;   // «Recogida/Entrega estimada · …» de la 2.ª parada en adelante, por su k (usuario, 2026-11-10)
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
  // LO FIJO DEL SITIO: UN solo campo, sin título propio y justo después del horario, «Indicaciones del sitio» (usuario,
  // 2026-11-16: antes eran dos, con «Info mercancía por defecto»). Plegable y editable aquí
  // mismo; se guarda en la ficha del sitio y vale para TODOS sus envíos. Lo puntual de este
  // envío va en el detalle de abajo. En los almacenes de Dynamo se ve pero no se toca.
  const fijos = (p: Punto, f: ReturnType<typeof resolverFicha>, soloLectura: boolean) => {
    if (soloLectura) {
      if (!f.notas.trim()) return null;
      return <div className="full"><label>Indicaciones del sitio</label><textarea className="campo-texto sitio-f-lock" rows={2} value={f.notas} readOnly tabIndex={-1} /></div>;
    }
    return (<>
      {opc(`${p.k}:ind`, <>Indicaciones del sitio <Req si={false} /><span style={{ color: 'var(--gray-500)', fontWeight: 600 }}> · vale para TODOS los envíos del sitio</span></>, f.notas, (<>
        <textarea className="campo-texto" rows={3} value={f.notas} placeholder={'Ej. "cargar por muelle 3", "traer 14 cintas de amarre", "preguntar por Paco para cargas"'}
          onChange={(e) => set(p, { notas: e.target.value })} />
        {/* Todo seguido, en un solo párrafo (usuario, 2026-11-17). */}
        <div style={{ fontSize: 'var(--fs-s)', color: 'var(--gray-500)', lineHeight: 1.4, marginTop: '0.25rem' }}>
          Las ven transportista y cliente: salen siempre con este sitio en la orden de carga y en la ficha del envío.{' '}
          Se guarda en la ficha del sitio. Si no quieres cambiarlo, no toques nada; si es algo solo de este envío,
          ponlo abajo en «{p.tipo === 'carga' ? 'Recogida' : 'Entrega'} (Añadir detalle de mercancía y/o anotaciones)».
        </div>
      </>))}
    </>);
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

  // Con varias paradas del MISMO tipo, cada una lleva solo una parte del total: su
  // resumen de mercancía va con «Parte de: » delante (usuario, 2026-11-12).
  const nRec = puntos.filter((x) => x.tipo === 'carga').length;
  const nEnt = puntos.filter((x) => x.tipo === 'descarga').length;
  return (
    <div className="ptar-sitios-list">
      {puntos.map((p, i) => {
        const rec = p.tipo === 'carga';
        const defectoMerc = mercanciaDefecto && (rec ? nRec : nEnt) > 1 ? `Parte de: ${mercanciaDefecto}` : mercanciaDefecto;
        const f = resolverFicha(p, datos, edic[p.k], defectoMerc);
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
                <CampoHora value={ed?.citaHora ?? '08:00'} aria-label="Hora de la cita" onChange={(v) => set(p, { citaHora: v })} style={{ width: '100%' }} /></div>
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
                  {/* La MISMA pastilla del paso 1 (usuario, 2026-11-10): nº · Recogida/Entrega
                      con el icono del tipo en blanco dentro. El nombre del tipo sigue al lado. */}
                  {/* Sin el nombre del tipo al lado (usuario, 2026-11-10): el icono de la
                      pastilla ya lo dice. */}
                  <span className={`ptar-route-tag ${rec ? 'rec' : 'ent'}`} style={{ marginRight: '0.45rem', verticalAlign: '-6px' }} title={nombreTipo(f.tipo)}>{i + 1} · {rec ? 'Recogida' : 'Entrega'}<IconoTipo tipo={f.tipo} blanco /></span>
                </span>
                {/* Solo la 1.ª parada lleva la fecha de carga ELEGIDA; el resto va en
                    cascada estimada (usuario, 2026-11-10). */}
                {/* ⓘ «sábados, domingos y festivos no cuentan» junto a cada fecha (usuario, 2026-11-19). */}
                {i === 0 && fechaCargaTxt && <span className="ptar-sitio-head-fecha shf-rec">{fechaCargaTxt} <Tip enBoton id={`tip-habiles-${i}`} texto={AVISO_DIAS_HABILES} aria="Días que cuentan para la recogida" /></span>}
                {i > 0 && fechasParada?.[p.k] && <span className={`ptar-sitio-head-fecha ${rec ? 'shf-rec' : 'shf-ent'}`}>{fechasParada[p.k]} <Tip enBoton id={`tip-habiles-${i}`} texto={AVISO_DIAS_HABILES} aria={`Días que cuentan para la ${rec ? 'recogida' : 'entrega'}`} /></span>}
                {f.horario.length > 0 && <span className="ptar-sitio-head-hor">({resumenHorario(f.horario)})</span>}
                {/* Primero el nombre de la empresa y debajo la dirección (usuario, 2026-11-17). */}
                {f.empresa && <span className="ptar-sitio-head-empn">{f.empresa}</span>}
                {dir && <span className="ptar-sitio-head-dir">{dir}</span>}
                {/* Los teléfonos ya NO se repiten en la cabecera (usuario, 2026-11-17): están en
                    «Contacto del sitio» al desplegar la tarjeta. */}
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
                  ? 'Sitio nuevo — revisa y completa los datos; se guardarán en su ficha. La dirección y el tipo se cambian en el paso 1 (Ruta).'
                  : 'La dirección, el nombre y el tipo del sitio se cambian en la sección Sitios, en cada sitio › Editar.'}
              </div>
              <div className="ptar-sitio-grid ptar-sitio-grid-auto">
                {f.dynamo ? (<>
                  {/* Sin campos bloqueados que repitan la cabecera de la tarjeta (usuario,
                      2026-11-17): empresa, tipo y dirección ya se leen arriba. */}
                  {citaBloque}
                  {f.horario.length > 0 && <div className="full"><label>Horario</label><input className="sitio-f-lock" value={resumenHorario(f.horario)} readOnly tabIndex={-1} /></div>}
                  {fijos(p, f, true)}
                  {/* El nombre va ANTES del teléfono también aquí (usuario, 2026-11-10). */}
                  {f.contacto && <div><label>Contacto</label><input className="sitio-f-lock" value={f.contacto} readOnly tabIndex={-1} /></div>}
                  {f.telefono && <div><label>Teléfono</label><input className="sitio-f-lock" value={f.telefono} readOnly tabIndex={-1} /></div>}
                  {f.contactoEmail && <div><label>Email de contacto</label><input className="sitio-f-lock" value={f.contactoEmail} readOnly tabIndex={-1} /></div>}
                </>) : (<>
                  {/* Mismos campos, orden y etiquetas que la ficha de Sitios (usuario,
                      2026-11-09): contacto (nombre · teléfono · email, sin cargo), horario
                      con la cita previa e indicaciones. */}
                  {/* Empresa, tipo y dirección NO se repiten aquí como campos bloqueados
                      (usuario, 2026-11-17: «no tiene sentido» si ya salen en la cabecera de la
                      tarjeta): una sola línea dice dónde se cambian. Solo el sitio nuevo
                      lleva la empresa, que aquí sí se escribe. */}
                  {f.nuevo && <div className="full"><label>Empresa <Req /></label>
                    <input value={f.empresa} style={marcada && !f.empresa.trim() ? { borderColor: '#dc2626' } : undefined} placeholder="Ej. Talleres Vega e Hijos S.L." onChange={(e) => set(p, { empresa: e.target.value })} /></div>}
                  {/* ORDEN (usuario, 2026-11-17): primero el contacto del sitio y después el
                      horario, con la cita previa dentro. */}
                  <div className="full ptar-section-head" style={{ marginBottom: 0 }}>Contacto del sitio</div>
                  {/* ORDEN (usuario, 2026-11-18): teléfono (lo obligatorio) · email · nombre y
                      apellidos, que es opcional y va el último. El nombre sigue SIEMPRE a la
                      vista, sin plegar, como en los contactos que se añaden. */}
                  <div className={marcada && !telOk ? 'sitio-f-falta' : undefined}><label>Teléfono <Req /></label>
                    <CampoTelefono valor={f.telefono} onCambio={(v) => set(p, { telefono: v })} /></div>
                  {/* La explicación del email va en un tooltip ⓘ (usuario, 2026-11-10). */}
                  <div><label>Email <Req util /> <Tip texto="Con email avisamos al sitio de cada recogida y entrega: operativa más ágil y mejor imagen ante proveedores y clientes." aria="Por qué el email es muy útil" /></label>
                    <input type="text" inputMode="email" value={f.contactoEmail} placeholder="Ej. nombre@empresa.com" onChange={(e) => set(p, { contactoEmail: e.target.value })} /></div>
                  <div><label>Nombre y apellidos <Req si={false} /></label>
                    <input value={f.contacto} placeholder="Persona de contacto" onChange={(e) => set(p, { contacto: e.target.value })} /></div>
                  {/* Contactos ADICIONALES del sitio (usuario, 2026-11-10): mismo botón fino
                      que en la ficha de Sitios; se crean en la agenda del sitio al guardar. */}
                  {!f.nuevo && (ed?.extra ?? []).map((x, xi) => (
                    <div className="full" key={xi} style={{ border: '1.5px solid var(--gray-200)', borderRadius: 12, padding: '0.7rem 0.8rem', background: 'var(--gray-50)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.45rem' }}>
                        <strong style={{ fontSize: 'var(--fs-m)', color: 'var(--navy)' }}>Contacto {xi + 2}</strong>
                        <button type="button" className="btn-ghost" style={{ minHeight: 30, padding: '0 0.6rem', color: '#dc2626' }}
                          onClick={() => set(p, { extra: (ed?.extra ?? []).filter((_, j) => j !== xi) })}>Quitar</button>
                      </div>
                      <div className="ptar-sitio-grid ptar-sitio-grid-auto">
                        <div><label>Teléfono <Req si={false} /></label>
                          <CampoTelefono valor={x.telefono} onCambio={(v) => setExtra(p, xi, { telefono: v })} /></div>
                        {/* El email, «Muy útil» con su ⓘ, igual que en el primer contacto (usuario, 2026-11-17). */}
                        <div><label>Email <Req util /> <Tip texto="Con email avisamos al sitio de cada recogida y entrega: operativa más ágil y mejor imagen ante proveedores y clientes." aria="Por qué el email es muy útil" /></label>
                          <input type="text" inputMode="email" value={x.email} placeholder="Ej. nombre@empresa.com" onChange={(e) => setExtra(p, xi, { email: e.target.value })} /></div>
                        <div><label>Nombre y apellidos <Req si={false} /></label>
                          <input value={x.nombre} placeholder="Persona de contacto" onChange={(e) => setExtra(p, xi, { nombre: e.target.value })} /></div>
                      </div>
                    </div>
                  ))}
                  {!f.nuevo && (ed?.extra ?? []).length < 5 && <div className="full">
                    <button type="button" className="campo-plegado btn-mas-contacto" onClick={() => set(p, { extra: [...(ed?.extra ?? []), { nombre: '', telefono: '', email: '' }] })}>
                      <span className="cp-ico" aria-hidden="true">+</span><span className="cp-txt">Añadir contacto adicional</span>
                    </button>
                  </div>}
                  {/* Horario REPLEGADO con resumen, igual que en la ficha de Sitios
                      (usuario, 2026-11-09): pulsando se abre el editor. */}
                  <div className="full">
                    <button type="button" className="campo-plegado" aria-expanded={horAbierto.has(p.k)} onClick={() => toggleHor(p.k)}>
                      <span className="cp-ico" aria-hidden="true">{horAbierto.has(p.k) ? '−' : '+'}</span>
                      <span className="cp-txt">Horario de carga y descarga<span className="cp-val">· {resumenHorario(f.horario) || 'sin definir'}{f.verano.activo ? ' · verano activo' : ''}{ed?.cita ? ` · cita previa ${ed.citaHora ?? '08:00'}` : ''}</span></span>
                    </button>
                  </div>
                  {/* El MISMO bloque que la ficha de Sitios (usuario, 2026-11-16): pestañas
                      «Horario general» y «Horario de verano». Se guarda en el sitio. */}
                  {horAbierto.has(p.k) && <div className="full ptar-sitio-grid" style={{ marginTop: '-0.1rem' }}>
                    {/* La cita previa va DENTRO del horario, antes de sus pestañas (usuario,
                        2026-11-17); si está puesta, se lee también en el resumen plegado. */}
                    {citaBloque}
                    <HorarioSitio horario={f.horario} verano={f.verano} onHorario={(g) => set(p, { horario: g })} onVerano={(v) => set(p, { verano: v })} />
                  </div>}
                  {/* Las indicaciones del sitio, justo DESPUÉS del horario y sin título propio
                      (usuario, 2026-11-16). */}
                  {!f.nuevo && fijos(p, f, false)}
                  {/* El enlace de Google Maps NO se muestra ni se edita aquí (usuario,
                      2026-11-09): se gestiona en la sección Sitios y se conserva al guardar. */}
                </>)}
              </div>
            </div>
            {/* DETALLE DE MERCANCÍA de esta parada (usuario, 2026-11-09): al pie de la
                caja y SIEMPRE visible (fuera del desplegable de los datos del sitio).
                Su texto va a las anotaciones de ESA parada al crear el envío. */}
            <div className="ptar-sitio-merc">
              {/* PLEGADO Y CON TEXTO: solo el propio texto, como enlace; al pulsarlo se abre con
                  su título y el campo para cambiarlo (usuario, 2026-11-17). Sin texto todavía,
                  el botón de siempre para añadirlo. */}
              {!opcAbiertos.has(`${p.k}:merc`) && f.mercancia.trim() !== '' ? (
                <button type="button" className="ptar-sitio-merc-link" aria-expanded={false} onClick={() => toggleOpc(`${p.k}:merc`)}
                  title={`${rec ? 'Recogida' : 'Entrega'}: pulsa para cambiar el detalle de mercancía o las anotaciones`}>
                  {/* La misma flecha que al abrirlo, pero hacia abajo: se ve que se despliega (usuario, 2026-11-21). */}
                  <span className="cp-ico" aria-hidden="true"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg></span>
                  <span className="ptar-sitio-merc-link-txt">{f.mercancia}</span>
                </button>
              ) : (<>
                <button type="button" className="campo-plegado" aria-expanded={opcAbiertos.has(`${p.k}:merc`)} onClick={() => toggleOpc(`${p.k}:merc`)}>
                  <span className="cp-ico" aria-hidden="true"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg></span>
                  {/* «Recogida» / «Entrega» en negrita y lo del paréntesis sin negrita (usuario, 2026-11-21). */}
                  <span className="cp-txt"><strong>{rec ? 'Recogida' : 'Entrega'}</strong> <span style={{ fontWeight: 400 }}>(Añadir detalle de mercancía y/o anotaciones)</span> <Req si={false} /></span>
                </button>
                {opcAbiertos.has(`${p.k}:merc`) && <div style={{ marginTop: '0.45rem' }}>
                  <textarea className="campo-texto" rows={2} value={f.mercancia}
                    placeholder={rec ? 'Ej. aquí se cargan 4 palets de recambios, 1 caja de 2×1 m…' : 'Ej. aquí se entregan 2 de los 6 palets…'}
                    onChange={(e) => set(p, { mercancia: e.target.value })} /></div>}
              </>)}
            </div>
          </div>
        );
      })}
    </div>
  );
}
