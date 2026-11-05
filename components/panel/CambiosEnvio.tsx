'use client';

// Cambios en un envío ya confirmado.
//  · AvisoCambiosDynamo: en la ficha de Dynamo, «revisar precio» tras cambiar la ruta y el
//    cambio que ha pedido el cliente (aceptar / rechazar con nota).
//  · PedirCambio: en la ficha del cliente, el botón y el formulario para pedirlo (solo sin
//    camión asignado). Con camión, o con el envío en marcha: «Necesito cambiar algo» abre
//    LlamarCambio, la ventana que le pide que nos llame urgente.
import { useState } from 'react';
import Modal from './Modal';
import { CONTACTO } from '@/lib/atencion';
import { fecha, ventana, hoyMadrid } from '@/lib/formato';
import { creadoTxt } from '@/lib/envios';
import { resolverCambio } from '@/app/panel/(app)/envios/acciones';
import { pedirCambio } from '@/app/panel/(app)/envios/acciones-cliente';

type Hacer = (texto: string, fn: () => Promise<{ ok: boolean; error?: string; aviso?: string }>) => Promise<boolean> | Promise<void> | void;
const fechasTxt = (c: any) => c?.fecha_desde ? ventana(c.fecha_desde, c.fecha_hasta) : null;

export function AvisoCambiosDynamo({ e, hacer, onModificar }: { e: any; hacer: Hacer; onModificar: () => void }) {
  const [nota, setNota] = useState('');
  const c = e.cambio_cliente;
  return (
    <>
      {e.requiere_revision_precio && (
        <div className="modal-warn-box" style={{ marginBottom: '0.8rem' }}>
          <strong style={{ color: '#b42318' }}>La ruta ha cambiado: revisa el precio</strong> del cliente y del transportista (y, si ya hay camión, confírmalo con él).
          <div style={{ marginTop: '0.5rem' }}><button className="btn-primary" onClick={onModificar}>Revisar precio</button></div>
        </div>
      )}
      {e.estado_cambio_cliente === 'pendiente' && c && (
        <div className="modal-warn-box" style={{ marginBottom: '0.8rem' }}>
          <strong>El cliente pide un cambio</strong>{e.cambio_cliente_en ? ` (${creadoTxt(e.cambio_cliente_en)})` : ''}:
          {fechasTxt(c) && <> nuevas fechas de carga <strong>{fechasTxt(c)}</strong> (ahora {ventana(e.fecha_carga_desde, e.fecha_carga_hasta)}).</>}
          {c.detalle && <div style={{ marginTop: '0.3rem' }}>«{c.detalle}»</div>}
          {c.con_camion && <div style={{ marginTop: '0.3rem', color: '#b42318', fontWeight: 700 }}>Ya tiene camión asignado: confírmalo con el transportista antes de aceptar.</div>}
          <input type="text" value={nota} onChange={(ev) => setNota(ev.target.value)} maxLength={500} placeholder="Nota para el cliente (opcional)" style={{ width: '100%', marginTop: '0.5rem' }} />
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
            <button className="btn-primary" onClick={() => hacer('Aceptando', () => resolverCambio(e.id, true, nota))}>Aceptar{fechasTxt(c) ? ' (cambia las fechas)' : ''}</button>
            {c.detalle && <button className="btn-secondary" onClick={async () => { if (await hacer('Aceptando', () => resolverCambio(e.id, true, nota))) onModificar(); }}>Aceptar y aplicar el resto en «Modificar»</button>}
            <button className="btn-ghost" style={{ color: '#dc2626' }} onClick={() => hacer('Rechazando', () => resolverCambio(e.id, false, nota))}>Rechazar</button>
          </div>
          <div className="meta" style={{ marginTop: '0.3rem' }}>Si pide cambiar la ruta o afecta al precio, hazlo después con «Cambiar ruta» o «Modificar».</div>
        </div>
      )}
      {e.estado_cambio_cliente === 'aplicado' && c && (
        <div className="pt-aviso info" style={{ marginBottom: '0.8rem' }}><div>El cliente cambió las fechas de carga{e.cambio_cliente_en ? ` el ${creadoTxt(e.cambio_cliente_en)}` : ''} (sin camión asignado, se aplicó solo): antes {ventana(c.antes_desde, c.antes_hasta)}.</div></div>
      )}
    </>
  );
}

