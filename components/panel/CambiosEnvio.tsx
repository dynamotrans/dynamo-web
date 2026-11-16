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
  if (cambio.con_camion) return 'llamar';
  return cambio.estado === 'pendiente' ? 'pendiente' : 'form';
}
type CambioMio = { estado: string; en: string | null; nota: string | null; modificable: boolean; con_camion: boolean };   // mi_cambio_envio()

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

// Ventana «contáctanos»: el envío ya tiene transportista (o va en marcha) y no se puede
// modificar desde aquí. Dynamo lo contrasta con el conductor; si no es viable, se cancela
// y se reasigna camión.
export function LlamarCambio({ e, onVolver }: { e: { referencia_gx: string; referencia_cliente: string | null; estado: string; corte?: string | null }; onVolver: () => void }) {
  const ref = `#${e.referencia_gx}`;
  const corte = e.corte ? new Date(e.corte) : null;
  const dentro = corte ? Date.now() < corte.getTime() : null;
  const corteTxt = corte ? fechaHora(corte.toISOString()) : null;
  const msg = `URGENTE: necesito cambiar el envío ${ref}${e.referencia_cliente ? ` (mi ref. ${e.referencia_cliente})` : ''}. El cambio es: `;
  const btn = (href: string, txt: string, bg: string, nueva = false) => (
    <a href={href} target={nueva ? '_blank' : undefined} rel={nueva ? 'noopener' : undefined}
      style={{ background: bg, color: '#fff', fontWeight: 800, borderRadius: 8, padding: '0.6rem 1rem', textDecoration: 'none', textAlign: 'center', flex: '1 1 160px' }}>{txt}</a>
  );
  return (
    <Modal abierto onCerrar={onVolver} titulo={`Cambiar el envío ${ref}`}
      pie={<button className="btn-ghost" onClick={onVolver}>Cerrar</button>}>
      <div className="modal-warn-box">
        <strong style={{ color: '#b42318' }}>{enMarcha(e.estado) ? 'Tu envío ya está en marcha' : 'Tu envío ya tiene transportista asignado'}: no se puede modificar desde la plataforma.</strong>
        <div style={{ marginTop: '0.35rem' }}>Si necesitas cambiar algo (fechas, horario, dirección, mercancía…), <strong>contáctanos cuanto antes</strong> por teléfono, WhatsApp o email: cuanto antes lo sepamos, más fácil es arreglarlo.</div>
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
        <li>Si el cambio es posible, lo hacemos nosotros. <strong>Modificar no tiene coste.</strong> (Si cambia la ruta, el precio se recalcula.)</li>
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
