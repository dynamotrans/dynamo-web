'use client';

// Ficha del envío (solo Dynamo, etapa A): el "Ver detalle" de dashboard.html con datos
// reales. Secciones Solicitud · Transporte · Ruta · Mercancía · Precio · Penalizaciones ·
// Historial, y las acciones arriba (Asignar transportista, Cambiar estado, Modificar,
// Cancelar / Deshacer). Todo lo vuelve a comprobar el servidor y la base de datos.
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Modal from './Modal';
import Cargando from '@/components/Cargando';
import { IconoTipo, nombreTipo } from './TipoSitio';
import { euros, fecha, ventana } from '@/lib/formato';
import { creadoTxt } from '@/lib/envios';
import { paisDe, telBonito } from '@/lib/paises';
import type { Ficha, ParadaFicha, TransportistaOpcion } from '@/lib/fichaEnvio';
import {
  asignarTransportista, quitarTransportista, cambiarEstado, cancelarEnvio, deshacerCancelacion, modificarEnvio,
  type DatosEnvio,
} from '@/app/panel/(app)/envios/acciones';

const ESTADOS: [string, string, string][] = [
  ['programado', 'Programado', 'prog'], ['hacia_la_carga', 'Hacia la carga', 'hacia'], ['cargando', 'Cargando', 'cargando'],
  ['en_ruta', 'En ruta', 'enruta'], ['entregado', 'Entregado', 'entregado'], ['cancelado', 'Cancelada', 'cancelada'], ['borrador', 'Borrador', 'prog'],
];
const HITOS: Record<string, string> = {
  creado: 'Envío creado', confirmado: 'Envío confirmado', publicado_bolsa: 'Publicado en la bolsa de cargas',
  transportista_asignado: 'Transportista asignado', transportista_quitado: 'Transportista quitado',
  matricula_asignada: 'Matrícula asignada', cargado: 'Cargado · en ruta', entregado: 'Entregado',
  cancelado: 'Cancelado', cancelacion_deshecha: 'Cancelación deshecha', ofertado: 'Ofertado a un transportista',
  enlace_abierto: 'Enlace de la oferta abierto', reservado: 'Reservado por un transportista',
  reserva_caducada: 'Reserva caducada', reserva_liberada: 'Reserva liberada',
  contraoferta_propuesta: 'Contraoferta propuesta', contraoferta_resuelta: 'Contraoferta resuelta',
  orden_transporte_enviada: 'Orden de transporte enviada', cmr_firmado: 'CMR firmado',
  pin_enviado: 'PIN enviado', pin_validado: 'PIN validado', pin_validado_manual: 'PIN validado a mano',
  pin_fuera_de_orden: 'PIN fuera de orden', pin_bloqueado: 'PIN bloqueado', incidencia: 'Nota / incidencia',
};
const ORIGEN: Record<string, string> = { app: '', trigger: 'automático', sistema: 'automático', migracion: 'migración' };

const nombreEstado = (e: string) => ESTADOS.find(([k]) => k === e)?.[1] ?? e;
const aNum = (t: string) => { const v = t.trim(); if (!v) return null; const n = Number(v.replace(/\./g, '').replace(',', '.')); return Number.isFinite(n) ? n : NaN; };
const txtNum = (n: number | null | undefined) => (n == null ? '' : String(n).replace('.', ','));
const hoy = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date());