export function PedirCambio({ e, cambio, hacer, onLlamar }: { e: any; cambio: any; hacer: Hacer; onLlamar: () => void }) {
  const [abierto, setAbierto] = useState(false);
  const [desde, setDesde] = useState(e.fecha_carga_desde ?? '');
  const [hasta, setHasta] = useState(e.fecha_carga_hasta ?? e.fecha_carga_desde ?? '');
  const [detalle, setDetalle] = useState('');
  if (!cambio) return null;
  const manana = hoyMadrid(1);
  if (cambio.estado === 'pendiente') {
    return <div className="pt-aviso info" style={{ marginBottom: '0.8rem' }}><div><strong>Has pedido un cambio</strong>{cambio.en ? ` el ${creadoTxt(cambio.en)}` : ''}. Lo estamos revisando{cambio.con_camion ? ' con el transportista' : ''} y te contestamos aquí.</div></div>;
  }
  const respuesta = (cambio.estado === 'aceptado' || cambio.estado === 'rechazado') && (
    <div className={`pt-aviso ${cambio.estado === 'aceptado' ? 'info' : 'error'}`} style={{ marginBottom: '0.8rem' }}><div>
      Tu último cambio ha sido <strong>{cambio.estado === 'aceptado' ? 'aceptado' : 'rechazado'}</strong>.{cambio.nota ? <> «{cambio.nota}»</> : null}
    </div></div>
  );
  // Con camión asignado o el envío ya en marcha: no se modifica aquí, hay que llamar.
  const enMarcha = ['hacia_la_carga', 'cargando', 'en_ruta'].includes(e.estado);
  if ((cambio.modificable && cambio.con_camion) || enMarcha) {
    return (
      <>
        {respuesta}
        <div style={{ marginBottom: '0.8rem' }}><button className="btn-secondary" onClick={onLlamar}>Necesito cambiar algo</button></div>
      </>
    );
  }
  if (!cambio.modificable) return respuesta || null;
  return (
    <>
      {respuesta}
      {!abierto ? (
        <div style={{ marginBottom: '0.8rem' }}><button className="btn-secondary" onClick={() => setAbierto(true)}>Pedir un cambio</button></div>
      ) : (
        <div className="det-block" style={{ marginBottom: '0.8rem' }}>
          <div style={{ fontWeight: 800, color: 'var(--navy)', marginBottom: '0.4rem' }}>Pedir un cambio</div>
          <div className="pt-aviso" style={{ marginBottom: '0.6rem' }}><div>
            Aún no tiene camión: si solo cambias las <strong>fechas</strong>, se aplica al momento y sin coste. Si pides otra cosa, lo revisamos (el precio puede cambiar).
          </div></div>
          <div className="ptar-sitio-grid">
            <div><label htmlFor="pc-desde">Cargar desde</label><input id="pc-desde" type="date" min={manana} value={desde} onChange={(ev) => setDesde(ev.target.value)} /></div>
            <div><label htmlFor="pc-hasta">Hasta</label><input id="pc-hasta" type="date" min={desde || manana} value={hasta} onChange={(ev) => setHasta(ev.target.value)} /></div>
            <div style={{ gridColumn: '1/-1' }}>
              <label htmlFor="pc-detalle">¿Algo más? (dirección, mercancía, horario…) · opcional</label>
              <textarea id="pc-detalle" rows={3} maxLength={1000} value={detalle} onChange={(ev) => setDetalle(ev.target.value)} placeholder="Ej. la descarga pasa a ser en nuestra nave de Getafe" />
            </div>
          </div>
          <div className="meta" style={{ marginTop: '0.3rem' }}>Ahora: {ventana(e.fecha_carga_desde, e.fecha_carga_hasta)}{e.fecha_entrega_estimada ? ` · entrega prevista ${fecha(e.fecha_entrega_estimada)}` : ''}.</div>
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.6rem', flexWrap: 'wrap' }}>
            <button className="btn-primary" onClick={async () => { const r = await hacer('Enviando el cambio', () => pedirCambio(e.id, desde, hasta, detalle)); if (r !== false) setAbierto(false); }}>Enviar cambio</button>
            <button className="btn-ghost" onClick={() => setAbierto(false)}>Volver</button>
          </div>
        </div>
      )}
    </>
  );
}

