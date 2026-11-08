'use client';

// Revisión del precio de un envío programado con mucha antelación (parámetros
// precio_cerrado_dias, precio_revision_dias_habiles, precio_revision_margen_pct). Las
// reglas las impone la base de datos (revisar_precio_envio, responder_subida_precio).
import { useState } from 'react';
import { euros, fecha, fechaHora } from '@/lib/formato';

import { revisarPrecioEnvio } from '@/app/panel/(app)/envios/acciones';

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
  return (
    <div className={toca ? 'modal-warn-box' : 'pt-aviso info'} style={{ marginBottom: '0.8rem', display: 'block' }}>
      <div>
        <strong>{toca ? 'Toca revisar el precio.' : 'Precio provisional.'}</strong>{' '}
        {toca ? 'Pon el precio de hoy para este envío (sin IVA).' : <>Se revisa el <strong>{fecha(r.fecha_revision_precio)}</strong>. Hasta entonces no se oferta ni se asigna camión; si quieres asignarlo ya, revísalo ahora.</>}
        {' '}Si se mueve menos de un {String(r.margen_pct ?? 5).replace('.', ',')} % se queda {euros(envio.importe_cliente)}; si baja o sube, se aplica el precio nuevo directamente y se avisa al cliente (puede cancelar sin coste hasta las 9:00 del día hábil anterior a la carga).
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
export function RevisionCliente({ envio, r }: { envio: { id: string; estado: string }; r: Revision | null; hacer?: Hacer }) {
  if (!r || envio.estado !== 'programado' || !provisional(r)) return null;
  return (
    <div className="pt-aviso info" style={{ marginBottom: '0.8rem' }}><div>
      <strong>Precio provisional.</strong> Como lo programaste con mucha antelación, revisamos el precio {r.fecha_revision_precio ? <>el <strong>{fecha(r.fecha_revision_precio)}</strong></> : 'unos días antes de la carga'}.
      {' '}Si apenas cambia, se queda igual; si cambia, se aplica el precio nuevo y te avisamos. Si no te encaja, puedes cancelar sin coste mientras el envío no tenga camión asignado.
    </div></div>
  );
}