// ---- Iconos (regla 0-ter) ---------------------------------------------------------
const I = ({ d }: { d: string[] }) => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: '0.35rem' }}>
    {d.map((x, i) => <path key={i} d={x} />)}
  </svg>
);
const ICO = {
  camion: ['M1 4.5A1.5 1.5 0 0 1 2.5 3h12A1.5 1.5 0 0 1 16 4.5V16H1z', 'M16 8h4l3 3v5h-7z', 'M5.5 21a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z', 'M18.5 21a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z'],
  editar: ['M12 20h9', 'M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z'],
  fase: ['M5 12h14', 'M13 5l7 7-7 7'],
  x: ['M18 6 6 18', 'M6 6l12 12'],
  deshacer: ['M3 7v6h6', 'M21 17a9 9 0 0 0-15-6.7L3 13'],
  ojo: ['M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z', 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z'],
};

function Celda({ l, children, span }: { l: string; children: React.ReactNode; span?: boolean }) {
  return <div style={span ? { gridColumn: '1/-1' } : undefined}><label>{l}</label><span className="v">{children ?? '—'}</span></div>;
}
const Pend = () => <span style={{ color: 'var(--gray-500)', fontStyle: 'italic', fontWeight: 500 }}>Pendiente</span>;
function Interruptor({ k, l, v, on }: { k: string; l: string; v: boolean; on: (b: boolean) => void }) {
  return (
    <div>
      <label>{l}</label>
      <label className="ptar-tramp-box">
        <input id={k} type="checkbox" className="ptar-switch-input" checked={v} onChange={(e) => on(e.target.checked)} />
        <span className="ptar-switch" aria-hidden="true" />
        <span className="ptar-tramp-state" aria-hidden="true"><span className="tramp-off">No</span><span className="tramp-on">Sí</span></span>
      </label>
    </div>
  );
}

type Vista = 'ficha' | 'asignar' | 'estado' | 'cancelar' | 'modificar';

export default function FichaEnvio({ ficha, transportistas, cerrarHref }: { ficha: Ficha; transportistas: TransportistaOpcion[]; cerrarHref: string }) {
  const router = useRouter();
  const e = ficha.envio;
  const [vista, setVista] = useState<Vista>('ficha');
  const [aviso, setAviso] = useState<{ ok: boolean; txt: string } | null>(null);
  const [trabajando, setTrabajando] = useState<string | null>(null);
  const cerrar = () => router.push(cerrarHref, { scroll: false });
  const manual = !!e.es_manual;
  const cancelado = e.estado === 'cancelado';
  const est = ESTADOS.find(([k]) => k === e.estado) ?? ESTADOS[0];

  async function hacer(texto: string, fn: () => Promise<{ ok: boolean; error?: string; aviso?: string }>, okTxt?: string) {
    setTrabajando(texto); setAviso(null);
    const r = await fn();
    setTrabajando(null);
    if (!r.ok) { setAviso({ ok: false, txt: r.error ?? 'No se ha podido hacer.' }); return false; }
    setAviso({ ok: true, txt: r.aviso ?? okTxt ?? 'Hecho.' });
    setVista('ficha');
    router.refresh();
    return true;
  }

  // ---- Acciones de arriba según el estado (mismo árbol que el mockup) --------------
  const acciones = cancelado ? (
    <button className="btn-primary" onClick={() => hacer('Deshaciendo la cancelación', () => deshacerCancelacion(e.id), 'Cancelación deshecha: el envío vuelve a estar como antes.')}>
      <I d={ICO.deshacer} />Deshacer cancelación
    </button>
  ) : (
    <>
      {!manual && e.estado !== 'entregado' && (
        <button className={ficha.transportista ? 'btn-secondary' : 'btn-primary'} onClick={() => setVista('asignar')}>
          <I d={ICO.camion} />{ficha.transportista ? 'Cambiar transportista' : 'Asignar transportista'}
        </button>
      )}
      <button className="btn-secondary" onClick={() => setVista('estado')}><I d={ICO.fase} />Cambiar estado</button>
      <button className="btn-secondary" onClick={() => setVista('modificar')}><I d={ICO.editar} />Modificar</button>
      <button className="btn-primary" style={{ background: 'var(--red)' }} onClick={() => setVista('cancelar')}><I d={ICO.x} />Cancelar envío</button>
    </>
  );

  if (vista === 'asignar') return <Asignar ficha={ficha} transportistas={transportistas} onVolver={() => setVista('ficha')} hacer={hacer} trabajando={trabajando} />;
  if (vista === 'estado') return <Estado ficha={ficha} onVolver={() => setVista('ficha')} hacer={hacer} trabajando={trabajando} />;
  if (vista === 'cancelar') return <Cancelar ficha={ficha} onVolver={() => setVista('ficha')} hacer={hacer} trabajando={trabajando} />;
  if (vista === 'modificar') return <Modificar ficha={ficha} onVolver={() => setVista('ficha')} hacer={hacer} trabajando={trabajando} />;

  const recogidas = ficha.paradas.filter((p) => p.tipo === 'carga');
  const entregas = ficha.paradas.filter((p) => p.tipo === 'descarga');
  const pc = e.importe_cliente != null ? Number(e.importe_cliente) : null;
  const pt = e.importe_transportista != null ? Number(e.importe_transportista) : null;

  return (
    <Modal abierto ancho={760} onCerrar={cerrar} titulo={`Detalle de envío #${e.referencia_gx}`}
      sub={<>{ficha.cliente ? `${ficha.cliente.nombre} · ` : ''}<span className={`badge badge-${est[2]}`}>{est[1]}</span></>}
      icono={<I d={ICO.ojo} />} acciones={acciones}
      pie={<button className="btn-ghost" onClick={cerrar}>Cerrar</button>}>
      {aviso && <div className={`pt-aviso ${aviso.ok ? 'info' : 'error'}`} role="status" style={{ marginBottom: '0.8rem' }}><div>{aviso.txt}</div></div>}

      <h4 className="modal-section-title">Solicitud</h4>
      <div className="det-block"><div className="modal-info-grid">
        <Celda l="Nº de envío">#{e.referencia_gx}</Celda>
        <Celda l="Ref. cliente">{e.referencia_cliente || '—'}</Celda>
        <Celda l="Cliente">{ficha.cliente ? <>{ficha.cliente.nombre} <span style={{ color: 'var(--gray-500)' }}>· {ficha.cliente.cif}</span></> : '—'}</Celda>
        <Celda l="Estado">{est[1]}</Celda>
        {manual && <Celda l="Operador de transporte" span><span style={{ color: '#b45309', fontWeight: 700 }}>{ficha.operador ?? '—'}</span> · envío registrado a mano (Dynamo no interviene en el transporte)</Celda>}
        <Celda l="Creado">{creadoTxt(e.creado_en)}{ficha.creadoPor ? ` · ${ficha.creadoPor}` : ''}</Celda>
        <Celda l="Última modificación">{e.modificado_en ? creadoTxt(e.modificado_en) : '—'}</Celda>
        <Celda l={e.fecha_carga_real ? 'Fecha de carga real' : 'Fecha de carga · días de recogida'}>{e.fecha_carga_real ? fecha(e.fecha_carga_real) : ventana(e.fecha_carga_desde, e.fecha_carga_hasta)}</Celda>
        <Celda l="Entrega estimada">{e.fecha_entrega_estimada ? fecha(e.fecha_entrega_estimada) : <Pend />}</Celda>
        {e.discrecion_comercial && <Celda l="Discreción comercial" span><span style={{ color: 'var(--purple)', fontWeight: 700 }}>Activada</span> — el conductor no revela el destino en la carga ni el origen en la entrega</Celda>}
      </div></div>

      {!manual && <>
        <h4 className="modal-section-title">Transporte</h4>
        <div className="det-block">
          <div className="modal-info-grid">
            <Celda l="Estado asignación transportista" span>
              {cancelado || e.estado === 'entregado' ? '—' : ficha.transportista
                ? <span className="asig-line asig-confirmado" style={{ marginTop: 0 }}><span className="asig-dot" />Confirmado transportista</span>
                : <span className="asig-line asig-asignandose" style={{ marginTop: 0 }}><span className="asig-dot" />Asignándose transportista</span>}
            </Celda>
            <Celda l="Transportista asignado el">{e.asignado_en ? creadoTxt(e.asignado_en) : <Pend />}</Celda>
            <Celda l="Precio del transportista (sin IVA)">{pt != null ? euros(pt) : <Pend />}</Celda>
          </div>
          <div className="det-transp-card">
            <div className="dtc-main"><I d={ICO.camion} /><strong>{ficha.transportista ? `${ficha.transportista.nombre} · ${ficha.transportista.cif}` : <Pend />}</strong></div>
            <div className="dtc-row">
              <span className="dtc-item"><label>Matrícula</label><span className="dtc-v">{e.matricula_camion ? <span className="dtc-mat">{e.matricula_camion}</span> : <Pend />}</span></span>
              <span className="dtc-item"><label>Remolque</label><span className="dtc-v">{e.matricula_remolque ? <span className="dtc-mat">{e.matricula_remolque}</span> : '—'}</span></span>
              <span className="dtc-item"><label>Conductor</label><span className="dtc-v">{e.conductor_nombre || <Pend />}</span></span>
              <span className="dtc-item"><label>Teléfono</label><span className="dtc-v">{e.conductor_telefono ? <a href={`tel:${e.conductor_telefono}`} style={{ color: 'var(--purple)', fontWeight: 600 }}>{telBonito(e.conductor_telefono)}</a> : <Pend />}</span></span>
            </div>
            {e.nima_requerido && <div style={{ marginTop: '0.4rem', fontSize: 'var(--fs-m)' }}>NIMA del transportista: <strong>{e.transportista_nima || <Pend />}</strong></div>}
          </div>
        </div>
      </>}

      <h4 className="modal-section-title">Ruta</h4>
      <div className="det-ruta">
        {recogidas.map((p, i) => <Punto key={p.id} p={p} cls="rec" num={i + 1} label={`Recogida ${i + 1}`} />)}
        {entregas.map((p, i) => <Punto key={p.id} p={p} cls="ent" num={i + 1} label={`Entrega ${i + 1}`} />)}
      </div>

      <h4 className="modal-section-title">Mercancía</h4>
      <div className="det-block"><div className="modal-info-grid">
        <Celda l="Mercancía">{e.descripcion_mercancia || (e.paletizado === false ? 'No paletizada' : 'Paletizada')}</Celda>
        <Celda l="Medidas">{[e.metros_lineales != null && `${txtNum(e.metros_lineales)} m`, e.toneladas != null && `${txtNum(e.toneladas)} Tn`].filter(Boolean).join(' · ') || '—'}</Celda>
        <Celda l="Tipo de carga">{e.tipo_carga === 'completa' ? 'Completo' : e.tipo_carga === 'grupaje' ? 'Grupaje' : '—'}</Celda>
        <Celda l="Forma de carga">{[e.carga_lateral && 'Lateral', e.carga_trasera && 'Trasera', e.carga_superior && 'Techo'].filter(Boolean).join(', ') || '—'}</Celda>
        <Celda l="Requisitos" span>{[e.plataforma_elevadora && 'Trampilla elevadora', e.nima_requerido && 'Requiere NIMA', e.adr && 'Mercancía ADR', e.paletizado === false && 'No paletizada'].filter(Boolean).join(' · ') || 'Ninguno'}</Celda>
        {e.anotaciones_cliente && <Celda l="Anotaciones" span>{e.anotaciones_cliente}</Celda>}
      </div></div>

      <h4 className="modal-section-title">Precio</h4>
      <div className="det-block">
        {manual ? (
          e.precio_acordado_operador != null ? (
            <div className="alm-price" style={{ margin: 0 }}>
              <div className="alm-price-row alm-price-base"><span className="k">Precio acordado con su transportista (sin IVA)</span><span className="v">{euros(e.precio_acordado_operador)}</span></div>
            </div>
          ) : <div className="modal-info-grid"><Celda l="Precio acordado" span>No anotado</Celda></div>
        ) : pc == null ? <div className="modal-info-grid"><Celda l="Precio" span><Pend /></Celda></div> : (
          <div className="alm-price" style={{ margin: 0 }}>
            <div className="alm-price-row alm-price-base"><span className="k">Base imponible</span><span className="v">{euros(pc)}</span></div>
            <div className="alm-price-row alm-price-sub"><span className="k">IVA ({txtNum(e.iva_aplicado ?? 21)} %)</span><span className="v">{euros(pc * Number(e.iva_aplicado ?? 21) / 100)}</span></div>
            <div className="alm-price-row alm-price-sub"><span className="k">Total (IVA incl.)</span><span className="v">{euros(pc * (1 + Number(e.iva_aplicado ?? 21) / 100))}</span></div>
          </div>
        )}
        {!manual && (
          <div className="pen-envio-sum" style={{ marginTop: '0.6rem' }}>
            <div className="pen-sum-row"><span className="k">P. transportista <span style={{ color: 'var(--red)', fontWeight: 800 }}>· solo admin</span></span><span className="v">{pt != null ? euros(pt) : '—'}</span></div>
            <div className="pen-sum-row"><span className="k">Margen</span><span className="v" style={{ color: e.margen_euros == null ? undefined : Number(e.margen_euros) >= 0 ? '#0f6b3a' : '#dc2626', fontWeight: 800 }}>{e.margen_euros != null ? euros(e.margen_euros) : '—'}</span></div>
            {e.factor_tarifa_aplicado != null && <div className="pen-sum-row"><span className="k">Factor del cliente aplicado</span><span className="v">{txtNum(e.factor_tarifa_aplicado)} %</span></div>}
            {e.precio_fijado_a_mano && <div className="pen-sum-row"><span className="k">Precio</span><span className="v">fijado a mano</span></div>}
          </div>
        )}
      </div>

      {ficha.penalizaciones.length > 0 && <>
        <h4 className="modal-section-title">Penalizaciones</h4>
        <div className="pen-envio-sum">
          {ficha.penalizaciones.map((p) => (
            <div key={p.id} className="pen-sum-row">
              <span className="k">{p.codigo} · {p.tipo}{p.generada_auto ? ' · automática' : ''} · <em>{p.estado === 'pendiente_confirmar' ? 'pendiente de confirmar' : p.estado}</em></span>
              <span className="v">{euros(p.importe_cliente)}</span>
            </div>
          ))}
        </div>
      </>}

      <h4 className="modal-section-title">Historial</h4>
      <div className="pen-envio-sum">
        {ficha.hitos.length === 0 && <div className="pen-sum-row"><span className="k">Sin movimientos</span><span className="v" /></div>}
        {ficha.hitos.map((h) => (
          <div key={h.id} className="pen-sum-row">
            <span className="k" style={{ whiteSpace: 'nowrap' }}>{creadoTxt(h.cuando)}</span>
            <span className="v" style={{ textAlign: 'right' }}>
              {HITOS[h.hito] ?? h.hito}
              {h.datos?.motivo_cancelacion && <> — «{h.datos.motivo_cancelacion}»</>}
              {h.hito === 'matricula_asignada' && h.datos?.camion && <> — {h.datos.camion}{h.datos.remolque ? ` + ${h.datos.remolque}` : ''}</>}
              <span style={{ color: 'var(--gray-500)', fontWeight: 500 }}>{h.quien ? ` · ${h.quien}` : ORIGEN[h.origen ?? ''] ? ` · ${ORIGEN[h.origen ?? '']}` : ''}</span>
            </span>
          </div>
        ))}
      </div>
      {trabajando && <Cargando texto={trabajando} />}
    </Modal>
  );
}

function Punto({ p, cls, num, label }: { p: ParadaFicha; cls: 'rec' | 'ent'; num: number; label: string }) {
  const s = p.sitio;
  const c = s?.contacto;
  return (
    <div className="det-punto">
      <div className="det-punto-head">
        <span className={`ptar-route-num ${cls}`}>{num}</span>
        <span className="det-punto-ico"><IconoTipo tipo={s?.tipo ?? 'almacen_nave'} /></span>
        <span className="det-punto-label">{label}</span>
        <span className="det-punto-tipo">{nombreTipo(s?.tipo)}</span>
      </div>
      <div className="det-punto-body">
        {p.nombre_empresa && <strong>{s?.url_google_maps ? <a href={s.url_google_maps} target="_blank" rel="noopener" style={{ color: 'var(--purple)' }}>{p.nombre_empresa}</a> : p.nombre_empresa}</strong>}
        {p.nombre_empresa && <br />}
        {[p.direccion, [p.codigo_postal, p.poblacion].filter(Boolean).join(' '), p.provincia && p.provincia !== p.poblacion ? p.provincia : '', paisDe(p.pais_codigo_iso ?? 'ES')].filter(Boolean).join(', ')}
        {(s?.horarios || c?.telefono) && (
          <div style={{ fontSize: 'var(--fs-m)', color: 'var(--gray-500)', marginTop: 2 }}>
            {s?.horarios && <>Horario: {s.horarios}</>}
            {s?.horarios && c?.telefono && ' · '}
            {c?.telefono && <>Tfno: <a href={`tel:${c.telefono}`} style={{ color: 'var(--purple)', fontWeight: 600 }}>{telBonito(c.telefono)}</a>{c.nombre ? ` (${c.nombre})` : ''}</>}
          </div>
        )}
        {(s?.requiere_cita || s?.tiene_medios_carga === false) && (
          <div style={{ fontSize: 'var(--fs-m)', color: '#b45309', fontWeight: 600, marginTop: 2 }}>{[s?.requiere_cita && 'Con cita previa', s?.tiene_medios_carga === false && 'Sin medios de carga (hace falta trampilla)'].filter(Boolean).join(' · ')}</div>
        )}
        {p.referencia && <div style={{ fontSize: 'var(--fs-m)', marginTop: 2 }}>Referencia: <strong>{p.referencia}</strong></div>}
        {[s?.anotaciones, p.anotaciones].filter(Boolean).map((n, i) => (
          <div key={i} style={{ fontSize: 'var(--fs-m)', color: '#b45309', background: '#fef3c7', borderRadius: 8, padding: '0.35rem 0.5rem', marginTop: 4 }}>⚠ {n}</div>
        ))}
      </div>
    </div>
  );
}

type SubProps = { ficha: Ficha; onVolver: () => void; trabajando: string | null;
  hacer: (t: string, fn: () => Promise<{ ok: boolean; error?: string; aviso?: string }>, okTxt?: string) => Promise<boolean> };

// ---- Asignar / cambiar transportista ------------------------------------------------
function Asignar({ ficha, transportistas, onVolver, hacer, trabajando }: SubProps & { transportistas: TransportistaOpcion[] }) {
  const e = ficha.envio;
  const [tid, setTid] = useState<string>(ficha.transportista?.id ?? '');
  const [precio, setPrecio] = useState(txtNum(e.importe_transportista));
  const [camion, setCamion] = useState<string>(e.matricula_camion ?? '');
  const [remolque, setRemolque] = useState<string>(e.matricula_remolque ?? '');
  const [conductor, setConductor] = useState<string>(e.conductor_nombre ?? '');
  const [tel, setTel] = useState<string>(e.conductor_telefono ?? '');
  const [error, setError] = useState<string | null>(null);
  const t = transportistas.find((x) => x.id === tid);
  const pc = e.importe_cliente != null ? Number(e.importe_cliente) : null;
  const pv = aNum(precio);
  const margen = pc != null && pv != null && !Number.isNaN(pv) ? pc - pv : null;
  const camiones = useMemo(() => (t?.vehiculos ?? []).filter((v) => v.tipo !== 'remolque'), [t]);
  const remolques = useMemo(() => (t?.vehiculos ?? []).filter((v) => v.tipo === 'remolque'), [t]);

  async function guardar() {
    setError(null);
    if (!tid) { setError('Elige el transportista.'); return; }
    if (Number.isNaN(pv)) { setError('El precio del transportista no es un número.'); return; }
    await hacer('Asignando el transportista', () => asignarTransportista(e.id, {
      transportista_id: tid, importe_transportista: pv, matricula_camion: camion, matricula_remolque: remolque,
      conductor_nombre: conductor, conductor_telefono: tel,
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
          <select id="as-tra" value={tid} onChange={(ev) => setTid(ev.target.value)}>
            <option value="">Elige el transportista…</option>
            {transportistas.map((x) => (
              <option key={x.id} value={x.id} disabled={x.estado === 'suspendido'}>
                {x.nombre} · {x.cif}{x.estado === 'suspendido' ? ' · SUSPENDIDO' : x.estado === 'no_ofertar' ? ' · no ofertar' : ''}
              </option>
            ))}
          </select>
          {transportistas.length === 0 && <div style={{ fontSize: 'var(--fs-s)', color: 'var(--gray-500)', marginTop: '0.25rem' }}>Aún no hay transportistas: dalos de alta en Otras gestiones → Transportistas.</div>}
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
          <input id="as-camion" list="as-camiones" type="text" value={camion} placeholder="1234ABC" onChange={(ev) => setCamion(ev.target.value)} />
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
            onChange={(ev) => { setConductor(ev.target.value); const c = t?.conductores.find((x) => x.nombre === ev.target.value); if (c?.telefono) setTel(c.telefono); }} />
          <datalist id="as-conductores">{(t?.conductores ?? []).map((c) => <option key={c.nombre} value={c.nombre} />)}</datalist>
        </div>
        <div>
          <label htmlFor="as-tel">Teléfono del conductor</label>
          <input id="as-tel" type="tel" inputMode="tel" value={tel} placeholder="+34 600 000 000" onChange={(ev) => setTel(ev.target.value)} />
        </div>
      </div>
      {e.nima_requerido && t && !t.nima && <div className="modal-warn-box" style={{ marginTop: '0.8rem' }}><strong>Este envío requiere NIMA</strong> y la ficha de este transportista no lo tiene. Pídeselo y ponlo en su ficha.</div>}
      {t?.estado === 'no_ofertar' && <div className="modal-warn-box" style={{ marginTop: '0.8rem' }}>Este transportista está marcado como <strong>no ofertar</strong>: se le puede dar carga, pero revisa por qué.</div>}
      <p style={{ fontSize: 'var(--fs-s)', color: 'var(--gray-500)', margin: '0.7rem 0 0' }}>Las matrículas y el conductor se pueden dejar para más tarde. Queda en el historial quién asignó y a qué hora.</p>
      {error && <div className="wiz-warn show" role="alert">⚠ {error}</div>}
      {trabajando && <Cargando texto={trabajando} />}
    </Modal>
  );
}

// ---- Cambiar estado (fase del envío) -----------------------------------------------
function Estado({ ficha, onVolver, hacer, trabajando }: SubProps) {
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

// ---- Cancelar -----------------------------------------------------------------------
function Cancelar({ ficha, onVolver, hacer, trabajando }: SubProps) {
  const e = ficha.envio;
  const [motivo, setMotivo] = useState('');
  const conCamion = !!ficha.transportista && !e.es_manual;
  const fuera = conCamion && ficha.corte != null && new Date() >= new Date(ficha.corte);
  return (
    <Modal abierto onCerrar={onVolver} titulo={`Cancelar envío #${e.referencia_gx}`} sub={ficha.cliente?.nombre} icono={<I d={ICO.x} />}
      pie={<>
        <button className="btn-ghost" onClick={onVolver} disabled={!!trabajando}>No, volver</button>
        <button className="btn-primary" style={{ background: 'var(--red)' }} disabled={!!trabajando}
          onClick={() => hacer('Cancelando el envío', () => cancelarEnvio(e.id, motivo))}>Sí, cancelar envío</button>
      </>}>
      <div className="modal-warn-box" style={fuera ? { background: 'rgba(220,38,38,0.08)', borderColor: 'rgba(220,38,38,0.4)' } : undefined}>
        {fuera
          ? <><strong style={{ color: '#b42318' }}>Fuera de plazo, con camión asignado:</strong> pasó la hora límite ({creadoTxt(ficha.corte)}). Se generará la <strong>penalización de cancelación por el coste completo</strong>{e.importe_cliente != null ? <> ({euros(e.importe_cliente)} sin IVA)</> : null}, pendiente de confirmar: se puede renegociar o anular en Penalizaciones.</>
          : conCamion
            ? <>Dentro de plazo: <strong>sin coste</strong> para el cliente. La hora límite para cancelar gratis es <strong>{ficha.corte ? creadoTxt(ficha.corte) : '—'}</strong> (9:00 del día hábil anterior a la carga).</>
            : <>Sin transportista asignado: se cancela <strong>sin coste</strong>.</>}
      </div>
      <div className="ptar-sitio-grid">
        <div style={{ gridColumn: '1/-1' }}>
          <label htmlFor="ca-motivo">Motivo (queda en el historial)</label>
          <textarea id="ca-motivo" rows={3} value={motivo} placeholder="Ej. el cliente ya no tiene la mercancía" onChange={(ev) => setMotivo(ev.target.value)} />
        </div>
      </div>
      <p style={{ fontSize: 'var(--fs-s)', color: 'var(--gray-500)', margin: '0.6rem 0 0' }}>Se puede deshacer desde la ficha: el envío vuelve al estado que tenía.</p>
      {trabajando && <Cargando texto={trabajando} />}
    </Modal>
  );
}

// ---- Modificar ----------------------------------------------------------------------
function Modificar({ ficha, onVolver, hacer, trabajando }: SubProps) {
  const e = ficha.envio;
  const manual = !!e.es_manual;
  const [d, setD] = useState({
    referencia_cliente: e.referencia_cliente ?? '', fecha_carga_desde: e.fecha_carga_desde ?? '', fecha_carga_hasta: e.fecha_carga_hasta ?? '',
    fecha_entrega_estimada: e.fecha_entrega_estimada ?? '', descripcion_mercancia: e.descripcion_mercancia ?? '',
    metros: txtNum(e.metros_lineales), toneladas: txtNum(e.toneladas),
    paletizado: e.paletizado !== false, carga_lateral: !!e.carga_lateral, carga_trasera: !!e.carga_trasera, carga_superior: !!e.carga_superior,
    plataforma_elevadora: !!e.plataforma_elevadora, nima_requerido: !!e.nima_requerido, adr: !!e.adr,
    importe_cliente: txtNum(e.importe_cliente), importe_transportista: txtNum(e.importe_transportista), acordado: txtNum(e.precio_acordado_operador),
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
      paletizado: d.paletizado, carga_lateral: d.carga_lateral, carga_trasera: d.carga_trasera, carga_superior: d.carga_superior,
      plataforma_elevadora: d.plataforma_elevadora, nima_requerido: d.nima_requerido, adr: d.adr,
      importe_cliente: n.pc, importe_transportista: n.pt, precio_acordado_operador: n.ac,
      discrecion_comercial: d.discrecion_comercial, anotaciones_cliente: d.anotaciones_cliente,
      paradas: paradas.map(({ id, referencia, anotaciones }) => ({ id, referencia, anotaciones })),
    };
    await hacer('Guardando cambios', () => modificarEnvio(e.id, datos, e.importe_cliente != null ? Number(e.importe_cliente) : null), 'Cambios guardados.');
  }
  const campo = (k: keyof typeof d, l: string, ph?: string, tipo = 'text', full = false) => (
    <div style={full ? { gridColumn: '1/-1' } : undefined}>
      <label htmlFor={`mo-${k}`}>{l}</label>
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
        {campo('descripcion_mercancia', 'Descripción', 'Ej. palés de azulejo', 'text', true)}
        {campo('metros', 'Metros lineales', '13,3')}
        {campo('toneladas', 'Toneladas', '24')}
        {sw('paletizado', 'Paletizada')}
        {sw('carga_lateral', 'Carga lateral')}
        {sw('carga_trasera', 'Carga trasera')}
        {sw('carga_superior', 'Carga por techo')}
        {sw('plataforma_elevadora', 'Trampilla elevadora')}
        {sw('nima_requerido', 'Requiere NIMA')}
        {sw('adr', 'Mercancía ADR')}
        {sw('discrecion_comercial', 'Discreción comercial')}

        <div style={{ gridColumn: '1/-1', marginTop: '0.4rem' }} className="ptar-section-head">Precio (sin IVA)</div>
        {manual
          ? campo('acordado', 'Precio acordado con su transportista (€)', 'Ej. 950')
          : <>{campo('importe_cliente', 'Precio del cliente (€)', 'Ej. 900')}{campo('importe_transportista', 'Precio del transportista (€)', 'Ej. 720')}</>}
        {!manual && <div style={{ gridColumn: '1/-1', fontSize: 'var(--fs-s)', color: 'var(--gray-500)' }}>Si cambias el precio del cliente, queda <strong>fijado a mano</strong>.</div>}

        <div style={{ gridColumn: '1/-1', marginTop: '0.4rem' }} className="ptar-section-head">Paradas</div>
        {paradas.map((p, i) => (
          <div key={p.id} style={{ gridColumn: '1/-1', display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,2fr)', gap: '0.5rem 0.8rem' }}>
            <div style={{ gridColumn: '1/-1', fontWeight: 700, color: 'var(--navy)', fontSize: 'var(--fs-m)' }}>{p.titulo}</div>
            <div><label htmlFor={`mo-ref-${i}`}>Referencia</label><input id={`mo-ref-${i}`} type="text" value={p.referencia} placeholder="Nº de carga del almacén"
              onChange={(ev) => setParadas((l) => l.map((x, j) => (j === i ? { ...x, referencia: ev.target.value } : x)))} /></div>
            <div><label htmlFor={`mo-not-${i}`}>Anotaciones de esta parada</label><input id={`mo-not-${i}`} type="text" value={p.anotaciones} placeholder="Ej. preguntar por Manolo"
              onChange={(ev) => setParadas((l) => l.map((x, j) => (j === i ? { ...x, anotaciones: ev.target.value } : x)))} /></div>
          </div>
        ))}
        <div style={{ gridColumn: '1/-1' }}>
          <label htmlFor="mo-anot">Anotaciones del envío</label>
          <textarea id="mo-anot" rows={2} value={d.anotaciones_cliente} onChange={(ev) => set('anotaciones_cliente', ev.target.value)} />
        </div>
      </div>
      <p style={{ fontSize: 'var(--fs-s)', color: 'var(--gray-500)', margin: '0.7rem 0 0' }}>Para cambiar los sitios de la ruta, de momento cancela el envío y créalo de nuevo (cambiar la ruta desde aquí llega más adelante).</p>
      {error && <div className="wiz-warn show" role="alert">⚠ {error}</div>}
      {trabajando && <Cargando texto={trabajando} />}
    </Modal>
  );
}
