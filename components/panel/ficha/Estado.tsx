'use client';

import { useState } from 'react';
import Modal from '../Modal';
import Cargando from '@/components/Cargando';
import { cambiarEstado } from '@/app/panel/(app)/envios/acciones';
import { ESTADOS, I, ICO, SubProps, hoy, nombreEstado } from './comun';

// ---- Cambiar estado (fase del envío) -----------------------------------------------
export function Estado({ ficha, onVolver, hacer, trabajando }: SubProps) {
  const e = ficha.envio;
  const fases = ESTADOS.filter(([k]) => ['programado', 'hacia_la_carga', 'cargando', 'en_ruta', 'entregado'].includes(k));
  const i = fases.findIndex(([k]) => k === e.estado);
  const [nuevo, setNuevo] = useState<string>(fases[Math.min(Math.max(i + 1, 0), fases.length - 1)][0]);
  const [fReal, setFReal] = useState<string>(e.fecha_carga_real ?? hoy());
  const pideFecha = nuevo === 'en_ruta' || nuevo === 'entregado';
  return (
    <Modal abierto onCerrar={onVolver} titulo={`Cambiar estado · #${e.referencia_gx}`} sub={`Estado actual: ${nombreEstado(e.estado)}`} icono={<I d={ICO.fase} />}
      pie={<>
        <button className="btn-ghost" onClick={onVolver} disabled={!!trabajando}>Volver</button>
        <button className="btn-primary" disabled={!!trabajando || nuevo === e.estado}
          onClick={() => hacer('Cambiando el estado', () => cambiarEstado(e.id, nuevo, pideFecha ? fReal : null), `Estado cambiado a «${nombreEstado(nuevo)}».`)}>Cambiar estado</button>
      </>}>
      <div className="ptar-sitio-grid">
        <div style={{ gridColumn: '1/-1' }}>
          <label>Nuevo estado</label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {fases.map(([k, n, c]) => (
              <button key={k} type="button" onClick={() => setNuevo(k)} aria-pressed={nuevo === k}
                className={`badge badge-${c}`} style={{ cursor: 'pointer', border: nuevo === k ? '2px solid var(--purple)' : '2px solid transparent', padding: '0.4rem 0.7rem' }}>{n}</button>
            ))}
          </div>
        </div>
        {pideFecha && (
          <div>
            <label htmlFor="es-fecha">Fecha de carga real</label>
            <input id="es-fecha" type="date" value={fReal} onChange={(ev) => setFReal(ev.target.value)} />
          </div>
        )}
      </div>
      <p style={{ fontSize: 'var(--fs-s)', color: 'var(--gray-500)', margin: '0.7rem 0 0' }}>
        «Cargado» y «Entregado» quedan en el historial con su hora. Cuando esté entregado, el cliente deja de ver el teléfono del conductor (regla 11).
      </p>
      {trabajando && <Cargando texto={trabajando} />}
    </Modal>
  );
}
