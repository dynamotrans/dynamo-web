'use client';

// Incidencias (solo Dynamo): tabla y ficha con el diseño de #sec-incidencias de
// dashboard.html (pestañas Abiertas · Resueltas · Todas; columnas F. registro ·
// Descripción · Nº envío · Ref. cliente · F. carga · Ruta · m · Tn · Estado; ventana
// «Reportar incidencia» con el envío relacionado y su resumen).
import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useRefrescar } from '@/lib/useRefrescar';
import Historial from './Historial';
import Modal from './Modal';
import Cargando from '@/components/Cargando';
import EstadoVacio from './EstadoVacio';
import BuscaEnvio from './BuscaEnvio';
import BarraFiltros from './BarraFiltros';
import { opcionesFecha } from './FiltrosEnvios';
import Documentos, { subirDocumentoDirecto, tamano, ACEPTA, MAX_BYTES } from './Documentos';
import type { EnvioLigero } from '@/lib/enviosLigeros';
import { guardarIncidencia, type IncidenciaDatos } from '@/app/panel/(app)/incidencias/acciones';
import { fecha, ventana, fechaHora, medidasTxt } from '@/lib/formato';
import { rangoRapido } from '@/lib/envios';
import { descargarCsv } from '@/lib/exportaciones';
import { CONTACTO } from '@/lib/atencion';
// Etiquetas y faltas según el criterio único (usuario, 2026-11-09).
import Req from '@/components/Req';
import { avisaFaltas } from '@/lib/faltas';

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
const IcoAviso = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>;
const horaMadrid = (iso: string) => new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
const diaMadrid = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date(iso));

