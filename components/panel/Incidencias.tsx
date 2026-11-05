'use client';

// Incidencias (solo Dynamo): tabla y ficha con el diseño de #sec-incidencias de
// dashboard.html (pestañas Abiertas · Resueltas · Todas; columnas F. registro ·
// Descripción · Nº envío · Ref. cliente · F. carga · Ruta · m · Tn · Estado; ventana
// «Reportar incidencia» con el envío relacionado y su resumen).
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useRefrescar } from '@/lib/useRefrescar';
import Historial from './Historial';
import Modal from './Modal';
import Cargando from '@/components/Cargando';
import BuscaEnvio from './BuscaEnvio';
import Documentos from './Documentos';
import type { EnvioLigero } from '@/lib/enviosLigeros';
import { guardarIncidencia, type IncidenciaDatos } from '@/app/panel/(app)/incidencias/acciones';
import { fecha, ventana, pesoTn, fechaHora, metros, medidasTxt } from '@/lib/formato';

export type IncidenciaFila = {
  id: string; codigo: string; envio_id: string | null; cliente_id: string | null; tipo_id: string; tipo: string;
  titulo: string; detalle: string | null; estado: IncidenciaDatos['estado']; prioridad: IncidenciaDatos['prioridad'];
  resolucion: string | null; resuelto_en: string | null; creado_en: string; modificado_en: string | null; cliente: string | null;
  envio: { referencia_gx: string; referencia_cliente: string | null; fecha_carga_desde: string | null; fecha_carga_hasta: string | null;
    origen: string; destino: string; metros_lineales: number | null; toneladas: number | null } | null;
};
type Opcion = { id: string; nombre?: string; nombre_visible?: string; activo?: boolean };

const ESTADOS: [IncidenciaDatos['estado'], string, string][] = [
  ['abierto', 'Abierta', 'orange'], ['en_curso', 'En curso', 'blue'], ['resuelto', 'Resuelta', 'green'], ['cancelado', 'Cancelada', 'cancelada'],
];
const PRIORIDADES: [IncidenciaDatos['prioridad'], string, string][] = [
  ['baja', 'Baja', 'gray'], ['media', 'Media', 'prog'], ['alta', 'Alta', 'orange'], ['critica', 'Crítica', 'red'],
];
const abierta = (e: string) => e === 'abierto' || e === 'en_curso';
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const n = (v: number | null) => (v == null ? '' : String(v).replace('.', ','));
const IcoAviso = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>;
const horaMadrid = (iso: string) => new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
const diaMadrid = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date(iso));

