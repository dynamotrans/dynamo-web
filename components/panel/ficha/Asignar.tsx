'use client';

import { useEffect, useMemo, useState } from 'react';
import Modal from '../Modal';
import Cargando from '@/components/Cargando';
import { euros, numero, fecha, diasEntre } from '@/lib/formato';
import type { TransportistaOpcion } from '@/lib/fichaEnvio';
import CampoTelefono from '@/components/CampoTelefono';
import { asignarTransportista, quitarTransportista, sugerirFlota, flotaTransportista, buscarTransportistas } from '@/app/panel/(app)/envios/acciones';
import Buscador from '../Buscador';
import { I, ICO, SubProps, aNum } from './comun';

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

// ---- Asignar / cambiar transportista ------------------------------------------------
export function Asignar({ ficha, onVolver, hacer, trabajando }: SubProps) {
  const e = ficha.envio;
  // El transportista elegido, con sus datos (estado, NIMA, contacto de tráfico). El ya
  // asignado se pinta con lo que trae la ficha y se completa pidiéndolo a la base de datos.
  const [t, setT] = useState<TransportistaOpcion | null>(ficha.transportista
    ? { id: ficha.transportista.id, nombre: ficha.transportista.nombre, cif: ficha.transportista.cif, estado: 'activo', nima: null, telefono: null, email: null } : null);
  const tid = t?.id ?? '';
  useEffect(() => {
    const id = ficha.transportista?.id;
    if (!id) return;
    let vivo = true;
    buscarTransportistas('', id).then((r) => { const x = r.find((o) => o.id === id); if (vivo && x) setT(x); }).catch(() => {});
    return () => { vivo = false; };
  }, [ficha.transportista?.id]);
  const opciones = (q: string) => buscarTransportistas(q, ficha.transportista?.id ?? null).then((r) => r.map((o) => ({
    ...o, detalle: o.estado === 'suspendido' ? 'SUSPENDIDO' : o.estado === 'no_ofertar' ? 'no ofertar' : null, deshabilitada: o.estado === 'suspendido' })));
  const [precio, setPrecio] = useState(numero(e.importe_transportista, 2));
  const [camion, setCamion] = useState<string>(e.matricula_camion ?? '');
  const [remolque, setRemolque] = useState<string>(e.matricula_remolque ?? '');
  const [conductor, setConductor] = useState<string>(e.conductor_nombre ?? '');
  const [tel, setTel] = useState<string>(e.conductor_telefono ?? '');
  const [error, setError] = useState<string | null>(null);
  // Día en que carga (usuario, 2026-11-06): con ventana es obligatorio y es el que usa el
  // seguimiento automático; con fecha fija es esa fecha.
  const dias = useMemo(() => diasEntre(e.fecha_carga_desde, e.fecha_carga_hasta), [e.fecha_carga_desde, e.fecha_carga_hasta]);
  const conVentana = dias.length > 1 || !e.fecha_carga_desde;
  const [diaCarga, setDiaCarga] = useState<string>(e.fecha_carga_prevista ?? (dias.length === 1 ? dias[0] : ''));
  // (Sábado y domingo no se pueden elegir: los camiones no circulan. Un festivo nacional lo pasa
  // la base de datos al siguiente día hábil.)
  // Su flota se pide al elegirlo (no viaja con la ficha la de todos los transportistas).
  const [flota, setFlota] = useState<{ id: string; vehiculos: { matricula: string; tipo: string }[]; conductores: { nombre: string; telefono: string | null }[] } | null>(null);
  useEffect(() => {
    if (!tid) return;
    let vivo = true;
    flotaTransportista(tid).then((f) => { if (vivo) setFlota({ id: tid, ...f }); }).catch(() => {});
    return () => { vivo = false; };
  }, [tid]);
  const fl = flota?.id === tid ? flota : null;
  // Camión nuevo → su chófer de otras veces (o vacío). Chófer nuevo → su teléfono (o vacío),
  // nunca los datos del chófer anterior (usuario, 2026-11-05).
  const [base, setBase] = useState({ camion: camion, conductor: conductor });
  const sinEsp = (x: string) => x.replace(/[^0-9a-z]/gi, '').toUpperCase();
  const norm = (x: string) => x.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  async function alSalirCamion() {
    if (!tid || !camion.trim() || sinEsp(camion) === sinEsp(base.camion)) return;
    const s = await sugerirFlota(tid, { matricula: camion });
    if (!s) return;
    setConductor(s.conductor ?? ''); setTel(s.telefono ?? '');
    setBase({ camion, conductor: s.conductor ?? '' });
  }
  async function alSalirConductor() {
    if (!tid || !conductor.trim() || norm(conductor) === norm(base.conductor)) return;
    const s = await sugerirFlota(tid, { conductor });
    if (!s) return;
    setTel(s.telefono ?? '');
    setBase((b) => ({ ...b, conductor }));
  }
  const pc = e.importe_cliente != null ? Number(e.importe_cliente) : null;
  const pv = aNum(precio);
  const margen = pc != null && pv != null && !Number.isNaN(pv) ? pc - pv : null;
  const camiones = useMemo(() => (fl?.vehiculos ?? []).filter((v) => v.tipo !== 'remolque'), [fl]);
  const remolques = useMemo(() => (fl?.vehiculos ?? []).filter((v) => v.tipo === 'remolque'), [fl]);

  async function guardar() {
    setError(null);
    if (!tid) { setError('Elige el transportista.'); return; }
    if (Number.isNaN(pv)) { setError('El precio del transportista no es un número.'); return; }
    if (conVentana && !diaCarga) { setError('Elige el día en que carga.'); return; }
    await hacer('Asignando el transportista', () => asignarTransportista(e.id, {
      transportista_id: tid, importe_transportista: pv, matricula_camion: camion, matricula_remolque: remolque,
      conductor_nombre: conductor, conductor_telefono: tel, fecha_carga_prevista: diaCarga || null,
    }), `Transportista asignado: ${t?.nombre ?? ''}.`);
  }
  return (
    <Modal abierto ancho={680} onCerrar={onVolver} titulo={`${ficha.transportista ? 'Cambiar' : 'Asignar'} transportista · #${e.referencia_gx}`}
      sub="Uso interno · el transportista y su vehículo para este envío" icono={<I d={ICO.camion} />}
      pie={<>
        <button className="btn-ghost" onClick={onVolver} disabled={!!trabajando}>Volver</button>
        {ficha.transportista && <button className="btn-ghost" style={{ color: '#dc2626' }} disabled={!!trabajando}
          onClick={() => hacer('Quitando el transportista', () => quitarTransportista(e.id), 'Transportista quitado: el envío vuelve a «Sin asignar».')}>Quitar transportista</button>}
        <button className="btn-primary" onClick={guardar} disabled={!!trabajando}>Guardar asignación</button>
      </>}>
      <div className="ptar-sitio-grid">
        <div style={{ gridColumn: '1/-1' }}>
          <label htmlFor="as-tra">Transportista <span className="sitio-req">· obligatorio</span></label>
          <Buscador id="as-tra" valor={t} buscar={opciones} onElegir={setT} placeholder="Busca por nombre, CIF, código de bolsa, teléfono o matrícula…"
            vacio="Ningún transportista coincide. Si es nuevo, dalo de alta en Otras gestiones → Transportistas." />
        </div>
        <div style={{ gridColumn: '1/-1' }}>
          <label htmlFor="as-dia">Día en que carga {conVentana ? <span className="sitio-req">· obligatorio</span> : null}</label>
          {conVentana && dias.length > 0 ? (
            <select id="as-dia" value={diaCarga} onChange={(ev) => setDiaCarga(ev.target.value)}>
              <option value="">Elige el día de la ventana…</option>
              {dias.map((d) => { const w = new Date(`${d}T12:00:00`).getDay(); return <option key={d} value={d} disabled={w === 0 || w === 6}>{fecha(d)} · {DIAS[w]}{w === 0 || w === 6 ? ' (no circula)' : ''}</option>; })}
            </select>
          ) : conVentana ? (
            <input id="as-dia" type="date" value={diaCarga} onChange={(ev) => setDiaCarga(ev.target.value)} />
          ) : <div style={{ minHeight: 40, display: 'flex', alignItems: 'center', fontWeight: 700 }}>{fecha(dias[0])} (fecha fija)</div>}
          <div style={{ fontSize: 'var(--fs-s)', color: 'var(--gray-500)', marginTop: '0.25rem' }}>Con este día va el seguimiento automático: sale hacia la carga y llega a la 1.ª parada a la hora de Parámetros.</div>
        </div>
        <div>
          <label htmlFor="as-precio">Precio del transportista (€ sin IVA)</label>
          <input id="as-precio" type="text" inputMode="decimal" value={precio} placeholder="Ej. 720" onChange={(ev) => setPrecio(ev.target.value)} />
        </div>
        <div>
          <label>Margen</label>
          <div style={{ minHeight: 40, display: 'flex', alignItems: 'center', fontWeight: 800, color: margen == null ? 'var(--gray-500)' : margen >= 0 ? '#0f6b3a' : '#dc2626' }}>
            {margen == null ? '—' : `${euros(margen)}${pc ? ` (${Math.round((margen / pc) * 100)} %)` : ''}`}
          </div>
        </div>
        <div>
          <label htmlFor="as-camion">Matrícula camión / tractora</label>
          <input id="as-camion" list="as-camiones" type="text" value={camion} placeholder="1234ABC" onChange={(ev) => setCamion(ev.target.value)} onBlur={alSalirCamion} />
          <datalist id="as-camiones">{camiones.map((v) => <option key={v.matricula} value={v.matricula}>{v.tipo === 'rigido' ? 'Rígido' : 'Tractora'}</option>)}</datalist>
        </div>
        <div>
          <label htmlFor="as-remolque">Matrícula remolque (si es tráiler)</label>
          <input id="as-remolque" list="as-remolques" type="text" value={remolque} placeholder="R1234BCD" onChange={(ev) => setRemolque(ev.target.value)} />
          <datalist id="as-remolques">{remolques.map((v) => <option key={v.matricula} value={v.matricula} />)}</datalist>
        </div>
        <div>
          <label htmlFor="as-conductor">Conductor</label>
          <input id="as-conductor" list="as-conductores" type="text" value={conductor} placeholder="Nombre y apellidos"
            onChange={(ev) => setConductor(ev.target.value)} onBlur={alSalirConductor} />
          <datalist id="as-conductores">{(fl?.conductores ?? []).map((c) => <option key={c.nombre} value={c.nombre} />)}</datalist>
        </div>
        <div>
          <label htmlFor="as-tel">Teléfono del conductor</label>
          <CampoTelefono id="as-tel" valor={tel} onCambio={setTel} />
        </div>
      </div>
      {e.requiere_nima && t && !t.nima && <div className="modal-warn-box" style={{ marginTop: '0.8rem' }}><strong>Este envío requiere NIMA</strong> y la ficha de este transportista no lo tiene. Pídeselo y ponlo en su ficha.</div>}
      {t?.estado === 'no_ofertar' && <div className="modal-warn-box" style={{ marginTop: '0.8rem' }}>Este transportista está marcado como <strong>no ofertar</strong>: se le puede dar el envío, pero revisa por qué.</div>}
      <p style={{ fontSize: 'var(--fs-s)', color: 'var(--gray-500)', margin: '0.7rem 0 0' }}>Las matrículas y el conductor se pueden dejar para más tarde. Queda en el historial quién asignó y a qué hora.</p>
      {error && <div className="wiz-warn show" role="alert">⚠ {error}</div>}
      {trabajando && <Cargando texto={trabajando} />}
    </Modal>
  );
}
