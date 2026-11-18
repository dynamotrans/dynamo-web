'use client';

// Cambios en un envío ya confirmado.
//  · AvisoCambiosDynamo: en la ficha de Dynamo, «revisar precio» tras cambiar la ruta y el
//    cambio que ha pedido el cliente (aceptar / rechazar con nota).
//  · modoModificar: qué hace el botón «Modificar envío» de la ficha del cliente (usuario,
//    2026-11-16). Sin transportista abre el asistente de «Nuevo envío» ya relleno: el
//    cliente lo cambia él y el precio se recalcula. Con transportista, o con el envío en
//    marcha, abre LlamarCambio, la ventana con teléfono, WhatsApp y email.
//  · PedirCambio: el aviso de un cambio pedido a la antigua (pendiente o ya contestado).
import { useState } from 'react';
import Modal from './Modal';
import { CONTACTO } from '@/lib/atencion';
import { ventana, fechaHora } from '@/lib/formato';

import { resolverCambio } from '@/app/panel/(app)/envios/acciones';
import { enMarcha } from '@/lib/estados';

type Hacer = (texto: string, fn: () => Promise<{ ok: boolean; error?: string; aviso?: string }>) => Promise<boolean> | Promise<void> | void;
// El cambio pedido por el cliente (jsonb envios.cambio_cliente).
type CambioCliente = { fecha_desde?: string | null; fecha_hasta?: string | null; detalle?: string | null; con_camion?: boolean; tarde?: boolean;
  antes_desde?: string | null; antes_hasta?: string | null };
type EnvioCambio = { id: string; estado: string; fecha_carga_desde: string | null; fecha_carga_hasta: string | null };
const fechasTxt = (c: CambioCliente | null | undefined) => c?.fecha_desde ? ventana(c.fecha_desde, c.fecha_hasta) : null;

export function AvisoCambiosDynamo({ e, hacer, onModificar }: {
  e: EnvioCambio & { requiere_revision_precio: boolean | null; estado_cambio_cliente: string | null; cambio_cliente: unknown; cambio_cliente_en: string | null };
  hacer: Hacer; onModificar: () => void;
}) {
  const [nota, setNota] = useState('');
  const c = e.cambio_cliente as CambioCliente | null;
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
          <strong>El cliente pide un cambio</strong>{e.cambio_cliente_en ? ` (${fechaHora(e.cambio_cliente_en)})` : ''}:
          {fechasTxt(c) && <> nuevas fechas de carga <strong>{fechasTxt(c)}</strong> (ahora {ventana(e.fecha_carga_desde, e.fecha_carga_hasta)}).</>}
          {c.detalle && <div style={{ marginTop: '0.3rem' }}>«{c.detalle}»</div>}
          {c.con_camion && <div style={{ marginTop: '0.3rem', color: '#b42318', fontWeight: 700 }}>Ya tiene camión asignado: confírmalo con el transportista antes de aceptar.</div>}
          {c.tarde && <div style={{ marginTop: '0.3rem', color: '#b42318', fontWeight: 700 }}>Lo pidió pasada la hora límite para cancelar gratis: si aceptas otras fechas, después podrá cancelar sin coste.</div>}
          <textarea className="campo-texto" rows={3} value={nota} onChange={(ev) => setNota(ev.target.value)} maxLength={500} aria-label="Nota para el cliente (opcional)" placeholder="Nota para el cliente (opcional)" style={{ marginTop: '0.5rem' }} />
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
            <button className="btn-primary" onClick={() => hacer('Aceptando', () => resolverCambio(e.id, true, nota))}>Aceptar{fechasTxt(c) ? ' (cambia las fechas)' : ''}</button>
            {c.detalle && <button className="btn-secondary" onClick={async () => { if (await hacer('Aceptando', () => resolverCambio(e.id, true, nota))) onModificar(); }}>Aceptar y aplicar el resto en «Modificar»</button>}
            <button className="btn-ghost" style={{ color: '#dc2626' }} onClick={() => hacer('Rechazando', () => resolverCambio(e.id, false, nota))}>Rechazar</button>
          </div>
          <div className="meta" style={{ marginTop: '0.3rem' }}>Si pide cambiar la ruta o afecta al precio, hazlo después con «Cambiar ruta» o «Modificar».</div>
        </div>
      )}
      {e.estado_cambio_cliente === 'aplicado' && c && (
        <div className="pt-aviso info" style={{ marginBottom: '0.8rem' }}><div>El cliente cambió las fechas de carga{e.cambio_cliente_en ? ` el ${fechaHora(e.cambio_cliente_en)}` : ''} (sin camión asignado, se aplicó solo): antes {ventana(c.antes_desde, c.antes_hasta)}.</div></div>
      )}
    </>
  );
}

