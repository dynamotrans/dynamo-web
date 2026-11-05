'use client';

// Revisión del precio de un envío programado con mucha antelación (parámetros
// precio_cerrado_dias, precio_revision_dias_habiles, precio_revision_margen_pct). Las
// reglas las impone la base de datos (revisar_precio_envio, responder_subida_precio).
import { useState } from 'react';
import { euros, fecha, fechaHora } from '@/lib/formato';

import { revisarPrecioEnvio } from '@/app/panel/(app)/envios/acciones';
import { responderSubidaPrecio } from '@/app/panel/(app)/envios/acciones-cliente';

type Hacer = (texto: string, fn: () => Promise<{ ok: boolean; error?: string; aviso?: string }>) => Promise<unknown>;
export type Revision = {
  precio_calculado_en: string | null; estado_revision_precio: string | null; fecha_revision_precio: string | null;
  importe_revision_anterior: number | null; importe_revision_nuevo: number | null; revision_precio_en: string | null; margen_pct?: number | null;
};
const provisional = (r: Revision | null) => !!r && ['pendiente', 'revisar', 'esperando_cliente'].includes(r.estado_revision_precio ?? '');
const num = (v: string) => Number(v.replace(/\./g, '').replace(',', '.'));

/** «Precio del 05/11/26 · 10:30 · provisional»: debajo de cada precio. */
export function SelloPrecio({ r }: { r: Revision | null }) {
  if (!r?.precio_calculado_en) return null;
  return (
    <div style={{ fontSize: 'var(--fs-s)', color: 'var(--gray-500)', marginTop: '0.35rem' }}>
      Precio del {fechaHora(r.precio_calculado_en)}{provisional(r) ? <> · <strong style={{ color: '#b54708' }}>provisional</strong>{r.fecha_revision_precio ? `, se revisa el ${fecha(r.fecha_revision_precio)}` : ''}</> : null}
    </div>
  );
}

/** En la ficha de Dynamo: estado de la revisión y el precio definitivo. */
export function RevisionDynamo({ envio, r, hacer }: { envio: { id: string; estado: string; importe_cliente: number | null }; r: Revision; hacer: Hacer }) {
  const [precio, setPrecio] = useState('');
  if (envio.estado !== 'programado' || !provisional(r)) return null;
  const toca = r.estado_revision_precio === 'revisar';
  if (r.estado_revision_precio === 'esperando_cliente') {
    return (
      <div className="modal-warn-box" style={{ marginBottom: '0.8rem' }}>
        <div><strong>Subida de precio esperando al cliente:</strong> de {euros(r.importe_revision_anterior)} a <strong>{euros(r.importe_revision_nuevo)}</strong> (sin IVA), enviada el {fechaHora(r.revision_precio_en)}.</div>
        <div style={{ marginTop: '0.3rem' }}>Puede aceptarla o cancelar sin coste. Si no contesta, te avisamos para que le llames. No se oferta hasta que conteste.</div>
      </div>
    );
  }
  return (
    <div className={toca ? 'modal-warn-box' : 'pt-aviso info'} style={{ marginBottom: '0.8rem', display: 'block' }}>
      <div>
        <strong>{toca ? 'Toca revisar el precio.' : 'Precio provisional.'}</strong>{' '}
        {toca ? 'Pon el precio de hoy para este envío (sin IVA).' : <>Se revisa el <strong>{fecha(r.fecha_revision_precio)}</strong>. Hasta entonces no se oferta ni se asigna camión; si quieres asignarlo ya, revísalo ahora.</>}
        {' '}Si se mueve menos de un {String(r.margen_pct ?? 5).replace('.', ',')} % se queda {euros(envio.importe_cliente)}; si baja, se aplica; si sube, el cliente lo acepta o cancela sin coste.
      </div>
      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.6rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <input type="text" inputMode="decimal" className="ptar-select" style={{ maxWidth: 160 }} placeholder="Ej. 1.050,00" aria-label="Precio de la revisión (sin IVA)"
          value={precio} onChange={(ev) => setPrecio(ev.target.value)} />
        <button className="btn-primary" disabled={!(num(precio) > 0)}
          onClick={() => hacer('Revisando', () => revisarPrecioEnvio(envio.id, num(precio)))}>Revisar precio</button>
      </div>
    </div>
  );
}

/** En la ficha del cliente: precio provisional o subida por aceptar. */
export function RevisionCliente({ envio, r, hacer }: { envio: { id: string; estado: string }; r: Revision | null; hacer: Hacer }) {
  const [cancelar, setCancelar] = useState(false);
  if (!r || envio.estado !== 'programado' || !provisional(r)) return null;
  if (r.estado_revision_precio === 'esperando_cliente') {
    return (
      <div className="modal-warn-box" style={{ marginBottom: '0.8rem' }}>
        <div><strong style={{ color: '#b42318' }}>Nuevo precio de tu envío: {euros(r.importe_revision_nuevo)}</strong> + IVA (antes {euros(r.importe_revision_anterior)}).</div>
        <div style={{ marginTop: '0.3rem' }}>Lo hemos revisado antes de la carga porque lo programaste con mucha antelación. Puedes aceptarlo o cancelar el envío <strong>sin ningún coste</strong>.</div>
        {!cancelar ? (
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.7rem', flexWrap: 'wrap' }}>
            <button className="btn-primary" onClick={() => hacer('Guardando', () => responderSubidaPrecio(envio.id, true, r.importe_revision_nuevo))}>Aceptar el nuevo precio</button>
            <button className="btn-ghost" onClick={() => setCancelar(true)}>Cancelar sin coste</button>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.7rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <span>¿Seguro que lo cancelas?</span>
            <button className="btn-primary" style={{ background: 'var(--red)' }} onClick={() => hacer('Cancelando', () => responderSubidaPrecio(envio.id, false))}>Sí, cancelar sin coste</button>
            <button className="btn-ghost" onClick={() => setCancelar(false)}>No</button>
          </div>
        )}
      </div>
    );
  }
  return (
    <div className="pt-aviso info" style={{ marginBottom: '0.8rem' }}><div>
      <strong>Precio provisional.</strong> Como lo programaste con mucha antelación, revisamos el precio {r.fecha_revision_precio ? <>el <strong>{fecha(r.fecha_revision_precio)}</strong></> : 'unos días antes de la carga'}.
      {' '}Si apenas cambia, se queda igual; si baja, te lo bajamos; si sube, te avisamos y podrás aceptarlo o cancelar sin coste.
    </div></div>
  );
}