export default function Incidencias({ filas, tipos, clientes, envios, nuevaPara, error, esCliente = false, esTransportista = false, tipoInicial = null }: {
  filas: IncidenciaFila[]; tipos: Opcion[]; clientes: Opcion[]; envios: EnvioLigero[]; nuevaPara: string | null; error: string | null;
  tipoInicial?: string | null;   // ?tipo=siniestro: el formulario nuevo ya con ese tipo
  esCliente?: boolean;   // el CLIENTE (o el transportista) ve y abre las suyas; el estado, la prioridad y la resolución son de Dynamo
  esTransportista?: boolean;   // el viaje es obligatorio y solo ve las que abre él
}) {
  const router = useRouter();
  const refrescar = useRefrescar();
  const [pestana, setPestana] = useState<'abiertas' | 'resueltas' | 'todas'>('abiertas');
  const [q, setQ] = useState('');
  const [ficha, setFicha] = useState<{ fila: IncidenciaFila | null; envio?: string | null } | null>(nuevaPara != null ? { fila: null, envio: nuevaPara || null } : null);

  const cuenta = useMemo(() => ({ abiertas: filas.filter((x) => abierta(x.estado)).length, resueltas: filas.filter((x) => !abierta(x.estado)).length, todas: filas.length }), [filas]);
  const lista = useMemo(() => {
    const w = norm(q.trim()).split(/\s+/).filter(Boolean);
    return filas.filter((x) => (pestana === 'todas' || (pestana === 'abiertas') === abierta(x.estado))
      && (!w.length || (() => { const b = norm([x.codigo, x.tipo, x.titulo, x.detalle, x.cliente, x.envio?.referencia_gx, x.envio?.referencia_cliente,
        x.envio?.origen, x.envio?.destino, ESTADOS.find(([k]) => k === x.estado)?.[1], fecha(diaMadrid(x.creado_en))].filter(Boolean).join(' ')); return w.every((t) => b.includes(t)); })()));
  }, [filas, pestana, q]);
  const cerrar = () => { setFicha(null); if (nuevaPara != null) router.replace('/panel/incidencias'); };

  return (
    <section className="section active" id="sec-incidencias">
      <div className="sec-header">
        <h2>Incidencias</h2>
        <div className="sec-header-actions"><button className="btn-primary" onClick={() => setFicha({ fila: null })}>+ Reportar incidencia</button></div>
      </div>
      <div className="tabs">
        <button className={`tab${pestana === 'abiertas' ? ' active' : ''}`} onClick={() => setPestana('abiertas')}>Abiertas ({cuenta.abiertas})</button>
        <button className={`tab${pestana === 'resueltas' ? ' active' : ''}`} onClick={() => setPestana('resueltas')}>Resueltas ({cuenta.resueltas})</button>
        <button className={`tab${pestana === 'todas' ? ' active' : ''}`} onClick={() => setPestana('todas')}>Todas</button>
      </div>
      <div className="filters">
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={esCliente ? 'Buscar por descripción, nº de envío, ruta…' : 'Buscar por descripción, nº de envío, cliente, ruta…'} />
      </div>
      {error && <div className="pt-aviso error">No se han podido cargar las incidencias: {error}</div>}
      <div className="table-wrap">
        <table className="data">
          <thead><tr>
            <th>F. registro</th><th>Descripción</th><th>Nº envío</th><th>Ref. cliente</th><th>F. carga · Días de recogida</th><th>Ruta</th><th>m · Tn</th><th>Estado</th>
          </tr></thead>
          <tbody>
            {lista.length === 0 ? (
              <tr><td colSpan={8} style={{ textAlign: 'center', padding: '2rem', color: 'var(--gray-500)' }}>
                {filas.length ? 'Sin incidencias en este filtro' : 'Aún no hay incidencias. Abre una con «+ Reportar incidencia».'}
              </td></tr>
            ) : lista.map((x) => {
              const est = ESTADOS.find(([k]) => k === x.estado) ?? ESTADOS[0];
              const pri = PRIORIDADES.find(([k]) => k === x.prioridad);
              const e = x.envio;
              return (
                <tr key={x.id} onClick={() => setFicha({ fila: x })} style={{ cursor: 'pointer' }}>
                  <td>{fecha(diaMadrid(x.creado_en))}<div className="meta">{horaMadrid(x.creado_en)} · {x.codigo}</div></td>
                  <td><strong>{x.tipo}</strong><div className="meta">{x.titulo}</div></td>
                  <td className="ref">{e ? <strong>#{e.referencia_gx}</strong> : '—'}{!esCliente && <div className="meta">{x.cliente ?? ''}</div>}</td>
                  <td className="ref-cli">{e?.referencia_cliente ?? '—'}</td>
                  <td>{e ? <><strong>{fecha(e.fecha_carga_desde)}</strong><div className="meta">{ventana(e.fecha_carga_desde, e.fecha_carga_hasta)}</div></> : '—'}</td>
                  <td className="route">{e ? <><strong>{e.origen || '—'}</strong><span className="arrow">→</span><strong>{e.destino || '—'}</strong></> : '—'}</td>
                  <td className="amount">{e && (e.metros_lineales != null || e.toneladas != null) ? medidasTxt(e.metros_lineales, e.toneladas) : '—'}</td>
                  <td><span className={`badge badge-${est[2]}`}>{est[1]}</span>{pri && x.prioridad !== 'media' && abierta(x.estado) && <div style={{ marginTop: 3 }}><span className={`badge badge-${pri[2]}`}>Prioridad {pri[1].toLowerCase()}</span></div>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {ficha && <FichaIncidencia esCliente={esCliente} esTransportista={esTransportista} fila={ficha.fila} envioInicial={ficha.envio ?? null} tipoInicial={ficha.fila ? null : tipoInicial} tipos={tipos} clientes={clientes} envios={envios}
        onCerrar={cerrar} onHecho={() => { cerrar(); refrescar(); }} />}
    </section>
  );
}

function FichaIncidencia({ fila, envioInicial, tipos, clientes, envios, onCerrar, onHecho, esCliente, esTransportista = false, tipoInicial = null }: {
  fila: IncidenciaFila | null; envioInicial: string | null; tipos: Opcion[]; clientes: Opcion[]; envios: EnvioLigero[]; tipoInicial?: string | null;
  onCerrar: () => void; onHecho: () => void; esCliente: boolean; esTransportista?: boolean;
}) {
  // El cliente solo puede tocarla mientras está abierta (después la lleva Dynamo).
  const soloLectura = esCliente && !!fila && fila.estado !== 'abierto';
  const [d, setD] = useState<IncidenciaDatos>({
    envio_id: fila?.envio_id ?? envioInicial, cliente_id: fila?.cliente_id ?? null, tipo_id: fila?.tipo_id ?? tipoInicial ?? '',
    estado: fila?.estado ?? 'abierto', prioridad: fila?.prioridad ?? 'media',
    titulo: fila?.titulo ?? (tipoInicial ? 'Siniestro: ' : ''), detalle: fila?.detalle ?? '', resolucion: fila?.resolucion ?? '',
  });
  const [error, setError] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState<string | null>(null);
  const [preguntaCancelar, setPreguntaCancelar] = useState(false);
  const set = <K extends keyof IncidenciaDatos>(k: K, v: IncidenciaDatos[K]) => setD((x) => ({ ...x, [k]: v }));

  async function guardar(cambios: Partial<IncidenciaDatos> = {}, texto?: string) {
    const datos = { ...d, ...cambios };
    setError(null);
    if (!datos.tipo_id) { setError('Elige el tipo de incidencia.'); return; }
    if (!datos.detalle.trim()) { setError('Cuenta lo ocurrido en el detalle de la incidencia.'); return; }
    if (!esCliente && !datos.envio_id && !datos.cliente_id) { setError('Elige el envío o, si no va sobre un envío, el cliente.'); return; }
    if (esTransportista && !datos.envio_id) { setError('Elige el viaje de la incidencia.'); return; }
    setTrabajando(texto ?? (fila ? 'Guardando incidencia' : 'Creando incidencia'));
    const r = await guardarIncidencia(fila?.id ?? null, datos);
    setTrabajando(null);
    if (!r.ok) { setError(r.error); return; }
    onHecho();
  }

  if (preguntaCancelar) {
    return (
      <Modal abierto titulo="Cancelar incidencia" sub="Quedará retirada (se conserva en el histórico)" icono={<IcoAviso />} onCerrar={() => setPreguntaCancelar(false)}
        pie={<>
          <button className="btn-ghost" onClick={() => setPreguntaCancelar(false)}>No, volver</button>
          <button className="btn-primary" style={{ background: 'var(--red)' }} disabled={!!trabajando} onClick={() => guardar({ estado: 'cancelado' }, 'Cancelando incidencia')}>Sí, cancelar incidencia</button>
        </>}>
        <p style={{ fontSize: 'var(--fs-l)', color: 'var(--gray-700)' }}>¿Seguro que quieres cancelar esta incidencia? Dejará de gestionarse y quedará marcada como <strong>Cancelada</strong>.</p>
        {trabajando && <Cargando texto={trabajando} />}
      </Modal>
    );
  }

  return (
    <Modal abierto titulo={fila ? `${soloLectura ? 'Incidencia' : 'Editar incidencia'} ${fila.codigo}` : 'Reportar incidencia'}
      sub={fila ? 'Cambia lo que necesites y guarda' : 'Cuenta lo ocurrido para actuar rápido'} icono={<IcoAviso />} onCerrar={onCerrar}
      pie={<>
        <button className="btn-ghost" onClick={onCerrar} disabled={!!trabajando}>Cerrar</button>
        {fila && abierta(fila.estado) && !soloLectura && <button className="btn-primary" style={{ background: 'var(--red)' }} onClick={() => setPreguntaCancelar(true)} disabled={!!trabajando}>{esCliente ? 'Retirar incidencia' : 'Cancelar incidencia'}</button>}
        {!soloLectura && <button className="btn-primary" onClick={() => guardar()} disabled={!!trabajando}>{fila ? 'Guardar incidencia' : 'Enviar incidencia'}</button>}
      </>}>
      {fila && (
        <div style={{ margin: '0 0 0.9rem', padding: '0.55rem 0.85rem', border: '1px solid var(--gray-200)', borderRadius: 9, background: 'var(--gray-50)', fontSize: 'var(--fs-m)', color: 'var(--gray-500)', fontWeight: 600 }}>
          Abierta: {fechaHora(fila.creado_en)}{fila.modificado_en ? ` · Última modificación: ${fechaHora(fila.modificado_en)}` : ''}{fila.resuelto_en ? ` · Resuelta: ${fechaHora(fila.resuelto_en)}` : ''}
        </div>
      )}
      <div className="modal-form-row">
        <label>{esTransportista ? 'Viaje *' : <>Envío relacionado <span style={{ color: 'var(--gray-500)', fontWeight: 600 }}>· opcional</span></>}</label>
        <BuscaEnvio envios={envios} valor={d.envio_id} onCambio={(v) => set('envio_id', v)} remoto />
      </div>
      {!d.envio_id && !esCliente && (
        <div className="modal-form-row">
          <label htmlFor="inc-cli">Cliente <span style={{ color: 'var(--gray-500)', fontWeight: 600 }}>· si no va sobre un envío</span></label>
          <select id="inc-cli" className="ptar-select" value={d.cliente_id ?? ''} onChange={(e) => set('cliente_id', e.target.value || null)}>
            <option value="">Selecciona el cliente…</option>
            {clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre_visible}</option>)}
          </select>
        </div>
      )}
      <div className="ptar-sitio-grid">
        <div style={{ gridColumn: '1/-1' }}>
          <label htmlFor="inc-tipo">Tipo de incidencia</label>
          <select id="inc-tipo" className="ptar-select" value={d.tipo_id} onChange={(e) => set('tipo_id', e.target.value)}>
            <option value="">Selecciona el tipo…</option>
            {tipos.filter((t) => t.activo || t.id === d.tipo_id).map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
          </select>
        </div>
        {esCliente ? (fila && (
          <div style={{ gridColumn: '1/-1', fontSize: 'var(--fs-m)', color: 'var(--gray-700)' }}>
            Estado: <strong>{ESTADOS.find(([k]) => k === fila.estado)?.[1] ?? fila.estado}</strong>
            {fila.resolucion && <> · Resolución: {fila.resolucion}</>}
          </div>
        )) : <>
        <div>
          <label htmlFor="inc-estado">Estado</label>
          <select id="inc-estado" className="ptar-select" value={d.estado} onChange={(e) => set('estado', e.target.value as IncidenciaDatos['estado'])}>
            {ESTADOS.map(([k, t]) => <option key={k} value={k}>{t}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="inc-pri">Prioridad</label>
          <select id="inc-pri" className="ptar-select" value={d.prioridad} onChange={(e) => set('prioridad', e.target.value as IncidenciaDatos['prioridad'])}>
            {PRIORIDADES.map(([k, t]) => <option key={k} value={k}>{t}</option>)}
          </select>
        </div>
        </>}
        <div style={{ gridColumn: '1/-1' }}>
          <label htmlFor="inc-tit">Resumen <span style={{ color: 'var(--gray-500)', fontWeight: 600 }}>· una línea; si lo dejas vacío, se toma del detalle</span></label>
          <input id="inc-tit" type="text" maxLength={140} value={d.titulo} onChange={(e) => set('titulo', e.target.value)} placeholder="Ej. Palet roto en la descarga" />
        </div>
      </div>
      <div className="modal-form-row" style={{ marginTop: '0.7rem' }}>
        <label htmlFor="inc-det">Detalle de la incidencia *</label>
        <textarea id="inc-det" value={d.detalle} onChange={(e) => set('detalle', e.target.value)} placeholder="Describe lo ocurrido: daños, retraso, mercancía incorrecta, falta de albarán firmado…" />
      </div>
      {!esCliente && (d.estado === 'resuelto' || d.resolucion) && (
        <div className="modal-form-row">
          <label htmlFor="inc-res">Cómo se ha resuelto</label>
          <textarea id="inc-res" value={d.resolucion} onChange={(e) => set('resolucion', e.target.value)} placeholder="Qué se hizo para cerrarla (abono, reenvío, albarán recibido…)" />
        </div>
      )}
      <div className="modal-form-row">
        <label>Adjuntar fotos / documentos</label>
        {fila ? <Documentos dueno={{ campo: 'incidencia_id', id: fila.id }} tipos={esCliente ? ['foto_incidencia', 'adjunto'] : ['foto_incidencia', 'albaran', 'adjunto', 'otro']} editable={!soloLectura} sinQuitar={esCliente} />
          : <p style={{ fontSize: 'var(--fs-s)', color: 'var(--gray-500)', margin: 0 }}>Guarda la incidencia y, al abrirla, podrás adjuntar fotos y documentos.</p>}
      </div>
      <p style={{ fontSize: 'var(--fs-s)', color: 'var(--gray-500)', margin: '0.2rem 0 0', lineHeight: 1.45 }}>{esTransportista
        ? <>La ve el equipo de Dynamo al momento. Si es urgente (daños, el muelle no carga), llama además al <a href="tel:+34955225945" style={{ color: 'var(--purple)', fontWeight: 700 }}>+34 955 225 945</a>. Si hay daños, haz fotos <strong>antes de descargar</strong>.</>
        : <>Una incidencia sobre un envío queda también en su <strong>historial</strong>.</>}</p>
      {error && <div className="wiz-warn show" role="alert">⚠ {error}</div>}
      {fila?.id && <Historial tabla="incidencias" id={fila.id} />}
      {trabajando && <Cargando texto={trabajando} />}
    </Modal>
  );
}