// ¿Qué hace «Modificar envío» en este envío del cliente? 'form' abre el asistente, 'llamar'
// la ventana de contacto (con transportista o en marcha), 'pendiente' lo deja apagado (ya hay
// un cambio esperando respuesta) y null lo esconde (borrador, entregado, cancelado, manual).
export function modoModificar(e: { estado: string; es_manual?: boolean | null }, cambio: CambioMio | null): 'form' | 'llamar' | 'pendiente' | null {
  if (e.es_manual || !cambio) return null;
  if (enMarcha(e.estado)) return 'llamar';
  if (!cambio.modificable) return null;
  if (cambio.con_camion || cambio.precio_a_mano) return 'llamar';
  return cambio.estado === 'pendiente' ? 'pendiente' : 'form';
}
type CambioMio = { estado: string; en: string | null; nota: string | null; modificable: boolean; con_camion: boolean; precio_a_mano?: boolean | null };   // mi_cambio_envio()

export function PedirCambio({ cambio }: { cambio: CambioMio | null }) {
  // Lo que queda de los cambios «pedidos» (antes del 2026-11-16 el cliente pedía el cambio
  // y esperaba): el que siga pendiente y la respuesta al último. Ahora el cliente modifica
  // su envío él mismo con el asistente, así que aquí ya no hay formulario.
  if (!cambio) return null;
  if (cambio.estado === 'pendiente') {
    return <div className="pt-aviso info" style={{ marginBottom: '0.8rem' }}><div><strong>Has pedido un cambio</strong>{cambio.en ? ` el ${fechaHora(cambio.en)}` : ''}. Lo estamos revisando y te contestamos aquí.</div></div>;
  }
  if (cambio.estado !== 'aceptado' && cambio.estado !== 'rechazado') return null;
  return (
    <div className={`pt-aviso ${cambio.estado === 'aceptado' ? 'info' : 'error'}`} style={{ marginBottom: '0.8rem' }}><div>
      Tu último cambio ha sido <strong>{cambio.estado === 'aceptado' ? 'aceptado' : 'rechazado'}</strong>.{cambio.nota ? <> «{cambio.nota}»</> : null}
    </div></div>
  );
}

// ---- Piezas comunes de las dos ventanas «contáctanos» (cambiar / cancelar) ---------------
// Mismo diseño en las dos y un solo tamaño de letra (usuario, 2026-11-18: «texto homogéneo,
// más diseño»): el aviso arriba, los tres canales como tarjetas con su dato debajo (así no
// hace falta la línea suelta de teléfonos) y los pasos numerados.
const ICO_URG = {
  tel: 'M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z',
  wa: 'M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z',
  mail: 'M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zm18 2-10 7L2 6',
};
function CanalesUrgentes({ msg, asunto }: { msg: string; asunto: string }) {
  const canal = (clase: string, href: string, ico: string, titulo: string, dato: string, nueva = false) => (
    <a className={`urg-canal ${clase}`} href={href} target={nueva ? '_blank' : undefined} rel={nueva ? 'noopener' : undefined}>
      <span className="urg-ico" aria-hidden="true"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={ico} /></svg></span>
      <span className="urg-txt"><strong>{titulo}</strong><span className="notranslate" translate="no">{dato}</span></span>
    </a>
  );
  return (
    <div className="urg-canales">
      {canal('urg-tel', CONTACTO.telHref, ICO_URG.tel, 'Llamar ahora', CONTACTO.telefono)}
      {canal('urg-wa', `${CONTACTO.waHref}?text=${encodeURIComponent(msg)}`, ICO_URG.wa, 'WhatsApp', CONTACTO.whatsapp, true)}
      {canal('urg-mail', `mailto:${CONTACTO.email}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(msg)}`, ICO_URG.mail, 'Email', CONTACTO.email)}
    </div>
  );
}
function AvisoUrgente({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="urg-aviso" role="note">
      <span className="urg-aviso-ico" aria-hidden="true">!</span>
      <div><strong>{titulo}</strong><div>{children}</div></div>
    </div>
  );
}

