'use client';

// Ficha del envío para el CLIENTE (etapa B): el "Ver detalle" de dashboard.html con lo que
// le toca ver (mis_envios(): sin precio del transportista, ni margen, ni factor; regla 11
// aplicada). Si es una solicitud, aquí acepta o rechaza el precio. Puede cancelar mientras
// el camión no va hacia la carga, reportar una incidencia y repetir el envío.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useRefrescar } from '@/lib/useRefrescar';
import DatosCmr from './DatosCmr';
import Modal from './Modal';
import Documentos from './Documentos';
import Cargando from '@/components/Cargando';
import CondicionesGenerales from '@/components/CondicionesGenerales';
import { euros, fecha, ventana } from '@/lib/formato';
import { creadoTxt, estadoVisual } from '@/lib/envios';
import { paisDe, telBonito } from '@/lib/paises';
import { responderPrecio, contraofertarPrecio, cancelarMiEnvio, marcarMiEnvioManual, valorarMiEnvio } from '@/app/panel/(app)/envios/acciones-cliente';
import { PedirCambio, LlamarCambio } from './CambiosEnvio';
import AvisoSiniestro from '@/components/AvisoSiniestro';
import Historial from './Historial';
import { enlaceCmrPropio } from '@/app/panel/(app)/envios/acciones-transportista';