export default function Incidencias({ filas, tipos, clientes, envios, nuevaPara, error, esCliente = false, esTransportista = false, tipoInicial = null, vistaTransportista = false }: {
  filas: IncidenciaFila[]; tipos: Opcion[]; clientes: Opcion[]; envios: EnvioLigero[]; nuevaPara: string | null; error: string | null;
  tipoInicial?: string | null;   // ?tipo=siniestro: el formulario nuevo ya con ese tipo
  esCliente?: boolean;   // el CLIENTE (o el transportista) ve y abre las suyas; el estado, la prioridad y la resolución son de Dynamo
  vistaTransportista?: boolean;   // Dynamo «viendo como» un transportista: la incidencia sin envío es de ese transportista (sin selector de cliente)
  esTransportista?: boolean;   // el envío es obligatorio y solo ve las que abre él
}) {
  const router = useRouter();
  const refrescar = useRefrescar();
  const [pestana, setPestana] = useState<'abiertas' | 'resueltas' | 'todas'>('abiertas');
  const [q, setQ] = useState('');
  const [fr, setFr] = useState('');
  const [ficha, setFicha] = useState<{ fila: IncidenciaFila | null; envio?: string | null } | null>(nuevaPara != null ? { fila: null, envio: nuevaPara || null } : null);
  const hoy = useMemo(() => diaMadrid(new Date().toISOString()), []);

  const cuenta = useMemo(() => ({ abiertas: filas.filter((x) => abierta(x.estado)).length, resueltas: filas.filter((x) => !abierta(x.estado)).length, todas: filas.length }), [filas]);
  const lista = useMemo(() => {
    const w = norm(q.trim()).split(/\s+/).filter(Boolean);
    const r = fr ? rangoRapido(fr, hoy) : null;
    return filas.filter((x) => (pestana === 'todas' || (pestana === 'abiertas') === abierta(x.estado))
      && (!r || (() => { const d = diaMadrid(x.creado_en); return d >= r.desde && d <= r.hasta; })())
      && (!w.length || (() => { const b = norm([x.codigo, x.tipo, x.titulo, x.detalle, x.cliente, x.envio?.referencia_gx, x.envio?.referencia_cliente,
        x.envio?.origen, x.envio?.destino, ESTADOS.find(([k]) => k === x.estado)?.[1], fecha(diaMadrid(x.creado_en))].filter(Boolean).join(' ')); return w.every((t) => b.includes(t)); })()));
  }, [filas, pestana, q, fr, hoy]);
  // El CSV con lo que se ve (filtros puestos), columnas calcadas de la tabla.
  const exportar = () => descargarCsv('Incidencias', ['F. registro', 'Hora', 'Código', 'Tipo', 'Resumen', 'Detalle', 'Nº envío', 'Ref. cliente', ...(esCliente ? [] : ['Cliente']), 'F. carga', 'Origen', 'Destino', 'm · Tn', 'Estado', 'Prioridad'],
    lista.map((x) => ({ 'F. registro': fecha(diaMadrid(x.creado_en)), Hora: horaMadrid(x.creado_en), 'Código': x.codigo, Tipo: x.tipo, Resumen: x.titulo, Detalle: x.detalle,
      'Nº envío': x.envio ? `#${x.envio.referencia_gx}` : '', 'Ref. cliente': x.envio?.referencia_cliente ?? '', ...(esCliente ? {} : { Cliente: x.cliente ?? '' }),
      'F. carga': x.envio ? fecha(x.envio.fecha_carga_desde) : '', Origen: x.envio?.origen ?? '', Destino: x.envio?.destino ?? '',
      'm · Tn': x.envio && (x.envio.metros_lineales != null || x.envio.toneladas != null) ? medidasTxt(x.envio.metros_lineales, x.envio.toneladas) : '',
      Estado: ESTADOS.find(([k]) => k === x.estado)?.[1] ?? x.estado, Prioridad: PRIORIDADES.find(([k]) => k === x.prioridad)?.[1] ?? '' })));
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
      <BarraFiltros q={q} onQ={setQ} activos={[q.trim(), fr].filter(Boolean).length} onExportar={exportar}
        placeholder={esCliente ? 'Buscar por descripción, nº de envío, ruta…' : 'Buscar por descripción, nº de envío, cliente, ruta…'}>
        <select className="filter-estado" value={fr} aria-label="Filtrar por fecha de registro" onChange={(e) => setFr(e.target.value)}>
          <option value="">Fecha</option>
          {opcionesFecha(hoy).map((o) => <option key={o.v} value={o.v}>{o.t}</option>)}
        </select>
      </BarraFiltros>
      {error && <div className="pt-aviso error">No se han podido cargar las incidencias: {error}</div>}
      <div className="table-wrap">
        <table className="data">
          <thead><tr>
            <th>F. registro</th><th>Descripción</th><th>Nº envío</th><th>Ref. cliente</th><th>F. carga · Días de recogida</th><th>Ruta</th><th>m · Tn</th><th>Estado</th>
          </tr></thead>
          <tbody>
            {lista.length === 0 ? (
              <tr><td colSpan={8} style={{ textAlign: 'center', padding: '2rem', color: 'var(--gray-500)' }}>
                {filas.length ? 'Sin incidencias en este filtro'
                  : <EstadoVacio titulo="Sin incidencias — buena señal"
                      texto="Si algo va mal en un envío (retraso, daño, falta de documentación…), repórtalo aquí o desde la ficha del propio envío y se sigue hasta resolverlo."
                      accion={<button type="button" className="btn-primary" onClick={() => setFicha({ fila: null })}>+ Reportar incidencia</button>} />}
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
      {ficha && <FichaIncidencia esCliente={esCliente} esTransportista={esTransportista} vistaTransportista={vistaTransportista} fila={ficha.fila} envioInicial={ficha.envio ?? null} tipoInicial={ficha.fila ? null : tipoInicial} tipos={tipos} clientes={clientes} envios={envios}
        onCerrar={cerrar} onHecho={() => { cerrar(); refrescar(); }} />}
    </section>
  );
}

function FichaIncidencia({ fila, envioInicial, tipos, clientes, envios, onCerrar, onHecho, esCliente, esTransportista = false, vistaTransportista = false, tipoInicial = null }: {
  fila: IncidenciaFila | null; envioInicial: string | null; tipos: Opcion[]; clientes: Opcion[]; envios: EnvioLigero[]; tipoInicial?: string | null;
  onCerrar: () => void; onHecho: () => void; esCliente: boolean; esTransportista?: boolean; vistaTransportista?: boolean;
}) {
  // El cliente solo puede tocarla mientras está abierta (después la lleva Dynamo).
  const soloLectura = esCliente && !!fila && fila.estado !== 'abierto';
  const [d, setD] = useState<IncidenciaDatos>({
    envio_id: fila?.envio_id ?? envioInicial, cliente_id: fila?.cliente_id ?? (clientes.length === 1 ? clientes[0].id : null), tipo_id: fila?.tipo_id ?? tipoInicial ?? '',
    estado: fila?.estado ?? 'abierto', prioridad: fila?.prioridad ?? 'media',
    titulo: fila?.titulo ?? '', detalle: fila?.detalle ?? '', resolucion: fila?.resolucion ?? '',
  });
  const [error, setError] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState<string | null>(null);
  const [preguntaCancelar, setPreguntaCancelar] = useState(false);
  // Adjuntos elegidos ANTES de crear la incidencia (usuario, 2026-11-10): foto con la
  // cámara o galería/archivos; se suben nada más crearla. Si una subida falla, la
  // incidencia ya existe: idCreada hace que el reintento actualice en vez de duplicar.
  const [pendientes, setPendientes] = useState<File[]>([]);
  const [idCreada, setIdCreada] = useState<string | null>(null);
  const inFoto = useRef<HTMLInputElement>(null);
  const inGal = useRef<HTMLInputElement>(null);
  const anadirPendientes = (lista: FileList) => {
    setError(null);
    const nuevos: File[] = [];
    for (const f of Array.from(lista)) {
      if (f.size > MAX_BYTES) { setError(`«${f.name}» pasa de 25 MB.`); continue; }
      if (!ACEPTA.split(',').includes(f.type)) { setError(`«${f.name}»: solo PDF o imágenes (JPG, PNG, WEBP, HEIC).`); continue; }
      nuevos.push(f);
    }
    if (nuevos.length) setPendientes((l) => [...l, ...nuevos]);
  };
  const set = <K extends keyof IncidenciaDatos>(k: K, v: IncidenciaDatos[K]) => setD((x) => ({ ...x, [k]: v }));

  async function guardar(cambios: Partial<IncidenciaDatos> = {}, texto?: string) {
    const datos = { ...d, ...cambios };
    setError(null);
    if (!datos.tipo_id) { setError('Elige el tipo de incidencia.'); avisaFaltas(['inc-tipo']); return; }
    if (!datos.detalle.trim()) { setError('Cuenta lo ocurrido en el detalle de la incidencia.'); avisaFaltas(['inc-det']); return; }
    if (!esCliente && !vistaTransportista && !datos.envio_id && !datos.cliente_id) { setError('Elige el envío o, si no va sobre un envío, el cliente.'); avisaFaltas(['inc-envio', 'inc-cli']); return; }
    if (esTransportista && !datos.envio_id) { setError('Elige el envío de la incidencia.'); avisaFaltas(['inc-envio']); return; }
    setTrabajando(texto ?? (fila ? 'Guardando incidencia' : 'Creando incidencia'));
    const r = await guardarIncidencia(fila?.id ?? idCreada, datos);
    if (!r.ok) { setTrabajando(null); setError(r.error); return; }
    // Los adjuntos elegidos antes de guardar se suben ahora, contra la incidencia recién
    // creada. Los que fallen se quedan en la lista para reintentar (la incidencia ya existe).
    if (!fila && pendientes.length) {
      setIdCreada(r.id);
      const fallos: File[] = [];
      let ultimoError = '';
      for (const f of pendientes) {
        setTrabajando(`Subiendo «${f.name}»`);
        const g = await subirDocumentoDirecto({ campo: 'incidencia_id', id: r.id }, f, f.type.startsWith('image/') ? 'foto_incidencia' : 'adjunto');
        if (!g.ok) { fallos.push(f); ultimoError = g.error; }
      }
      setPendientes(fallos);
      if (fallos.length) {
        setTrabajando(null);
        setError(`La incidencia se ha creado, pero no se ha podido subir ${fallos.map((f) => `«${f.name}»`).join(', ')} (${ultimoError}). Vuelve a pulsar el botón para reintentarlo, o quítalos de la lista.`);
        return;
      }
    }
    setTrabajando(null);
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
        <label>{esTransportista ? <>Envío <Req /></> : <>Envío relacionado <Req si={false} /></>}</label>
        <div id="inc-envio"><BuscaEnvio envios={envios} valor={d.envio_id} onCambio={(v) => set('envio_id', v)} remoto /></div>
      </div>
      {/* Con «Ver como» un cliente llega UN solo cliente posible, ya puesto: el campo no sale. */}
      {!d.envio_id && !esCliente && !vistaTransportista && clientes.length !== 1 && (
        <div className="modal-form-row">
          <label htmlFor="inc-cli">Cliente <Req /> <span style={{ color: 'var(--gray-500)', fontWeight: 600 }}>· si no va sobre un envío</span></label>
          <select id="inc-cli" className="ptar-select" value={d.cliente_id ?? ''} onChange={(e) => set('cliente_id', e.target.value || null)}>
            <option value="">Selecciona el cliente…</option>
            {clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre_visible}</option>)}
          </select>
        </div>
      )}
      <div className="ptar-sitio-grid">
        <div style={{ gridColumn: '1/-1' }}>
          <label htmlFor="inc-tipo">Tipo de incidencia <Req /></label>
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
          {/* Solo Abierta y Resuelta (usuario, 2026-11-10). «Cancelada» va por su botón, y
              una antigua «En curso» conserva su opción para no cambiarla sin querer. */}
          <select id="inc-estado" className="ptar-select" value={d.estado} onChange={(e) => set('estado', e.target.value as IncidenciaDatos['estado'])}>
            {ESTADOS.filter(([k]) => k === 'abierto' || k === 'resuelto' || k === d.estado).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="inc-pri">Prioridad</label>
          <select id="inc-pri" className="ptar-select" value={d.prioridad} onChange={(e) => set('prioridad', e.target.value as IncidenciaDatos['prioridad'])}>
            {PRIORIDADES.map(([k, t]) => <option key={k} value={k}>{t}</option>)}
          </select>
        </div>
        </>}
      </div>
      <div className="modal-form-row" style={{ marginTop: '0.7rem' }}>
        <label htmlFor="inc-det">Detalle de la incidencia <Req /></label>
        <textarea id="inc-det" value={d.detalle} onChange={(e) => set('detalle', e.target.value)} placeholder="Describe lo ocurrido: daños, retraso, mercancía incorrecta, falta de albarán firmado…" />
      </div>
      {!esCliente && (d.estado === 'resuelto' || d.resolucion) && (
        <div className="modal-form-row">
          <label htmlFor="inc-res">Cómo se ha resuelto <Req si={false} /></label>
          <textarea id="inc-res" value={d.resolucion} onChange={(e) => set('resolucion', e.target.value)} placeholder="Qué se hizo para cerrarla (abono, reenvío, albarán recibido…)" />
        </div>
      )}
      <div className="modal-form-row">
        <label>Adjuntar fotos / documentos</label>
        {fila ? <Documentos dueno={{ campo: 'incidencia_id', id: fila.id }} tipos={esCliente ? ['foto_incidencia', 'adjunto'] : ['foto_incidencia', 'albaran', 'adjunto', 'otro']} editable={!soloLectura} sinQuitar={esCliente} />
          : <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
              <div className="modal-file-drop" role="button" tabIndex={0} onClick={() => inFoto.current?.click()}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inFoto.current?.click(); } }}>
                <div>
                  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ verticalAlign: -2 }}><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></svg>{' '}
                  Hacer foto
                </div>
              </div>
              <div className="modal-file-drop" role="button" tabIndex={0} onClick={() => inGal.current?.click()}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inGal.current?.click(); } }}>
                <div>
                  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ verticalAlign: -2 }}><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>{' '}
                  Galería o archivo
                </div>
              </div>
            </div>
            <input ref={inFoto} type="file" accept="image/*" capture="environment" style={{ display: 'none' }}
              onChange={(e) => { if (e.target.files?.length) anadirPendientes(e.target.files); e.target.value = ''; }} />
            <input ref={inGal} type="file" multiple accept={ACEPTA} style={{ display: 'none' }}
              onChange={(e) => { if (e.target.files?.length) anadirPendientes(e.target.files); e.target.value = ''; }} />
            {pendientes.length > 0 && (
              <ul className="modal-file-list">
                {pendientes.map((f, i) => (
                  <li key={`${f.name}-${i}`} className="modal-file-item">
                    <span className="mfi-ico"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg></span>
                    <span className="mfi-name">{f.name}</span>
                    <span style={{ fontSize: 'var(--fs-s)', color: 'var(--gray-500)' }}>{tamano(f.size)}</span>
                    <button type="button" className="mfi-del" aria-label={`Quitar ${f.name}`} onClick={() => setPendientes((l) => l.filter((_, j) => j !== i))}>×</button>
                  </li>
                ))}
              </ul>
            )}
            <p style={{ fontSize: 'var(--fs-s)', color: 'var(--gray-500)', margin: '0.35rem 0 0' }}>PDF, JPG, PNG, WEBP o HEIC · máx. 25 MB cada uno · se adjuntan al crear la incidencia.</p>
          </>}
      </div>
      <p style={{ fontSize: 'var(--fs-s)', color: 'var(--gray-500)', margin: '0.2rem 0 0', lineHeight: 1.45 }}>{esTransportista
        ? <>La ve el equipo de Dynamo al momento. Si es urgente (daños, el muelle no carga), llama además al <a href={CONTACTO.telHref} style={{ color: 'var(--purple)', fontWeight: 700 }}>{CONTACTO.telefono}</a>. Si hay daños, haz fotos <strong>antes de descargar</strong>.</>
        : <>Una incidencia sobre un envío queda también en su <strong>historial</strong>.</>}</p>
      {error && <div className="wiz-warn show" role="alert">⚠ {error}</div>}
      {fila?.id && <Historial tabla="incidencias" id={fila.id} />}
      {trabajando && <Cargando texto={trabajando} />}
    </Modal>
  );
}