// Ventana «contáctanos»: el envío ya tiene transportista (o va en marcha) y no se puede
// modificar desde aquí. Dynamo lo contrasta con el conductor; si no es viable, se cancela
// y se reasigna camión.
export function LlamarCambio({ e, onVolver, precioAMano = false }: { e: { referencia_gx: string; referencia_cliente: string | null; estado: string; corte?: string | null }; onVolver: () => void;
  precioAMano?: boolean }) {   // el precio lo fijó Dynamo a mano: ese envío solo lo modifica Dynamo (usuario, 2026-11-17)
  const ref = `#${e.referencia_gx}`;
  const corte = e.corte ? new Date(e.corte) : null;
  const dentro = corte ? Date.now() < corte.getTime() : null;
  const corteTxt = corte ? fechaHora(corte.toISOString()) : null;
  const msg = `URGENTE: necesito cambiar el envío ${ref}${e.referencia_cliente ? ` (mi ref. ${e.referencia_cliente})` : ''}. El cambio es: `;
  return (
    <Modal abierto onCerrar={onVolver} titulo={`Cambiar el envío ${ref}`} sub="Lo cambiamos nosotros: dinos qué necesitas"
      pie={<button className="btn-ghost" onClick={onVolver}>Cerrar</button>}>
      <div className="urg">
        <AvisoUrgente titulo={`${enMarcha(e.estado) ? 'Tu envío ya está en marcha' : precioAMano ? 'Este envío tiene un precio acordado con Dynamo' : 'Tu envío ya tiene transportista asignado'}: no se puede modificar desde la plataforma.`}>
          Si necesitas cambiar algo (fechas, horario, dirección, mercancía…), contáctanos cuanto antes: cuanto antes lo sepamos, más fácil es arreglarlo.
        </AvisoUrgente>
        <CanalesUrgentes msg={msg} asunto={`URGENTE · Cambio en el envío ${ref}`} />
        {precioAMano && !enMarcha(e.estado)
          ? <p className="urg-nota">Dinos qué necesitas cambiar y <strong>lo modificamos nosotros</strong>, revisando contigo el precio acordado. Modificar no tiene coste.</p>
          : <>
            <h4 className="urg-titulo">Qué pasa cuando nos llamas</h4>
            <ol className="urg-pasos">
              <li><span>Lo <strong>comprobamos con el conductor</strong> al momento.</span></li>
              <li><span>Si el cambio es posible, lo hacemos nosotros. <strong>Modificar no tiene coste.</strong> Si cambia la ruta, el precio se recalcula.</span></li>
              <li><span>Si no es posible, hay que <strong>cancelarle la carga a ese camión</strong> y buscar otro. Esa cancelación sigue las reglas de siempre: gratis hasta las 9:00 del día hábil anterior a la carga; después, puede conllevar el <strong>coste del servicio completo</strong>.</span></li>
              <li><span>Las cancelaciones fuera de plazo <strong>cuentan</strong>: si se repiten, la cuenta puede quedar suspendida.</span></li>
            </ol>
            {corteTxt && (
              <div className={`urg-plazo ${dentro === false ? 'fuera' : 'dentro'}`} id="urg-plazo">
                <span>Cancelar es gratis hasta</span>
                <strong>{corteTxt}</strong>
                <span className="urg-plazo-estado">{dentro === false ? 'Ese plazo ya ha pasado' : 'Aún estás a tiempo'}</span>
              </div>
            )}
          </>}
      </div>
    </Modal>
  );
}

// Ventana «llámanos para cancelar» (usuario, 2026-11-16): con transportista asignado, o con
// el camión ya hacia la carga, el cliente no cancela desde la plataforma. Tiene que llamar,
// y aquí ve antes lo que le va a costar: nada si aún está dentro del plazo (las 9:00 del
// día hábil anterior a la carga); pasado ese plazo o con el camión en camino, puede ser el
// coste del servicio completo.
export function LlamarCancelar({ e, onVolver }: { e: { referencia_gx: string; referencia_cliente: string | null; estado: string; corte?: string | null }; onVolver: () => void }) {
  const ref = `#${e.referencia_gx}`;
  const corte = e.corte ? new Date(e.corte) : null;
  const enCamino = enMarcha(e.estado);
  // Sin coste solo si el envío no ha empezado Y aún no ha pasado la hora límite.
  const sinCoste = !enCamino && !!corte && Date.now() < corte.getTime();
  const corteTxt = corte ? fechaHora(corte.toISOString()) : null;
  const msg = `URGENTE: necesito CANCELAR el envío ${ref}${e.referencia_cliente ? ` (mi ref. ${e.referencia_cliente})` : ''}.`;
  return (
    <Modal abierto onCerrar={onVolver} titulo={`Cancelar el envío ${ref}`} sub="Lo cancelamos nosotros: contáctanos cuanto antes"
      pie={<button className="btn-ghost" onClick={onVolver}>Cerrar</button>}>
      <div className="urg">
        <AvisoUrgente titulo={`${enCamino ? 'El camión ya va hacia la carga' : 'Tu envío ya tiene transportista asignado'}: no se puede cancelar desde la plataforma.`}>
          Para cancelarlo, contáctanos cuanto antes por teléfono, WhatsApp o email y lo cancelamos nosotros.
        </AvisoUrgente>
        {sinCoste
          ? (
            <div className="urg-plazo dentro" id="urg-plazo">
              <span>Ahora mismo cancelar <strong>no tiene coste</strong>. Es gratis hasta</span>
              <strong>{corteTxt}</strong>
              <span className="urg-plazo-estado">Aún estás a tiempo</span>
            </div>
          ) : (
            <div className="urg-plazo fuera" id="urg-plazo">
              <span>Cancelar ahora puede conllevar el <strong>coste del servicio completo</strong>.</span>
              <span>{enCamino ? 'El camión ya está en camino' : <>El plazo para cancelar gratis terminó{corteTxt ? <> el <strong>{corteTxt}</strong></> : null}</>}: por ley, el transportista está en su derecho de cobrarlo. Llámanos y vemos qué se puede hacer.</span>
            </div>
          )}
        <CanalesUrgentes msg={msg} asunto={`URGENTE · Cancelar el envío ${ref}`} />
      </div>
    </Modal>
  );
}
