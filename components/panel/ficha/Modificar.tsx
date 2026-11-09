'use client';

import { useState } from 'react';
import Modal from '../Modal';
import Cargando from '@/components/Cargando';
import { numero } from '@/lib/formato';
import { NEGOCIACION } from '@/lib/envios';
import { modificarEnvio, type DatosEnvio } from '@/app/panel/(app)/envios/acciones';
import Req from '@/components/Req';
import { I, ICO, Interruptor, SubProps, aNum, txtNum } from './comun';

// Etiquetas y faltas según el criterio único (usuario, 2026-11-09): aquí nada se exige
// al guardar (solo que los números sean válidos), así que todo campo libre es opcional.

// ---- Modificar ----------------------------------------------------------------------
export function Modificar({ ficha, onVolver, hacer, trabajando, fallo }: SubProps) {
  const e = ficha.envio;
  const manual = !!e.es_manual;
  const [d, setD] = useState({
    referencia_cliente: e.referencia_cliente ?? '', fecha_carga_desde: e.fecha_carga_desde ?? '', fecha_carga_hasta: e.fecha_carga_hasta ?? '',
    fecha_entrega_estimada: e.fecha_entrega_estimada ?? '', descripcion_mercancia: e.descripcion_mercancia ?? '',
    metros: txtNum(e.metros_lineales), toneladas: numero(e.toneladas, 2),
    paletizado: e.paletizado !== false, carga_lateral: !!e.carga_lateral, carga_trasera: !!e.carga_trasera, carga_techo: !!e.carga_techo,
    requiere_plataforma_elevadora: !!e.requiere_plataforma_elevadora, requiere_nima: !!e.requiere_nima, adr: !!e.adr,
    importe_cliente: numero(e.importe_cliente, 2), importe_transportista: numero(e.importe_transportista, 2), acordado: numero(e.precio_acordado_operador),
    negociacion: String(e.negociacion_pct ?? 10),
    discrecion_comercial: !!e.discrecion_comercial, anotaciones_cliente: e.anotaciones_cliente ?? '',
  });
  const [paradas, setParadas] = useState(ficha.paradas.map((p) => ({ id: p.id, referencia: p.referencia ?? '', anotaciones: p.anotaciones ?? '', titulo: `${p.tipo === 'carga' ? 'Recogida' : 'Entrega'} · ${p.nombre_empresa ?? p.poblacion ?? ''}` })));
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof d, v: string | boolean) => setD((x) => ({ ...x, [k]: v }));

  async function guardar() {
    setError(null);
    const n = { metros: aNum(d.metros), toneladas: aNum(d.toneladas), pc: aNum(d.importe_cliente), pt: aNum(d.importe_transportista), ac: aNum(d.acordado) };
    if (Object.values(n).some((v) => Number.isNaN(v))) { setError('Hay un número que no es válido.'); return; }
    const datos: DatosEnvio = {
      referencia_cliente: d.referencia_cliente, fecha_carga_desde: d.fecha_carga_desde, fecha_carga_hasta: d.fecha_carga_hasta,
      fecha_entrega_estimada: d.fecha_entrega_estimada, descripcion_mercancia: d.descripcion_mercancia,
      metros_lineales: n.metros, toneladas: n.toneladas,
      paletizado: d.paletizado, carga_lateral: d.carga_lateral, carga_trasera: d.carga_trasera, carga_techo: d.carga_techo,
      requiere_plataforma_elevadora: d.requiere_plataforma_elevadora, requiere_nima: d.requiere_nima, adr: d.adr,
      importe_cliente: n.pc, importe_transportista: n.pt, precio_acordado_operador: n.ac, negociacion_pct: Number(d.negociacion),
      discrecion_comercial: d.discrecion_comercial, anotaciones_cliente: d.anotaciones_cliente,
      paradas: paradas.map(({ id, referencia, anotaciones }) => ({ id, referencia, anotaciones })),
    };
    await hacer('Guardando cambios', () => modificarEnvio(e.id, datos, e.importe_cliente != null ? Number(e.importe_cliente) : null), 'Cambios guardados.');
  }
  const campo = (k: keyof typeof d, l: string, ph?: string, tipo = 'text', full = false) => (
    <div style={full ? { gridColumn: '1/-1' } : undefined}>
      <label htmlFor={`mo-${k}`}>{l} <Req si={false} /></label>
      <input id={`mo-${k}`} type={tipo} inputMode={tipo === 'text' && /importe|metros|toneladas|acordado/.test(k) ? 'decimal' : undefined}
        value={String(d[k])} placeholder={ph} onChange={(ev) => set(k, ev.target.value)} />
    </div>
  );
  const sw = (k: keyof typeof d, l: string) => <Interruptor k={`mo-${k}`} l={l} v={d[k] as boolean} on={(b) => set(k, b)} />;
  return (
    <Modal abierto ancho={720} onCerrar={onVolver} titulo={`Modificar envío #${e.referencia_gx}`} sub={ficha.cliente?.nombre} icono={<I d={ICO.editar} />}
      pie={<>
        <button className="btn-ghost" onClick={onVolver} disabled={!!trabajando}>Volver</button>
        <button className="btn-primary" onClick={guardar} disabled={!!trabajando}>Guardar cambios</button>
      </>}>
      <div className="ptar-sitio-grid">
        <div style={{ gridColumn: '1/-1' }} className="ptar-section-head">Fechas</div>
        {campo('fecha_carga_desde', 'Carga · desde', '', 'date')}
        {campo('fecha_carga_hasta', 'Carga · hasta (ventana)', '', 'date')}
        {campo('fecha_entrega_estimada', 'Entrega estimada', '', 'date')}
        {campo('referencia_cliente', 'Referencia del cliente', 'PED-0424')}

        <div style={{ gridColumn: '1/-1', marginTop: '0.4rem' }} className="ptar-section-head">Mercancía</div>
        {campo('descripcion_mercancia', 'Descripción', 'Ej. palets de azulejo', 'text', true)}
        {campo('metros', 'Metros lineales', '13,3')}
        {campo('toneladas', 'Toneladas', '24')}
        {sw('paletizado', 'Paletizada')}
        {sw('carga_lateral', 'Carga lateral')}
        {sw('carga_trasera', 'Carga trasera')}
        {sw('carga_techo', 'Carga por techo')}
        {sw('requiere_plataforma_elevadora', 'Plataforma elevadora')}
        {sw('requiere_nima', 'Requiere NIMA')}
        {sw('adr', 'Mercancía ADR')}
        {sw('discrecion_comercial', 'Discreción comercial')}

        <div style={{ gridColumn: '1/-1', marginTop: '0.4rem' }} className="ptar-section-head">Precio (sin IVA)</div>
        {manual
          ? campo('acordado', 'Precio acordado con su transportista (€)', 'Ej. 950')
          : <>{campo('importe_cliente', 'Precio del cliente (€)', 'Ej. 900')}{campo('importe_transportista', 'Precio del transportista (€)', 'Ej. 720')}
            <div style={{ gridColumn: '1/-1' }}>
              <label htmlFor="mo-negociacion">Negociación con el transportista</label>
              <select id="mo-negociacion" value={d.negociacion} onChange={(ev) => set('negociacion', ev.target.value)}>
                {NEGOCIACION.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
              </select>
            </div></>}
        {!manual && <div style={{ gridColumn: '1/-1', fontSize: 'var(--fs-s)', color: 'var(--gray-500)' }}>Si cambias el precio del cliente, queda <strong>fijado a mano</strong>.</div>}

        <div style={{ gridColumn: '1/-1', marginTop: '0.4rem' }} className="ptar-section-head">Paradas</div>
        {paradas.map((p, i) => (
          <div key={p.id} style={{ gridColumn: '1/-1', display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,2fr)', gap: '0.5rem 0.8rem' }}>
            <div style={{ gridColumn: '1/-1', fontWeight: 700, color: 'var(--navy)', fontSize: 'var(--fs-m)' }}>{p.titulo}</div>
            <div><label htmlFor={`mo-ref-${i}`}>Referencia <Req si={false} /></label><input id={`mo-ref-${i}`} type="text" value={p.referencia} placeholder="Nº de carga del almacén"
              onChange={(ev) => setParadas((l) => l.map((x, j) => (j === i ? { ...x, referencia: ev.target.value } : x)))} /></div>
            <div><label htmlFor={`mo-not-${i}`}>Anotaciones de esta parada <Req si={false} /></label><input id={`mo-not-${i}`} type="text" value={p.anotaciones} placeholder="Ej. preguntar por Manolo"
              onChange={(ev) => setParadas((l) => l.map((x, j) => (j === i ? { ...x, anotaciones: ev.target.value } : x)))} /></div>
          </div>
        ))}
        <div style={{ gridColumn: '1/-1' }}>
          <label htmlFor="mo-anot">Anotaciones del envío <Req si={false} /></label>
          <textarea id="mo-anot" rows={2} value={d.anotaciones_cliente} onChange={(ev) => set('anotaciones_cliente', ev.target.value)} />
        </div>
      </div>
      <p style={{ fontSize: 'var(--fs-s)', color: 'var(--gray-500)', margin: '0.7rem 0 0' }}>Para cambiar los sitios de la ruta, de momento cancela el envío y créalo de nuevo (cambiar la ruta desde aquí llega más adelante).</p>
      {(error ?? fallo) && <div className="wiz-warn show" role="alert">⚠ {error ?? fallo}</div>}
      {trabajando && <Cargando texto={trabajando} />}
    </Modal>
  );
}
