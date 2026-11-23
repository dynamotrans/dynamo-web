'use client';

import { useEffect, useMemo, useState } from 'react';
import Modal from '../Modal';
import Cargando from '@/components/Cargando';
import Req from '@/components/Req';
import { euros, porcentaje } from '@/lib/formato';
import { SIN_CONEXION } from '@/lib/mensajeError';
import { cuentasDevolucion, importeEscrito } from '@/lib/devolucion';
import { datosDevolucion, devolverPago, type DatosDevolucion, type ResultadoDevolucion } from '@/app/panel/(app)/envios/acciones-devolucion';
import { cancelarEnvio } from '@/app/panel/(app)/envios/acciones';
import type { Ficha } from '@/lib/fichaEnvio';
import { I, ICO } from './comun';

// DEVOLVER EL IMPORTE de un pago con tarjeta (usuario, 2026-11-23). Solo el Admin Master. Dos
// pasos: (1) cuánto —todo o una parte— con las cuentas a la vista (lo que se devuelve y lo que
// se queda Dynamo, con sus bases), la contraseña y la palabra CONFIRMAR escrita a mano;
// (2) «Pago devuelto», con dos salidas: dejar el envío o cancelarlo.
export function DevolverPago({ ficha, onVolver, onHecho }: { ficha: Ficha; onVolver: () => void; onHecho: () => void }) {
  const e = ficha.envio;
  const [datos, setDatos] = useState<DatosDevolucion | null>(null);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [modo, setModo] = useState<'todo' | 'parte'>('todo');
  const [parte, setParte] = useState('');
  const [motivo, setMotivo] = useState('');
  const [clave, setClave] = useState('');
  const [palabra, setPalabra] = useState('');
  const [trabajando, setTrabajando] = useState<string | null>(null);
  const [fallo, setFallo] = useState<string | null>(null);
  const [hecho, setHecho] = useState<ResultadoDevolucion | null>(null);

  useEffect(() => {
    let vivo = true;
    datosDevolucion(e.id).then((r) => { if (!vivo) return; if (r.ok) setDatos(r.datos); else setErrorCarga(r.error); })
      .catch(() => { if (vivo) setErrorCarga(SIN_CONEXION); });
    return () => { vivo = false; };
  }, [e.id]);

  const importe = datos ? (modo === 'todo' ? datos.disponible : importeEscrito(parte)) : null;
  const importeVale = !!datos && importe != null && importe > 0 && importe <= datos.disponible + 1e-9;
  const c = useMemo(() => (datos && importeVale ? cuentasDevolucion(datos.disponible, importe!, datos.ivaPct) : null), [datos, importe, importeVale]);
  const listo = importeVale && clave.length > 0 && palabra.trim() === 'CONFIRMAR';

  async function devolver() {
    if (!datos || !importeVale) { setFallo('Escribe un importe válido: mayor que cero y no más de lo cobrado.'); return; }
    if (palabra.trim() !== 'CONFIRMAR') { setFallo('Escribe la palabra CONFIRMAR, en mayúsculas.'); return; }
    if (!clave) { setFallo('Escribe tu contraseña.'); return; }
    setTrabajando('Devolviendo el importe'); setFallo(null);
    const r = await devolverPago(e.id, importe!, clave, palabra, motivo).catch(() => ({ ok: false as const, error: SIN_CONEXION }));
    setTrabajando(null);
    if (!r.ok) { setFallo(r.error); return; }
    setClave(''); setHecho(r.resultado);
  }
  async function cancelar() {
    setTrabajando('Cancelando el envío'); setFallo(null);
    const r = await cancelarEnvio(e.id, 'Pago devuelto').catch(() => ({ ok: false as const, error: SIN_CONEXION }));
    setTrabajando(null);
    if (!r.ok) { setFallo(r.error ?? 'No se ha podido cancelar el envío.'); return; }
    onHecho();
  }

  const fila = (k: string, total: number, base: number, iva: number, fuerte = false) => (
    <tr>
      <th scope="row">{k}</th>
      <td className={fuerte ? 'dv-fuerte' : undefined}>{euros(total)}</td><td>{euros(base)}</td><td>{euros(iva)}</td>
    </tr>
  );
  const tabla = (x: { devuelto: number; baseDevuelta: number; ivaDevuelto: number; retenido: number; baseRetenida: number; ivaRetenido: number }) => (
    <table className="dv-cuentas" data-dv-cuentas>
      <thead><tr><th /><th>Total con IVA</th><th>Base imponible</th><th>IVA</th></tr></thead>
      <tbody>
        {fila('Se devuelve al cliente', x.devuelto, x.baseDevuelta, x.ivaDevuelto, true)}
        {fila('Se queda en Dynamo', x.retenido, x.baseRetenida, x.ivaRetenido)}
      </tbody>
    </table>
  );

  // ---- 2 · Pago devuelto ------------------------------------------------------------------
  if (hecho) {
    const cancelado = hecho.estadoEnvio === 'cancelado';
    const donde = hecho.estadoPago === 'pendiente' ? 'Pendiente de pago' : 'Programados';
    return (
      <Modal abierto onCerrar={onHecho} titulo="Pago devuelto" sub={`Envío #${e.referencia_gx}`} icono={<I d={ICO.repetir} />}
        pie={cancelado
          ? <button className="btn-primary" onClick={onHecho}>Cerrar</button>
          : <>
            <button className="btn-secondary" id="dv-dejar" onClick={onHecho} disabled={!!trabajando}>Dejar el envío en {donde}</button>
            <button className="btn-primary" id="dv-cancelar" style={{ background: 'var(--red)' }} onClick={cancelar} disabled={!!trabajando}>Cancelar el envío</button>
          </>}>
        <div className="pt-aviso info"><div>
          <strong>Devueltos {euros(hecho.devuelto)}</strong> a la tarjeta del cliente. Stripe los abona en unos días, según su banco. Le hemos avisado por email.
        </div></div>
        {tabla(hecho)}
        {hecho.penalizacion && (
          <p className="dv-nota">Por lo que se queda Dynamo se ha creado la penalización <strong>{hecho.penalizacion}</strong> («Cancelación transporte fuera de plazo»), <strong>sin confirmar</strong> y ya cobrada con este pago. Revísala en Penalizaciones: puedes cambiarle el concepto y el importe antes de confirmarla.</p>
        )}
        {!cancelado && (
          <p className="dv-nota">El envío ya no está pagado: {hecho.estadoPago === 'pendiente'
            ? <>ha vuelto a <strong>Pendiente de pago</strong> (el cliente tiene de nuevo su plazo para pagar).</>
            : hecho.estadoPago === 'exento'
              ? <>sigue <strong>sin pago previo</strong>, porque ya tiene transportista o está en marcha.</>
              : <>sigue en <strong>Programados</strong>, a crédito.</>} Elige qué hacer con él.</p>
        )}
        {fallo && <div className="wiz-warn show" role="alert" style={{ marginTop: '0.6rem' }}>⚠ {fallo}</div>}
        {trabajando && <Cargando texto={trabajando} />}
      </Modal>
    );
  }

  // ---- 1 · Cuánto, contraseña y CONFIRMAR -------------------------------------------------
  return (
    <Modal abierto onCerrar={onVolver} titulo={`Devolver importe · #${e.referencia_gx}`} sub={ficha.cliente?.nombre} icono={<I d={ICO.repetir} />}
      pie={<>
        <button className="btn-ghost" onClick={onVolver} disabled={!!trabajando}>No, volver</button>
        <button className="btn-primary" id="dv-devolver" style={{ background: 'var(--red)' }} disabled={!!trabajando || !datos} aria-disabled={!listo} onClick={devolver}>
          {c ? `Devolver ${euros(c.devuelto)}` : 'Devolver'}</button>
      </>}>
      {errorCarga && <div className="wiz-warn show" role="alert">⚠ {errorCarga}</div>}
      {!datos && !errorCarga && <p style={{ color: 'var(--gray-500)' }}>Consultando el pago en Stripe…</p>}
      {datos && <>
        <div className="modal-warn-box">
          Pagado con tarjeta: <strong>{euros(datos.cobrado)}</strong> (IVA {porcentaje(datos.ivaPct)} incluido)
          {datos.yaDevuelto > 0 && <> · ya devueltos {euros(datos.yaDevuelto)}: quedan <strong>{euros(datos.disponible)}</strong></>}.
          {' '}La devolución se hace en Stripe ahora mismo y <strong>no se puede deshacer</strong>.
          {datos.conCamion && <><br /><strong style={{ color: '#b42318' }}>Este envío ya tiene transportista o está ofertado:</strong> si lo dejas, seguirá adelante sin pago previo.</>}
        </div>
        <fieldset className="dv-modo">
          <legend>¿Cuánto se devuelve?</legend>
          <label><input type="radio" name="dv-modo" checked={modo === 'todo'} onChange={() => setModo('todo')} /> Todo ({euros(datos.disponible)})</label>
          <label><input type="radio" name="dv-modo" checked={modo === 'parte'} onChange={() => setModo('parte')} /> Una parte</label>
        </fieldset>
        <div className="ptar-sitio-grid">
          <div>
            <label htmlFor="dv-importe">Importe a devolver, con IVA <Req si={modo === 'parte'} /></label>
            <input id="dv-importe" type="text" inputMode="decimal" disabled={modo === 'todo'} placeholder="Ej. 500,00"
              value={modo === 'todo' ? euros(datos.disponible) : parte} onChange={(ev) => setParte(ev.target.value)} />
            {modo === 'parte' && parte.trim() !== '' && !importeVale && <small style={{ color: '#b42318' }}>Tiene que ser mayor que cero y no pasar de {euros(datos.disponible)}.</small>}
          </div>
          <div>
            <label htmlFor="dv-motivo">Motivo (queda en el historial) <Req si={false} /></label>
            <input id="dv-motivo" type="text" maxLength={500} value={motivo} placeholder="Ej. el cliente anula el transporte" onChange={(ev) => setMotivo(ev.target.value)} />
          </div>
        </div>
        {c ? tabla(c) : <p className="dv-nota">Escribe el importe para ver las cuentas.</p>}
        {c && c.retenido > 0 && (
          <p className="dv-nota">Por los <strong>{euros(c.retenido)}</strong> que se queda Dynamo se creará una penalización del envío («Cancelación transporte fuera de plazo»), sin confirmar y ya cobrada con este pago. Podrás editarla después.</p>
        )}
        <div className="ptar-sitio-grid" style={{ marginTop: '0.7rem' }}>
          <div>
            <label htmlFor="dv-clave">Tu contraseña <Req si /></label>
            <input id="dv-clave" type="password" autoComplete="current-password" value={clave} onChange={(ev) => setClave(ev.target.value)} />
          </div>
          <div>
            <label htmlFor="dv-palabra">Escribe CONFIRMAR <Req si /></label>
            <input id="dv-palabra" type="text" autoComplete="off" autoCapitalize="characters" spellCheck={false} placeholder="CONFIRMAR"
              value={palabra} onChange={(ev) => setPalabra(ev.target.value)} />
          </div>
        </div>
      </>}
      {fallo && <div className="wiz-warn show" role="alert" style={{ marginTop: '0.6rem' }}>⚠ {fallo}</div>}
      {trabajando && <Cargando texto={trabajando} />}
    </Modal>
  );
}