// Ventana «llámanos»: el envío ya tiene camión, se está asignando, va en marcha o ha pasado
// la hora límite (9:00 del día hábil anterior), y no se puede modificar desde
// aquí. Dynamo lo contrasta con el conductor; si no es viable, se cancela y se reasigna camión.
export function LlamarCambio({ e, onVolver }: { e: any; onVolver: () => void }) {
  const ref = `#${e.referencia_gx}`;
  const corte = e.corte ? new Date(e.corte) : null;
  const dentro = corte ? Date.now() < corte.getTime() : null;
  const corteTxt = corte ? corte.toLocaleString('es-ES', { timeZone: 'Europe/Madrid', weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) : null;
  const msg = `URGENTE: necesito cambiar el envío ${ref}${e.referencia_cliente ? ` (mi ref. ${e.referencia_cliente})` : ''}. El cambio es: `;
  const btn = (href: string, txt: string, bg: string, nueva = false) => (
    <a href={href} target={nueva ? '_blank' : undefined} rel={nueva ? 'noopener' : undefined}
      style={{ background: bg, color: '#fff', fontWeight: 800, borderRadius: 8, padding: '0.6rem 1rem', textDecoration: 'none', textAlign: 'center', flex: '1 1 160px' }}>{txt}</a>
  );
  return (
    <Modal abierto onCerrar={onVolver} titulo={`Cambiar el envío ${ref}`}
      pie={<button className="btn-ghost" onClick={onVolver}>Volver al envío</button>}>
      <div className="modal-warn-box">
        <strong style={{ color: '#b42318' }}>{['hacia_la_carga', 'cargando', 'en_ruta'].includes(e.estado) ? 'Tu envío ya está en marcha'
          : dentro === false ? 'Falta muy poco para la carga' : 'Tu envío ya tiene camión o lo estamos asignando'}: no se puede modificar desde la plataforma.</strong>
        <div style={{ marginTop: '0.35rem' }}>Si necesitas cambiar algo (fechas, horario, dirección, mercancía…), <strong>llámanos URGENTE</strong>: cuanto antes lo sepamos, más fácil es arreglarlo.</div>
      </div>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', margin: '0.9rem 0' }}>
        {btn(CONTACTO.telHref, 'Llamar ahora', '#dc2626')}
        {btn(`${CONTACTO.waHref}?text=${encodeURIComponent(msg)}`, 'WhatsApp', '#16a34a', true)}
        {btn(`mailto:${CONTACTO.email}?subject=${encodeURIComponent(`URGENTE · Cambio en el envío ${ref}`)}&body=${encodeURIComponent(msg)}`, 'Email', 'var(--purple)')}
      </div>
      <div className="meta" style={{ margin: '-0.4rem 0 0.9rem' }}>Teléfono {CONTACTO.telefono} · WhatsApp {CONTACTO.whatsapp} · {CONTACTO.email}</div>
      <div style={{ fontWeight: 800, color: 'var(--navy)', marginBottom: '0.3rem' }}>Qué pasa cuando nos llamas</div>
      <ol style={{ margin: 0, paddingLeft: '1.2rem', lineHeight: 1.55, color: 'var(--gray-700)' }}>
        <li>Lo <strong>comprobamos con el conductor</strong> al momento.</li>
        <li>Si el cambio es posible, lo hacemos nosotros. <strong>Modificar no tiene coste.</strong> (Si cambia el viaje, el precio se recalcula.)</li>
        <li>Si no es posible, hay que <strong>cancelarle la carga a ese camión</strong> y buscar otro. Esa cancelación sigue las reglas de siempre:
          {corteTxt
            ? <> gratis hasta el <strong>{corteTxt}</strong>{dentro === true ? <> (<span style={{ color: '#0f6b3a', fontWeight: 700 }}>aún estás a tiempo</span>)</> : dentro === false ? <> (<span style={{ color: '#b42318', fontWeight: 700 }}>ese plazo ya ha pasado</span>)</> : null}; después, puede conllevar el <strong>coste del servicio completo</strong>.</>
            : <> gratis hasta las 9:00 del día hábil anterior a la carga; después, puede conllevar el <strong>coste del servicio completo</strong>.</>}
        </li>
        <li>Las cancelaciones fuera de plazo <strong>cuentan</strong>: si se repiten, la cuenta puede quedar suspendida.</li>
      </ol>
    </Modal>
  );
}