const HITOS: Record<string, string> = {
  creado: 'Solicitud creada', confirmado: 'Envío confirmado', transportista_asignado: 'Transportista asignado',
  matricula_asignada: 'Camión asignado', cargado: 'Cargado · en ruta', entregado: 'Entregado', cancelado: 'Cancelado',
  cancelacion_deshecha: 'Cancelación deshecha', ruta_cambiada: 'Ruta cambiada', cmr_firmado: 'CMR firmado',
};
const txtNum = (n: number | null | undefined) => (n == null ? '' : String(n).replace('.', ','));
const I = ({ d }: { d: string[] }) => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: '0.35rem' }}>
    {d.map((x, i) => <path key={i} d={x} />)}
  </svg>
);
const ICO = {
  ojo: ['M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z', 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z'],
  aviso: ['M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z', 'M12 9v4', 'M12 17h.01'],
  x: ['M18 6 6 18', 'M6 6l12 12'],
  repetir: ['M17 1l4 4-4 4', 'M3 11V9a4 4 0 0 1 4-4h14', 'M7 23l-4-4 4-4', 'M21 13v2a4 4 0 0 1-4 4H3'],
  check: ['M20 6 9 17l-5-5'],
  firma: ['M12 20h9', 'M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z'],
  doc: ['M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z', 'M14 2v6h6', 'M16 13H8', 'M16 17H8'],
};
function Celda({ l, children, span }: { l: string; children: React.ReactNode; span?: boolean }) {
  return <div style={span ? { gridColumn: '1/-1' } : undefined}><label>{l}</label><span className="v">{children ?? '—'}</span></div>;
}
const Pend = () => <span style={{ color: 'var(--gray-500)', fontStyle: 'italic', fontWeight: 500 }}>Pendiente</span>;

export default function FichaEnvioCliente({ e, cerrarHref }: { e: any; cerrarHref: string }) {
  const router = useRouter();
  const refrescar = useRefrescar();
  const [vista, setVista] = useState<'ficha' | 'cancelar' | 'condiciones' | 'llamar'>('ficha');
  const [aviso, setAviso] = useState<{ ok: boolean; txt: string } | null>(null);
  const [trabajando, setTrabajando] = useState<string | null>(null);
  const [acepto, setAcepto] = useState(false);
  const [motivo, setMotivo] = useState('');
  const cerrar = () => router.push(cerrarHref, { scroll: false });
  const ev = estadoVisual(e);
  const manual = !!e.es_manual;
  const paradas: any[] = e.paradas ?? [];
  const recogidas = paradas.filter((p) => p.tipo === 'carga'), entregas = paradas.filter((p) => p.tipo === 'descarga');
  const pc = e.importe_cliente != null ? Number(e.importe_cliente) : null;
  const iva = Number(e.iva_aplicado ?? 21);
  const pendientePrecio = e.estado === 'borrador' && e.solicitud_estado === 'pendiente_precio';
  const porAceptar = e.estado === 'borrador' && e.solicitud_estado === 'precio_propuesto';
  const enContraoferta = e.estado === 'borrador' && e.solicitud_estado === 'contraoferta';
  const [miPrecio, setMiPrecio] = useState('');
  const [proponer, setProponer] = useState(false);
  const caducado = porAceptar && e.precio_valido_hasta && new Date(e.precio_valido_hasta) < new Date();
  const cancelable = ['borrador', 'programado'].includes(e.estado);

  async function hacer(texto: string, fn: () => Promise<{ ok: boolean; error?: string; aviso?: string }>) {
    setTrabajando(texto); setAviso(null);
    const r = await fn();
    setTrabajando(null);
    setAviso({ ok: r.ok, txt: (r.ok ? r.aviso : r.error) ?? (r.ok ? 'Hecho.' : 'No se ha podido hacer.') });
    if (r.ok) { setVista('ficha'); refrescar(); }
    return r.ok;
  }

  if (vista === 'condiciones') {
    return (
      <Modal abierto ancho={760} onCerrar={() => setVista('ficha')} titulo="Condiciones generales de transporte"
        pie={<button className="btn-primary" onClick={() => setVista('ficha')}>Volver al envío</button>}>
        <CondicionesGenerales />
      </Modal>
    );
  }
  if (vista === 'llamar') return <LlamarCambio e={e} onVolver={() => setVista('ficha')} />;
  if (vista === 'cancelar') {
    return (
      <Modal abierto onCerrar={() => setVista('ficha')} titulo={`Cancelar envío #${e.referencia_gx}`} icono={<I d={ICO.aviso} />}
        pie={<>
          <button className="btn-ghost" onClick={() => setVista('ficha')} disabled={!!trabajando}>No, volver</button>
          <button className="btn-primary" style={{ background: 'var(--red)' }} disabled={!!trabajando} onClick={() => hacer('Cancelando', () => cancelarMiEnvio(e.id, motivo))}>Sí, cancelar</button>
        </>}>
        {trabajando && <Cargando texto={trabajando} />}
        <div className="modal-warn-box">
          {e.estado === 'borrador'
            ? <>Es una solicitud sin confirmar: se cancela <strong>sin ningún coste</strong>.</>
            : <>Cancelar es <strong>gratis hasta las 9:00 del día hábil anterior</strong> a la carga. Después, si ya hay camión asignado, puede conllevar el <strong>coste del servicio completo</strong> (por ley, el transportista está en su derecho de cobrarlo). Si tienes dudas, llámanos al <a href="tel:+34955225945" style={{ fontWeight: 700 }}>+34 955 225 945</a>.</>}
        </div>
        <label htmlFor="cc-motivo" style={{ display: 'block', marginTop: '0.8rem' }}>Motivo <span style={{ color: 'var(--gray-500)', fontWeight: 600 }}>· opcional</span></label>
        <textarea id="cc-motivo" rows={3} maxLength={500} value={motivo} onChange={(ev) => setMotivo(ev.target.value)} placeholder="Cuéntanos por qué (nos ayuda a mejorar)" />
        {aviso && !aviso.ok && <div className="pt-aviso error" style={{ marginTop: '0.8rem' }}><div>{aviso.txt}</div></div>}
      </Modal>
    );
  }

  async function abrirCmr() {
    const w = window.open('about:blank', '_blank');
    setTrabajando('Abriendo el CMR');
    const r = await enlaceCmrPropio(e.id);
    setTrabajando(null);
    if (!r.ok) { w?.close(); setAviso({ ok: false, txt: r.error }); return; }
    if (w) w.location.href = `/cmr/${r.token}`; else window.location.href = `/cmr/${r.token}`;
  }

  const FASES_M: [string, string][] = [['programado', 'Programado'], ['hacia_la_carga', 'Hacia la carga'], ['cargando', 'Cargando'], ['en_ruta', 'En ruta'], ['entregado', 'Entregado']];
  const acciones = (
    <>
      {manual && e.estado !== 'cancelado' && <a className="btn-secondary" href={`/panel/envios/${e.id}/orden-de-carga`} target="_blank" rel="noopener"><I d={ICO.doc} />Orden de transporte (PDF)</a>}
      {!manual && ['programado', 'hacia_la_carga', 'cargando', 'en_ruta', 'entregado'].includes(e.estado) && <button className="btn-secondary" onClick={abrirCmr} disabled={!!trabajando}><I d={ICO.firma} />CMR digital</button>}
      {cancelable && <button className="btn-secondary" onClick={() => setVista('cancelar')}><I d={ICO.x} />{e.estado === 'borrador' ? 'Cancelar solicitud' : 'Cancelar envío'}</button>}
      {!pendientePrecio && !porAceptar && <a className="btn-secondary" href={`/panel/incidencias?nueva=${e.id}`}><I d={ICO.aviso} />Reportar incidencia</a>}
      {!manual && <a className="btn-secondary" href={`/panel/nuevo-envio?repetir=${e.id}`}><I d={ICO.repetir} />Repetir envío</a>}
    </>
  );

  return (
    <Modal abierto ancho={760} onCerrar={cerrar} titulo={`Detalle de envío #${e.referencia_gx}`}
      sub={<span className={`badge badge-${ev.color}`}>{ev.label}</span>} icono={<I d={ICO.ojo} />} acciones={acciones}
      pie={<button className="btn-ghost" onClick={cerrar}>Cerrar</button>}>
      {trabajando && <Cargando texto={trabajando} />}
      {aviso && <div className={`pt-aviso ${aviso.ok ? 'info' : 'error'}`} role="status" style={{ marginBottom: '0.8rem' }}><div>{aviso.txt}</div></div>}

      {manual && e.estado !== 'cancelado' && (
        <div className="det-block" style={{ marginBottom: '0.6rem' }}>
          <label htmlFor="em-estado" style={{ display: 'block', marginBottom: '0.3rem', fontSize: 'var(--fs-m)', fontWeight: 700, color: 'var(--gray-700)' }}>Estado del envío <span style={{ color: 'var(--gray-500)', fontWeight: 600 }}>· lo llevas tú (es con tu operador)</span></label>
          <select id="em-estado" className="ptar-select" value={e.estado} disabled={!!trabajando}
            onChange={(ev) => hacer('Guardando', () => marcarMiEnvioManual(e.id, ev.target.value))}>
            {FASES_M.map(([k, t]) => <option key={k} value={k}>{t}</option>)}
          </select>
        </div>
      )}
      {e.pago && e.estado !== 'cancelado' && <PagoCliente e={e} />}
      {!manual && <PedirCambio e={e} cambio={e.cambio} hacer={hacer} onLlamar={() => setVista('llamar')} />}
      {!manual && ['cargando', 'en_ruta'].includes(e.estado) && <AvisoSiniestro quien="cliente" incidenciaHref={`/panel/incidencias?nueva=${e.id}&tipo=siniestro`} />}
      {enContraoferta && (
        <div className="pt-aviso info"><div><strong>Has propuesto {euros(Number(e.contraoferta?.propuesta ?? 0))}</strong> (sin IVA) frente a nuestros {euros(pc)}. Lo estamos revisando y te contestamos aquí. Si no la aceptamos, volverás a ver nuestro precio para aceptarlo o cancelar sin coste.</div></div>
      )}
      {pendientePrecio && (
        <div className="pt-aviso info"><div><strong>Estamos calculando tu precio.</strong> Te lo pasamos en menos de 25 minutos (en horario de oficina) y te aparecerá aquí para aceptarlo. Hasta que lo aceptes no hay ningún compromiso.</div></div>
      )}
      {porAceptar && (
        <div className="det-block" style={{ borderColor: 'var(--purple)' }}>
          <div className="alm-price" style={{ margin: 0 }}>
            <div className="alm-price-row alm-price-base"><span className="k">Precio de tu envío (base imponible)</span><span className="v">{euros(pc)}</span></div>
            <div className="alm-price-row alm-price-sub"><span className="k">IVA ({txtNum(iva)} %)</span><span className="v">{euros((pc ?? 0) * iva / 100)}</span></div>
            <div className="alm-price-row alm-price-sub"><span className="k">Total (IVA incl.)</span><span className="v">{euros((pc ?? 0) * (1 + iva / 100))}</span></div>
          </div>
          {caducado ? (
            <div className="pt-aviso" style={{ marginTop: '0.7rem', marginBottom: 0 }}><div>Este precio ha <strong>caducado</strong> (los precios del transporte cambian cada día). Pulsa «Aceptar» y te pasamos uno nuevo al momento, o llámanos.</div></div>
          ) : e.precio_valido_hasta && (
            <p style={{ fontSize: 'var(--fs-m)', color: 'var(--gray-500)', margin: '0.6rem 0 0' }}>Precio válido hasta el {creadoTxt(e.precio_valido_hasta)}.</p>
          )}
          <label className="ptar-confirm-check" style={{ marginTop: '0.7rem' }}>
            <input type="checkbox" checked={acepto} onChange={(ev) => setAcepto(ev.target.checked)} />
            <span>He leído y acepto las <a href="#" className="ptar-inline-link" onClick={(ev) => { ev.preventDefault(); setVista('condiciones'); }}>condiciones generales de transporte</a>. Al aceptar, el envío queda <strong>programado</strong> y buscamos el camión.</span>
          </label>
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.8rem', flexWrap: 'wrap' }}>
            <button className="btn-primary" disabled={!acepto || !!trabajando} onClick={() => hacer('Confirmando el envío', () => responderPrecio(e.id, true))}><I d={ICO.check} />Aceptar precio y confirmar envío</button>
            <button className="btn-ghost" disabled={!!trabajando} onClick={() => hacer('Rechazando', () => responderPrecio(e.id, false))}>Rechazar</button>
            {e.contraoferta?.permitida && !caducado && !proponer && <button className="btn-ghost" disabled={!!trabajando} onClick={() => setProponer(true)}>Proponer otro precio</button>}
          </div>
          {proponer && (
            <div style={{ marginTop: '0.8rem', paddingTop: '0.7rem', borderTop: '1px solid var(--gray-200)' }}>
              <label htmlFor="cf-precio" style={{ fontWeight: 700 }}>Tu precio (sin IVA, €)</label>
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.3rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <input id="cf-precio" type="text" inputMode="decimal" value={miPrecio} onChange={(ev) => setMiPrecio(ev.target.value)} placeholder="Ej. 950" style={{ maxWidth: 160 }} />
                <button className="btn-primary" disabled={!acepto || !!trabajando || !(Number(miPrecio.replace(',', '.')) > 0)}
                  onClick={() => hacer('Enviando tu propuesta', () => contraofertarPrecio(e.id, Number(miPrecio.replace(',', '.'))))}>Enviar mi propuesta</button>
                <button className="btn-ghost" onClick={() => setProponer(false)}>Volver</button>
              </div>
              <p style={{ fontSize: 'var(--fs-s)', color: 'var(--gray-500)', margin: '0.4rem 0 0' }}>Marca antes la casilla de las condiciones. Si tu precio se acerca al nuestro, se acepta al momento; si no, lo revisamos y te contestamos aquí. Hasta entonces, el nuestro sigue en pie.</p>
            </div>
          )}
        </div>
      )}

      <h4 className="modal-section-title">Solicitud</h4>
      <div className="det-block"><div className="modal-info-grid">
        <Celda l="Nº de envío">#{e.referencia_gx}</Celda>
        <Celda l="Tu referencia">{e.referencia_cliente || '—'}</Celda>
        <Celda l="Estado">{ev.label}</Celda>
        <Celda l="Creado">{creadoTxt(e.creado_en)}</Celda>
        <Celda l={e.fecha_carga_real ? 'Fecha de carga' : 'Días de recogida'}>{e.fecha_carga_real ? fecha(e.fecha_carga_real) : ventana(e.fecha_carga_desde, e.fecha_carga_hasta)}</Celda>
        <Celda l="Entrega estimada">{e.fecha_entrega_estimada ? fecha(e.fecha_entrega_estimada) : <Pend />}</Celda>
        {e.discrecion_comercial && <Celda l="Discreción comercial" span>Activada: el conductor no revela el destino en la carga ni el origen en la entrega</Celda>}
      </div></div>

      {!manual && !pendientePrecio && !porAceptar && e.estado !== 'cancelado' && <>
        <h4 className="modal-section-title">Transporte</h4>
        <div className="det-block"><div className="modal-info-grid">
          <Celda l="Camión">{e.matricula_camion ? <span className="dtc-mat">{e.matricula_camion}</span> : <Pend />}{e.matricula_remolque ? <> · <span className="dtc-mat">{e.matricula_remolque}</span></> : null}</Celda>
          <Celda l="Conductor">{e.conductor_nombre || (e.estado === 'entregado' ? '—' : <Pend />)}</Celda>
          <Celda l="Teléfono del conductor" span>
            {e.estado === 'entregado' ? <span style={{ color: 'var(--gray-500)' }}>No disponible: el envío ya está entregado</span>
              : e.conductor_telefono ? <a href={`tel:${e.conductor_telefono}`} style={{ color: 'var(--purple)', fontWeight: 600 }}>{telBonito(e.conductor_telefono)}</a> : <Pend />}
          </Celda>
        </div></div>
      </>}

      <h4 className="modal-section-title">Ruta</h4>
      <div className="det-ruta">
        {[...recogidas.map((p, i) => ({ p, cls: 'rec', num: i + 1, label: `Recogida ${i + 1}` })), ...entregas.map((p, i) => ({ p, cls: 'ent', num: i + 1, label: `Entrega ${i + 1}` }))].map(({ p, cls, num, label }) => (
          <div key={p.id} className="det-punto">
            <div className="det-punto-head"><span className={`ptar-route-num ${cls}`}>{num}</span><span className="det-punto-label">{label}</span></div>
            <div className="det-punto-body">
              {p.nombre_empresa && <><strong>{p.nombre_empresa}</strong><br /></>}
              {[p.direccion, [p.codigo_postal, p.poblacion].filter(Boolean).join(' '), p.provincia && p.provincia !== p.poblacion ? p.provincia : '', paisDe(p.pais_codigo_iso ?? 'ES')].filter(Boolean).join(', ')}
              {p.referencia && <div style={{ fontSize: 'var(--fs-m)', marginTop: 2 }}>Referencia: <strong>{p.referencia}</strong></div>}
            </div>
          </div>
        ))}
      </div>

      <h4 className="modal-section-title">Mercancía</h4>
      <div className="det-block"><div className="modal-info-grid">
        <Celda l="Mercancía">{e.descripcion_mercancia || (e.paletizado === false ? 'No paletizada' : 'Paletizada')}</Celda>
        <Celda l="Medidas">{[e.metros_lineales != null && `${txtNum(e.metros_lineales)} m`, e.toneladas != null && `${txtNum(e.toneladas)} Tn`].filter(Boolean).join(' · ') || '—'}</Celda>
        <Celda l="Requisitos" span>{[e.plataforma_elevadora && 'Trampilla elevadora', e.nima_requerido && 'Requiere NIMA', e.adr && 'Mercancía ADR'].filter(Boolean).join(' · ') || 'Ninguno'}</Celda>
        {e.anotaciones_cliente && <Celda l="Anotaciones" span>{e.anotaciones_cliente}</Celda>}
        {e.estado !== 'cancelado' && <DatosCmr envioId={e.id} puedeEditar={['borrador', 'programado', 'hacia_la_carga'].includes(e.estado)} bloquearSiFirmado />}
      </div></div>

      {!porAceptar && <>
        <h4 className="modal-section-title">Precio</h4>
        <div className="det-block">
          {manual ? (
            <div className="modal-info-grid"><Celda l="Precio acordado con tu transportista (sin IVA)" span>{e.precio_acordado_operador != null ? euros(e.precio_acordado_operador) : 'No anotado'}</Celda></div>
          ) : pc == null ? <div className="modal-info-grid"><Celda l="Precio" span>{pendientePrecio ? 'Lo estamos calculando' : <Pend />}</Celda></div> : (
            <div className="alm-price" style={{ margin: 0 }}>
              <div className="alm-price-row alm-price-base"><span className="k">Base imponible</span><span className="v">{euros(pc)}</span></div>
              <div className="alm-price-row alm-price-sub"><span className="k">IVA ({txtNum(iva)} %)</span><span className="v">{euros(pc * iva / 100)}</span></div>
              <div className="alm-price-row alm-price-sub"><span className="k">Total (IVA incl.)</span><span className="v">{euros(pc * (1 + iva / 100))}</span></div>
            </div>
          )}
        </div>
      </>}

      {!pendientePrecio && !porAceptar && <>
        <h4 className="modal-section-title">Documentos</h4>
        <div className="det-block">
          <Documentos dueno={{ campo: 'envio_id', id: e.id }} tipos={['albaran', 'cmr_firmado', 'otro']} editable={false}
            ayuda={<>El albarán y el CMR firmado aparecen aquí en cuanto los tengamos.</>} />
        </div>
      </>}

      {e.valoracion?.puede && <ValorarTransportista envio={e.id} v={e.valoracion} onHecho={() => refrescar()} />}

      {(e.hitos ?? []).length > 0 && <>
        <h4 className="modal-section-title">Historial</h4>
        <div className="pen-envio-sum">
          {(e.hitos as any[]).filter((h) => HITOS[h.hito]).map((h) => (
            <div key={h.id} className="pen-sum-row"><span className="k" style={{ whiteSpace: 'nowrap' }}>{creadoTxt(h.cuando)}</span><span className="v" style={{ textAlign: 'right' }}>{HITOS[h.hito]}</span></div>
          ))}
        </div>
      </>}
      <Historial tabla="envios" id={e.id} />
    </Modal>
  );
}

// ---- El cliente puntúa al transportista (envío de Dynamo entregado) ----------------------
function ValorarTransportista({ envio, v, onHecho }: { envio: string; v: { nota: number | null; comentario: string | null; editable: boolean }; onHecho: () => void }) {
  const [nota, setNota] = useState<number | null>(v.nota ?? null);
  const [com, setCom] = useState(v.comentario ?? '');
  const [msg, setMsg] = useState<{ ok: boolean; txt: string } | null>(null);
  const [trabajando, setTrabajando] = useState(false);
  const cambiado = nota !== (v.nota ?? null) || com !== (v.comentario ?? '');
  async function guardar() {
    if (!nota) { setMsg({ ok: false, txt: 'Elige de 1 a 5 estrellas.' }); return; }
    setMsg(null); setTrabajando(true);
    const r = await valorarMiEnvio(envio, nota, com);
    setTrabajando(false);
    setMsg(r.ok ? { ok: true, txt: r.aviso ?? 'Valoración guardada.' } : { ok: false, txt: r.error });
    if (r.ok) onHecho();
  }
  return <>
    <h4 className="modal-section-title">¿Qué tal el transportista?</h4>
    <div className="det-block">
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', flexWrap: 'wrap' }}>
        <div className="valora-estrellas" role="radiogroup" aria-label="Nota de 1 a 5">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" role="radio" aria-checked={nota === n} aria-label={`${n} de 5`} disabled={!v.editable}
              className={nota != null && n <= nota ? 'on' : ''} onClick={() => setNota(n)}>★</button>
          ))}
        </div>
        <span style={{ fontSize: 'var(--fs-m)', color: 'var(--gray-500)' }}>{nota ? `${nota} de 5` : 'Puntúa de 1 a 5 estrellas'}</span>
      </div>
      {v.editable ? <>
        <textarea rows={2} maxLength={500} style={{ marginTop: '0.6rem', width: '100%' }} placeholder="Cuéntanos qué tal (puntualidad, trato, cuidado de la mercancía…) · opcional"
          value={com} onChange={(ev) => setCom(ev.target.value)} />
        <div style={{ marginTop: '0.5rem' }}>
          <button className="btn-primary" disabled={!cambiado || trabajando} onClick={guardar}>{v.nota ? 'Cambiar valoración' : 'Enviar valoración'}</button>
        </div>
        <p style={{ fontSize: 'var(--fs-s)', color: 'var(--gray-500)', margin: '0.4rem 0 0' }}>Solo la ve el equipo de Dynamo. Puedes cambiarla durante 30 días.</p>
      </> : (v.comentario && <p style={{ margin: '0.4rem 0 0', fontSize: 'var(--fs-m)', color: 'var(--gray-700)' }}>«{v.comentario}»</p>)}
      {msg && <div className={msg.ok ? 'pt-aviso info' : 'wiz-warn show'} style={{ marginTop: '0.5rem' }} role="status"><div>{msg.txt}</div></div>}
      {trabajando && <Cargando texto="Guardando tu valoración" />}
    </div>
  </>;
}

