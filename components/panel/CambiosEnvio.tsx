'use client';

// Cambios en un envío ya confirmado.
//  · AvisoCambiosDynamo: en la ficha de Dynamo, «revisar precio» tras cambiar la ruta y el
//    cambio que ha pedido el cliente (aceptar / rechazar con nota).
//  · PedirCambio: en la ficha del cliente, el botón y el formulario para pedirlo.
import { useState } from 'react';
import { fecha, ventana } from '@/lib/formato';
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
      {e.precio_revisar && (
        <div className="modal-warn-box" style={{ marginBottom: '0.8rem' }}>
          <strong style={{ color: '#b42318' }}>La ruta ha cambiado: revisa el precio</strong> del cliente y del transportista (y, si ya hay camión, confírmalo con él).
          <div style={{ marginTop: '0.5rem' }}><button className="btn-primary" onClick={onModificar}>Revisar precio</button></div>
        </div>
      )}
      {e.cambio_cliente_estado === 'pendiente' && c && (
        <div className="modal-warn-box" style={{ marginBottom: '0.8rem' }}>
          <strong>El cliente pide un cambio</strong>{e.cambio_cliente_en ? ` (${creadoTxt(e.cambio_cliente_en)})` : ''}:
          {fechasTxt(c) && <> nuevas fechas de carga <strong>{fechasTxt(c)}</strong> (ahora {ventana(e.fecha_carga_desde, e.fecha_carga_hasta)}).</>}
          {c.detalle && <div style={{ marginTop: '0.3rem' }}>«{c.detalle}»</div>}
          {c.con_camion && <div style={{ marginTop: '0.3rem', color: '#b42318', fontWeight: 700 }}>Ya tiene camión asignado: confírmalo con el transportista antes de aceptar.</div>}
          <input type="text" value={nota} onChange={(ev) => setNota(ev.target.value)} maxLength={500} placeholder="Nota para el cliente (opcional)" style={{ width: '100%', marginTop: '0.5rem' }} />
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
            <button className="btn-primary" onClick={() => hacer('Aceptando', () => resolverCambio(e.id, true, nota))}>Aceptar{fechasTxt(c) ? ' (cambia las fechas)' : ''}</button>
            <button className="btn-ghost" style={{ color: '#dc2626' }} onClick={() => hacer('Rechazando', () => resolverCambio(e.id, false, nota))}>Rechazar</button>
          </div>
          <div className="meta" style={{ marginTop: '0.3rem' }}>Si pide cambiar la ruta o afecta al precio, hazlo después con «Cambiar ruta» o «Modificar».</div>
        </div>
      )}
      {e.cambio_cliente_estado === 'aplicado' && c && (
        <div className="pt-aviso info" style={{ marginBottom: '0.8rem' }}><div>El cliente cambió las fechas de carga{e.cambio_cliente_en ? ` el ${creadoTxt(e.cambio_cliente_en)}` : ''} (sin camión asignado, se aplicó solo): antes {ventana(c.antes_desde, c.antes_hasta)}.</div></div>
      )}
    </>
  );
}

export function PedirCambio({ e, cambio, hacer }: { e: any; cambio: any; hacer: Hacer }) {
  const [abierto, setAbierto] = useState(false);
  const [desde, setDesde] = useState(e.fecha_carga_desde ?? '');
  const [hasta, setHasta] = useState(e.fecha_carga_hasta ?? e.fecha_carga_desde ?? '');
  const [detalle, setDetalle] = useState('');
  if (!cambio) return null;
  const manana = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  if (cambio.estado === 'pendiente') {
    return <div className="pt-aviso info" style={{ marginBottom: '0.8rem' }}><div><strong>Has pedido un cambio</strong>{cambio.en ? ` el ${creadoTxt(cambio.en)}` : ''}. Lo estamos revisando{cambio.con_camion ? ' con el transportista' : ''} y te contestamos aquí.</div></div>;
  }
  const respuesta = (cambio.estado === 'aceptado' || cambio.estado === 'rechazado') && (
    <div className={`pt-aviso ${cambio.estado === 'aceptado' ? 'info' : 'error'}`} style={{ marginBottom: '0.8rem' }}><div>
      Tu último cambio ha sido <strong>{cambio.estado === 'aceptado' ? 'aceptado' : 'rechazado'}</strong>.{cambio.nota ? <> «{cambio.nota}»</> : null}
    </div></div>
  );
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
            {cambio.con_camion
              ? <>Tu envío <strong>ya tiene camión</strong>: revisamos el cambio con el transportista antes de confirmarlo.</>
              : <>Aún no tiene camión: si solo cambias las <strong>fechas</strong>, se aplica al momento y sin coste. Si pides otra cosa, lo revisamos (el precio puede cambiar).</>}
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
