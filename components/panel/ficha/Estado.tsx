'use client';

import { useState } from 'react';
import Modal from '../Modal';
import Cargando from '@/components/Cargando';
import { fechaHora } from '@/lib/formato';
import { marcarEtapa, pausarSeguimiento } from '@/app/panel/(app)/envios/acciones';
import { I, ICO, SubProps } from './comun';
import { nombreEtapa } from './Etapas';

// ---- Cambiar estado: todas las etapas del envío, para marcar a mano la actual -----------
// (usuario, 2026-11-06) El automático no se para: lo que se marca pasa a ser el punto de
// partida y desde ahí sigue con los mismos plazos. Una hora futura sirve para atrasar
// («llegará a las 14:00»): hasta entonces se queda en la etapa anterior.
const ahoraLocal = () => {
  const d = new Date(); d.setSeconds(0, 0);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

export function Estado({ ficha, onVolver, hacer, trabajando, fallo }: SubProps) {
  const e = ficha.envio;
  const etapas = ficha.etapas;
  const actual = etapas.find((x) => x.actual)?.paso ?? 0;
  const [paso, setPaso] = useState<number>(Math.min(actual + 1, Math.max(etapas.length - 1, 0)));
  const [hora, setHora] = useState<string>(ahoraLocal);
  const pausado = e.seguimiento_automatico === false;
  const elegida = etapas.find((x) => x.paso === paso);
  const isoHora = hora && !Number.isNaN(new Date(hora).getTime()) ? new Date(hora).toISOString() : null;
  const futura = !!isoHora && new Date(isoHora).getTime() > Date.now() + 60000;
  return (
    <Modal abierto ancho={640} onCerrar={onVolver} titulo={`Cambiar estado · #${e.referencia_gx}`}
      sub={pausado ? 'Seguimiento automático en pausa: el estado solo cambia a mano' : 'El estado avanza solo con el horario previsto; aquí lo corriges'}
      icono={<I d={ICO.fase} />}
      pie={<>
        <button className="btn-ghost" onClick={onVolver} disabled={!!trabajando}>Volver</button>
        <button className="btn-ghost" disabled={!!trabajando}
          onClick={() => hacer(pausado ? 'Reanudando' : 'Pausando', () => pausarSeguimiento(e.id, !pausado),
            pausado ? 'Seguimiento automático reanudado.' : 'Seguimiento automático en pausa: el estado ya no cambia solo.')}>
          {pausado ? 'Reanudar automático' : 'Pausar automático'}</button>
        <button className="btn-primary" disabled={!!trabajando || !elegida}
          onClick={() => hacer('Marcando la etapa', () => marcarEtapa(e.id, paso, paso === 0 ? null : isoHora),
            futura && isoHora ? `Hasta las ${fechaHora(isoHora)} sigue en la etapa anterior.` : `Marcado: ${elegida ? nombreEtapa(elegida) : ''}.`)}>Marcar esta etapa</button>
      </>}>
      {etapas.length === 0
        ? <p style={{ fontSize: 'var(--fs-m)', color: 'var(--gray-500)' }}>Este envío no tiene paradas o fecha de carga: no hay etapas que marcar.</p>
        : (
          <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
            <legend style={{ fontWeight: 700, marginBottom: '0.4rem' }}>¿En qué etapa está?</legend>
            <div className="estado-lista">
              {etapas.map((x) => (
                <label key={x.paso} className={`estado-opt${paso === x.paso ? ' sel' : ''}`}>
                  <span className="estado-opt-main">
                    <input type="radio" name="etapa" checked={paso === x.paso} onChange={() => setPaso(x.paso)} />
                    <span style={{ fontWeight: x.actual ? 800 : 600, color: x.actual ? 'var(--purple)' : undefined }}>{nombreEtapa(x)}{x.actual ? ' · ahora' : ''}</span>
                  </span>
                  {x.hora && <span className="estado-opt-eta">{x.hecha ? '' : 'prevista '}{fechaHora(x.hora)}</span>}
                </label>
              ))}
            </div>
          </fieldset>
        )}
      {etapas.length > 0 && paso > 0 && (
        <div className="ptar-sitio-grid" style={{ marginTop: '0.8rem' }}>
          <div>
            <label htmlFor="es-hora">¿Desde qué hora?</label>
            <input id="es-hora" type="datetime-local" value={hora} onChange={(ev) => setHora(ev.target.value)} />
          </div>
        </div>
      )}
      <p style={{ fontSize: 'var(--fs-s)', color: 'var(--gray-500)', margin: '0.7rem 0 0' }}>
        Desde la etapa que marques, el resto se recalcula con los mismos plazos (el tiempo en cada parada, la velocidad y las pausas del tacógrafo, en Parámetros).
        Con una hora futura se atrasa: hasta entonces sigue en la etapa anterior. Queda en el historial quién lo marcó y a qué hora.
        Al marcar «Entregado», el cliente deja de ver el teléfono del conductor (regla 11).
      </p>
      {fallo && <div className="wiz-warn show" role="alert" style={{ marginTop: '0.6rem' }}>⚠ {fallo}</div>}
      {trabajando && <Cargando texto={trabajando} />}
    </Modal>
  );
}