// Previo pago, visto por el cliente: qué falta, el total, la proforma y cómo pagar.
function PagoCliente({ e }: { e: any }) {
  const p = e.pago;
  const total = euros(Number(p.total));
  if (p.pago_previo === 'pendiente') {
    return (
      <div className="modal-warn-box" style={{ marginBottom: '0.8rem' }}>
        {e.pagoVuelta === 'ok' && <div style={{ color: '#0f6b3a', fontWeight: 800, marginBottom: '0.4rem' }}>Pago con tarjeta hecho. En unos segundos se confirma aquí (recarga si no cambia).</div>}
        {(e.pagoVuelta === 'error' || e.pagoVuelta === 'no_disponible') && <div style={{ color: '#b42318', fontWeight: 700, marginBottom: '0.4rem' }}>No se ha podido abrir el pago con tarjeta. Prueba otra vez en un momento o paga por transferencia.</div>}
        {e.pagoVuelta === 'caducado' && <div style={{ color: '#b42318', fontWeight: 700, marginBottom: '0.4rem' }}>Ha pasado el plazo para pagar este envío: se va a anular. Vuelve a pedirlo con «Repetir envío».</div>}
        {e.pagoVuelta === 'cancelado' && <div style={{ fontWeight: 700, marginBottom: '0.4rem' }}>Has salido del pago con tarjeta sin pagar. Puedes intentarlo de nuevo o pagar por transferencia.</div>}
        <div><strong style={{ color: '#b42318' }}>Pendiente de pago · {total}</strong> (IVA incluido).</div>
        <div style={{ marginTop: '0.3rem' }}>{p.pago_motivo?.startsWith('Primer') ? 'Es tu primer envío con nosotros: ' : ''}este envío se paga por adelantado. <strong>Lo asignamos a un camión en cuanto recibimos el pago.</strong></div>
        {p.pago_limite && <div style={{ marginTop: '0.3rem' }}>Paga antes del <strong>{creadoTxt(p.pago_limite)}</strong>. Si no nos llega el pago, el envío se anula solo y tendrás que volver a pedirlo (con el precio de ese momento).</div>}
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.7rem', flexWrap: 'wrap' }}>
          {e.tarjeta
            ? <form action="/api/stripe/pago" method="post"><input type="hidden" name="envio" value={e.id} /><button type="submit" className="btn-primary">Pagar {total} con tarjeta</button></form>
            : null}
          <a className="btn-secondary" href={`/panel/envios/${e.id}/proforma`} target="_blank" rel="noopener">Ver proforma (transferencia)</a>
        </div>
        <div style={{ fontSize: 'var(--fs-s)', color: 'var(--gray-500)', marginTop: '0.5rem' }}>
          {e.tarjeta ? 'Con tarjeta se confirma al momento. ' : 'El pago con tarjeta estará disponible muy pronto. '}
          Por transferencia, usa los datos de la proforma y pon <strong>PRO-{e.referencia_gx}</strong> como concepto; lo validamos en horario de oficina (hasta 24 h).
        </div>
      </div>
    );
  }
  if (p.pago_previo === 'pagado') {
    return <div className="pt-aviso info" style={{ marginBottom: '0.8rem' }}><div><strong>Pagado</strong> {p.pago_metodo === 'stripe' ? 'con tarjeta' : 'por transferencia'}{p.pagado_en ? ` el ${creadoTxt(p.pagado_en)}` : ''} · {total}. Gracias: ya estamos asignando el camión.</div></div>;
  }
  return null;
}
