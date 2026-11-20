'use client';

// Ficha del envío para el CLIENTE (etapa B): el "Ver detalle" de dashboard.html con lo que
// le toca ver (mis_envios(): sin precio del transportista, ni margen, ni factor; regla 11
// aplicada). Si es una solicitud, aquí acepta o rechaza el precio. Puede cancelar mientras
// el camión no va hacia la carga, reportar una incidencia y repetir el envío.
import ContadorCambio from '@/components/panel/ContadorCambio';
import CuentaAtras from './CuentaAtras';
import { SIN_CONEXION } from '@/lib/mensajeError';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { avisarNavegando } from './CargandoNavegacion';
import { useRefrescar } from '@/lib/useRefrescar';
import DatosCmr from './DatosCmr';
import Modal from './Modal';
import Documentos from './Documentos';
import Cargando from '@/components/Cargando';
import CondicionesGenerales from '@/components/CondicionesGenerales';
import { euros, fecha, ventana, pesoTn, fechaHora, metros, porcentaje, tipoCargaTxt, alturaMaxTxt } from '@/lib/formato';
import { estadoVisual, fechaEntrega, type CambioPendiente, type EnvioFila, type Parada } from '@/lib/envios';
import type { Funcion } from '@/lib/supabase/tipos';
import { paisDe, telBonito } from '@/lib/paises';
import { avisarPagoTransferencia, cancelarMiEnvio, marcarMiEnvioManual, valorarMiEnvio, guardarPrecioEnvioManual, enviarOrdenEnvioManual } from '@/app/panel/(app)/envios/acciones-cliente';
import { PedirCambio, LlamarCambio, LlamarCancelar, modoModificar } from './CambiosEnvio';
import { Reservado, Secc } from './ficha/comun';
import EtiquetaParada from './EtiquetaParada';
import AvisoSiniestro from '@/components/AvisoSiniestro';
import { RevisionCliente, SelloPrecio, type Revision } from './RevisionPrecio';
import Historial from './Historial';
import { enlaceCmrPropio } from '@/app/panel/(app)/envios/acciones-transportista';
import { CONTACTO } from '@/lib/atencion';
import Tip from '@/components/Tip';
import { SIGLAS } from '@/lib/siglas';
import { ESTADOS_ENVIO, FASES_ENVIO, type Etapa } from '@/lib/estados';
import Etapas from './ficha/Etapas';
import Req from '@/components/Req';
import { avisaFaltas } from '@/lib/faltas';

// Etiquetas y faltas según el criterio único (usuario, 2026-11-09).

const HITOS: Record<string, string> = {
  creado: 'Solicitud creada', confirmado: 'Envío confirmado', transportista_asignado: 'Transportista asignado',
  matricula_asignada: 'Camión asignado', hacia_la_carga: 'El camión va hacia la carga', cargando: 'Cargando', descargando: 'Descargando', cargado: 'Cargado · en ruta', descargado: 'Descargado · sigue a la siguiente parada', entregado: 'Entregado', cancelado: 'Cancelado',
  cancelacion_deshecha: 'Cancelación deshecha', ruta_cambiada: 'Ruta cambiada', cmr_firmado: 'CMR firmado',
  fecha_carga_movida: 'Fecha de carga movida (el pago llegó tarde)',
  fecha_carga_cambiada: 'Fecha de carga cambiada',
  mercancia_cambiada: 'Mercancía cambiada',
};
const I = ({ d }: { d: string[] }) => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: '0.35rem' }}>
    {d.map((x, i) => <path key={i} d={x} />)}
  </svg>
);
const ICO = {
  ojo: ['M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z', 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z'],
  aviso: ['M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z', 'M12 9v4', 'M12 17h.01'],
  x: ['M18 6 6 18', 'M6 6l12 12'],
  repetir: ['M17 1l4 4-4 4', 'M3 11V9a4 4 0 0 1 4-4h14', 'M7 23l-4-4 4-4', 'M21 13v2a4 4 0 0 1-4 4H3'],
  check: ['M20 6 9 17l-5-5'],
  firma: ['M12 20h9', 'M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z'],
  doc: ['M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z', 'M14 2v6h6', 'M16 13H8', 'M16 17H8'],
  editar: ['M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7', 'M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z'],
};
// El mismo subtítulo de sección que la ficha de Dynamo (mismo formato en las dos fichas).
function SubTit({ children, primero }: { children: React.ReactNode; primero?: boolean }) {
  return <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--navy)', margin: primero ? '0 0 0.4rem' : '1rem 0 0.4rem' }}>{children}</div>;
}
// El envío del cliente: la fila de la lista (o de mis_envios()) con lo que se le junta en la página.
type MiEnvio = Funcion<'mis_envios'>[number];
export type EnvioClienteBase = Omit<EnvioFila, 'paradas'> & Partial<Omit<MiEnvio, keyof EnvioFila>>
  & { paradas: (Parada & { id?: string; referencia?: string | null; anotaciones?: string | null; notas_sitio?: string | null })[];
      operador_email?: string | null };   // envío propio: el email de SU transportista, para enviarle la orden de carga
export type EnvioCliente = EnvioClienteBase & {
  hitos: Funcion<'mis_hitos'>; valoracion: Funcion<'mi_valoracion_envio'>[number] | null;
  pago: Funcion<'pagos_envio'>[number] | null;
  cambio: Funcion<'mi_cambio_envio'>[number] | null; revision: Revision | null; corte: string | null;
  tarjeta: boolean; pagoVuelta: string | null;
  asignandose?: boolean;   // un transportista se está asignando ahora mismo (reserva en curso o contraoferta pendiente)
};
const Pend = () => <span style={{ color: 'var(--gray-500)', fontStyle: 'italic', fontWeight: 500 }}>Pendiente</span>;

export default function FichaEnvioCliente({ e, etapas = [], cerrarHref, pendiente = null }: { e: EnvioCliente; etapas?: Etapa[]; cerrarHref: string; pendiente?: CambioPendiente | null }) {
  const router = useRouter();
  const refrescar = useRefrescar();
  const [vista, setVista] = useState<'ficha' | 'cancelar' | 'condiciones' | 'llamar' | 'llamarCancelar' | 'enviarOrden'>('ficha');
  const [aviso, setAviso] = useState<{ ok: boolean; txt: string } | null>(null);
  const [trabajando, setTrabajando] = useState<string | null>(null);
  const [motivo, setMotivo] = useState('');
  // Precio acordado con SU transportista (envío propio), editable en la ficha.
  const precioMIni = e.precio_acordado_operador != null ? String(e.precio_acordado_operador).replace('.', ',') : '';
  const [precioM, setPrecioM] = useState(precioMIni);
  // Enviar la orden de carga a SU transportista: el email de su ficha, que puede cambiar aquí.
  const [ordenPara, setOrdenPara] = useState(e.operador_email ?? '');
  const [ordenGuardar, setOrdenGuardar] = useState(false);   // cambiar también el email de su ficha
  // CERRAR AL INSTANTE (usuario, 2026-11-10: «cerrar es muy lento»): la ventana se oculta
  // ya y el cargador fino cubre la vuelta a la lista mientras llega la página.
  const [cerrando, setCerrando] = useState(false);
  const cerrar = () => { setCerrando(true); avisarNavegando(); router.push(cerrarHref, { scroll: false }); };
  const act = etapas.find((x) => x.actual);
  const ev = estadoVisual({ ...e, parada_actual: e.parada_actual ?? act?.parada ?? null, tipo_parada: e.tipo_parada ?? act?.tipo_parada ?? null });
  const manual = !!e.es_manual;
  const paradas = e.paradas ?? [];
  const recogidas = paradas.filter((p) => p.tipo === 'carga'), entregas = paradas.filter((p) => p.tipo === 'descarga');
  const pc = e.importe_cliente != null ? Number(e.importe_cliente) : null;
  const iva = Number(e.iva_pct ?? 21);
  // CANCELAR (usuario, 2026-11-16): sin transportista cancela él desde aquí, gratis. Con
  // transportista asignado, o con el camión ya hacia la carga, el botón abre la ventana de
  // «llámanos» con el coste que toca (sin coste dentro del plazo; posible coste completo
  // después). Los envíos con transportista propio los lleva el cliente: cancela él.
  const conTransportista = !e.es_manual && e.estado === 'programado' && !!e.cambio?.con_camion && !e.asignandose;
  const cancelarLlamando = !e.es_manual && (conTransportista || ['hacia_la_carga', 'cargando'].includes(e.estado));
  const cancelable = ['borrador', 'programado'].includes(e.estado) || cancelarLlamando;
  // «Modificar envío» (usuario, 2026-11-16): sin transportista abre el asistente de «Nuevo
  // envío» ya relleno (es como un envío nuevo: se recalcula todo); con transportista, o
  // con el envío en marcha, la ventana de contacto.
  // UN TRANSPORTISTA SE ESTÁ ASIGNANDO (usuario, 2026-11-16): mientras dura, los dos
  // botones quedan apagados y la ficha lo avisa; si no, el cliente vería «sin transportista»
  // y cancelaría gratis justo cuando ya hay uno comprometiéndose.
  const asignandose = !!e.asignandose && e.estado === 'programado';
  // CAMIÓN RESERVADO (usuario, 2026-11-19): con transportista asignado el transporte está
  // confirmado aunque aún falten la matrícula o el conductor; en vez de «Pendiente», se dice
  // «Camión reservado, … pendiente de anotar» para que el cliente esté tranquilo.
  const reservado = !!(e.transportista_asignado || e.matricula_camion || e.conductor_nombre);
  const modo = asignandose ? 'asignando' as const : modoModificar(e, e.cambio);
  // SIEMPRE todo plegado al abrir (usuario, 2026-11-10), como la ficha de Dynamo.
  const [abiertas, setAbiertas] = useState<Set<string>>(() => new Set());
  const toggle = (k: string) => setAbiertas((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  async function hacer(texto: string, fn: () => Promise<{ ok: boolean; error?: string; aviso?: string }>) {
    setTrabajando(texto); setAviso(null);
    // Si la acción revienta (sin conexión, o justo tras publicar una versión nueva), no se
    // queda el «trabajando…» para siempre: se avisa y se puede reintentar.
    const r: Awaited<ReturnType<typeof fn>> = await fn().catch(() => ({ ok: false, error: SIN_CONEXION }));
    setTrabajando(null);
    setAviso({ ok: r.ok, txt: (r.ok ? r.aviso : r.error) ?? (r.ok ? 'Hecho.' : 'No se ha podido hacer.') });
    if (r.ok) { setVista('ficha'); refrescar(); }
    return r.ok;
  }

  // Los mismos derivados de cabecera que la ficha de Dynamo (mismo formato en las dos).
  const rutaCorta = [recogidas[0]?.poblacion, entregas[entregas.length - 1]?.poblacion].filter(Boolean).join(' → ');
  const conSeguimiento = !manual && e.estado !== 'cancelado' && etapas.length > 0;
  const fechaVital = e.fecha_carga_real ? fecha(e.fecha_carga_real)
    : e.fecha_carga_prevista ? fecha(e.fecha_carga_prevista)
    : e.fecha_carga_desde ? ventana(e.fecha_carga_desde, e.fecha_carga_hasta) : '';
  const mercResumen = [e.metros_lineales != null && metros(e.metros_lineales), e.toneladas != null && pesoTn(e.toneladas),
    e.descripcion_mercancia || (e.paletizado === false ? 'No paletizada' : 'Paletizada')].filter(Boolean).join(' · ');
  const precioTxt = manual ? (e.precio_acordado_operador != null ? euros(e.precio_acordado_operador) : null)
    : pc != null ? euros(pc) : null;
  // La tarjeta de una parada (la del cliente: sin ficha de sitio, con su referencia).
  const puntoCli = (p: (typeof paradas)[number], cls: 'rec' | 'ent', num: number) => (
    <div key={p.id ?? num} className="det-punto">
      <div className="det-punto-head"><EtiquetaParada num={num} tipo={cls === 'rec' ? 'carga' : 'descarga'} tipoSitio={p.tipo_sitio} /></div>
      <div className="det-punto-body">
        {p.nombre_empresa && <><strong>{p.nombre_empresa}</strong><br /></>}
        {[p.direccion, [p.codigo_postal, p.poblacion].filter(Boolean).join(' '), p.provincia && p.provincia !== p.poblacion ? p.provincia : '', paisDe(p.pais_codigo_iso ?? 'ES')].filter(Boolean).join(', ')}
        {p.referencia && <div style={{ fontSize: 'var(--fs-m)', marginTop: 2 }}>Referencia: <strong>{p.referencia}</strong></div>}
        {/* Las notas fijas de la ficha del sitio y las anotaciones de la parada, en caja
            ámbar como en la ficha de admin (usuario, 2026-11-12). */}
        {[p.notas_sitio, p.anotaciones].filter(Boolean).map((n, i) => (
          <div key={i} style={{ fontSize: 'var(--fs-m)', color: '#b45309', background: '#fef3c7', borderRadius: 8, padding: '0.35rem 0.5rem', marginTop: 4 }}>⚠ {n}</div>
        ))}
      </div>
    </div>
  );

  if (cerrando) return null;
  if (vista === 'condiciones') {
    return (
      <Modal abierto ancho={760} onCerrar={() => setVista('ficha')} titulo="Condiciones generales de transporte"
        pie={<button className="btn-primary" onClick={() => setVista('ficha')}>Volver al envío</button>}>
        <CondicionesGenerales />
      </Modal>
    );
  }
  if (vista === 'llamar') return <LlamarCambio e={e} onVolver={() => setVista('ficha')} precioAMano={!!e.cambio?.precio_a_mano && !e.cambio?.con_camion} />;
  if (vista === 'llamarCancelar') return <LlamarCancelar e={e} onVolver={() => setVista('ficha')} />;
  if (vista === 'enviarOrden') {
    const emailOk = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]{2,}$/.test(ordenPara.trim());
    return (
      <Modal abierto ancho={520} onCerrar={() => setVista('ficha')} titulo={`Orden de carga #${e.referencia_gx}`} icono={<I d={ICO.doc} />}
        pie={<>
          <button className="btn-ghost" onClick={() => setVista('ficha')} disabled={!!trabajando}>Volver</button>
          <button className="btn-primary" disabled={!!trabajando || !emailOk} onClick={() => hacer('Enviando', () => enviarOrdenEnvioManual(e.id, ordenPara, !e.operador_email || ordenGuardar))}>Enviar por email</button>
        </>}>
        {trabajando && <Cargando texto={trabajando} />}
        {/* UNA sola ventana para la orden (usuario, 2026-11-17): verla en PDF o enviarla por email. */}
        <a className="btn-secondary" href={`/panel/envios/${e.id}/orden-de-carga`} target="_blank" rel="noopener"
          style={{ display: 'flex', justifyContent: 'center', marginBottom: '0.9rem' }}><I d={ICO.doc} />Abrir el PDF de la orden de carga</a>
        <div style={{ fontWeight: 800, color: 'var(--navy)', marginBottom: '0.3rem' }}>Enviarla por email al transportista</div>
        <p style={{ margin: '0 0 0.8rem', color: 'var(--gray-700)', fontSize: 'var(--fs-m)' }}>
          Le llega a <strong className="notranslate" translate="no">{e.operador || 'tu transportista'}</strong> un email con la <strong>orden de carga en PDF adjunta</strong> y
          todo el detalle también escrito en el mensaje: sitios, fechas, mercancía, matrículas y el precio acordado.
        </p>
        <label htmlFor="eo-para" style={{ display: 'block', marginBottom: '0.3rem' }}>Email del transportista <Req /></label>
        <input id="eo-para" type="email" inputMode="email" autoComplete="off" maxLength={200} style={{ display: 'block', width: '100%' }}
          value={ordenPara} onChange={(ev) => setOrdenPara(ev.target.value)} placeholder="transportista@empresa.com" />
        {!e.operador_email
          ? <div style={{ marginTop: '0.3rem', color: 'var(--gray-500)', fontSize: 'var(--fs-s)' }}>Tu transportista no tiene email en su ficha: escríbelo aquí y <strong>se guarda en su ficha</strong>, para que la próxima vez salga ya puesto.</div>
          : ordenPara.trim().toLowerCase() !== e.operador_email.trim().toLowerCase() && emailOk
            && <label style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', marginTop: '0.45rem', fontSize: 'var(--fs-s)', color: 'var(--gray-700)', cursor: 'pointer' }}>
              <input type="checkbox" checked={ordenGuardar} onChange={(ev) => setOrdenGuardar(ev.target.checked)} />
              Guardar este email en la ficha del transportista (ahora tiene {e.operador_email})
            </label>}
        <div style={{ marginTop: '0.8rem', color: 'var(--gray-500)', fontSize: 'var(--fs-s)' }}>
          Asunto: <strong>Pedido de transporte {e.referencia_gx}</strong> y el nombre de tu empresa. Tú recibes copia y, si el transportista contesta, la respuesta te llega a ti.
          {e.precio_acordado_operador == null && <> <strong>Aún no has anotado el precio acordado</strong>: si quieres que salga, guárdalo antes en la ficha.</>}
        </div>
        {aviso && !aviso.ok && <div className="pt-aviso error" style={{ marginTop: '0.8rem' }}><div>{aviso.txt}</div></div>}
      </Modal>
    );
  }
  if (vista === 'cancelar') {
    return (
      <Modal abierto onCerrar={() => setVista('ficha')} titulo={`Cancelar envío #${e.referencia_gx}`} icono={<I d={ICO.aviso} />}
        pie={<>
          <button className="btn-ghost" onClick={() => setVista('ficha')} disabled={!!trabajando}>No, volver</button>
          <button className="btn-primary" style={{ background: 'var(--red)' }} disabled={!!trabajando} onClick={() => hacer('Cancelando', () => cancelarMiEnvio(e.id, motivo))}>Sí, cancelar</button>
        </>}>
        {trabajando && <Cargando texto={trabajando} />}
        {/* Sin coste es una buena noticia: caja verde clara con texto verde oscuro (usuario,
            2026-11-19: en naranja «asusta»). Con su transportista propio sigue en naranja. */}
        <div className={manual ? 'modal-warn-box' : 'modal-ok-box'}>
          {/* Con SU transportista (envío manual) no pinta nada lo del «transportista asignado»
              ni el coste: eso es entre él y su transportista (usuario, 2026-11-16). */}
          {manual
            ? <>Vas a cancelar tu transporte con <strong>tu transportista directo</strong>. Recuerda avisarle tú: Dynamo no interviene en este envío.</>
            : e.estado === 'borrador'
            ? <>Es una solicitud sin confirmar: se cancela <strong>sin ningún coste</strong>.</>
            : <>Tu envío <strong>aún no tiene transportista asignado</strong>: cancelarlo ahora <strong>no tiene ningún coste</strong>.</>}
        </div>
        <label htmlFor="cc-motivo" style={{ display: 'block', marginTop: '0.8rem' }}>Motivo <Req si={false} /></label>
        <textarea id="cc-motivo" rows={3} maxLength={500} style={{ display: 'block', width: '100%', minHeight: 84, marginTop: 4 }} value={motivo} onChange={(ev) => setMotivo(ev.target.value)} placeholder={manual ? "Para tu propio control (opcional)" : "Cuéntanos por qué (nos ayuda a mejorar)"} />
        {aviso && !aviso.ok && <div className="pt-aviso error" style={{ marginTop: '0.8rem' }}><div>{aviso.txt}</div></div>}
      </Modal>
    );
  }

  async function abrirCmr() {
    const w = window.open('about:blank', '_blank');
    setTrabajando('Abriendo el CMR');
    const r = await enlaceCmrPropio(e.id);
    setTrabajando(null);
    if (!r.ok) { w?.close(); setAviso({ ok: false, txt: r.error }); return; }
    if (w) w.location.href = `/cmr/${r.token}`; else window.location.href = `/cmr/${r.token}`;
  }

  const FASES_M: [string, string][] = FASES_ENVIO.map((k) => [k, ESTADOS_ENVIO[k].label]);
  const acciones = (
    <>
      {/* UN botón (usuario, 2026-11-17): abre la ventana con el PDF y el envío por email. */}
      {manual && e.estado !== 'cancelado' && <button className="btn-secondary" onClick={() => { setAviso(null); setVista('enviarOrden'); }} disabled={!!trabajando}><I d={ICO.doc} />Orden de carga (PDF)</button>}
      {!manual && ['programado', 'hacia_la_carga', 'cargando', 'en_ruta', 'entregado'].includes(e.estado) && <button className="btn-secondary" onClick={abrirCmr} disabled={!!trabajando}><I d={ICO.firma} />CMR digital</button>}
      {modo === 'form' && <a className="btn-secondary" href={`/panel/nuevo-envio?editar=${e.id}`}><I d={ICO.editar} />Modificar envío</a>}
      {/* Con SU transportista lo modifica libremente: es suyo (usuario, 2026-11-16). */}
      {manual && e.estado !== 'cancelado' && <a className="btn-secondary" href={`/panel/nuevo-envio?editar=${e.id}`}><I d={ICO.editar} />Modificar envío</a>}
      {modo === 'llamar' && <button className="btn-secondary" onClick={() => setVista('llamar')} disabled={!!trabajando}><I d={ICO.editar} />Modificar envío</button>}
      {modo === 'pendiente' && <button className="btn-secondary" disabled title="Ya has pedido un cambio: espera a que te contestemos"><I d={ICO.editar} />Modificar envío</button>}
      {modo === 'asignando' && <button className="btn-secondary" disabled title="Un transportista se está asignando en este momento"><I d={ICO.editar} />Modificar envío</button>}
      {cancelable && <button className="btn-secondary" onClick={() => setVista(cancelarLlamando ? 'llamarCancelar' : 'cancelar')} disabled={asignandose}
        title={asignandose ? 'Un transportista se está asignando en este momento' : undefined}><I d={ICO.x} />{e.estado === 'borrador' ? 'Cancelar solicitud' : 'Cancelar envío'}</button>}
      {/* Con SU transportista no hay incidencias: Dynamo no interviene en ese envío (usuario, 2026-11-17). */}
      {!manual && <a className="btn-secondary" href={`/panel/incidencias?nueva=${e.id}`}><I d={ICO.aviso} />Reportar incidencia</a>}
      {!manual && <a className="btn-secondary" href={`/panel/nuevo-envio?repetir=${e.id}`}><I d={ICO.repetir} />Repetir envío</a>}
    </>
  );

  return (
    <Modal abierto envivo ancho={760} onCerrar={cerrar} titulo={`Detalle de envío #${e.referencia_gx}`}
      sub={<span className={`badge badge-${ev.color}`}>{ev.label}</span>} icono={<I d={ICO.ojo} />} acciones={acciones}
      pie={<button className="btn-ghost" onClick={cerrar}>Cerrar</button>}>
      {trabajando && <Cargando texto={trabajando} />}
      {/* Contador de 30 s: el aviso del último cambio aún no ha salido y se puede anular. */}
      <ContadorCambio barra envio={e.id} referencia={e.referencia_gx} pendiente={pendiente} />
      {/* CABECERA EN CAJA, la misma que la ficha de Dynamo (usuario, 2026-11-12: «mismo
          formato, diseño y botones que admin»): fecha, ruta con todas las paradas,
          mercancía y precio, cada cosa en su fila. */}
      <div className="pen-envio-sum" style={{ marginBottom: '0.8rem' }}>
        {/* Banda AMARILLO CLARO del envío con SU transportista (usuario, 2026-11-17): la
            misma idea que la de la ficha de Dynamo, contada al cliente. */}
        {manual && (
          <div id="aviso-transportista-propio" style={{ background: '#fef9c3', color: '#111827', border: '1px solid #fde047', borderRadius: 8, padding: '0.5rem 0.7rem', marginBottom: '0.45rem', fontSize: 'var(--fs-m)', lineHeight: 1.45 }}>
            <strong>Envío con tu propio transportista: <span className="notranslate" translate="no">{e.operador || 'sin nombre anotado'}</span>.</strong>{' '}
            Lo has registrado tú: Dynamo no asigna camión ni lo oferta, el estado lo llevas tú y el CMR lo gestionas directamente con tu operador.
          </div>
        )}
        <div className="pen-sum-row"><span className="k">Fecha de carga</span><span className="v" style={{ color: 'var(--orange)', fontWeight: 800 }}>{fechaVital || '—'}</span></div>
        {/* Constancia de lo que se pidió (usuario, 2026-11-18): con la fecha ya asignada o real
            arriba, debajo queda la ventana de carga pedida (o el día, si era fecha fija). */}
        {(e.fecha_carga_real || e.fecha_carga_prevista) && e.fecha_carga_desde && (
          <div className="pen-sum-row" id="ficha-ventana-carga"><span className="k">Ventana de carga</span><span className="v">{ventana(e.fecha_carga_desde, e.fecha_carga_hasta)}</span></div>
        )}
        {[...recogidas, ...entregas].map((p, i) => (
          <div key={p.id ?? i} className="pen-sum-row">
            <span className="k"><EtiquetaParada num={i + 1} tipo={p.tipo} tipoSitio={p.tipo_sitio} /></span>
            <span className="v" style={{ textAlign: 'right' }}>{[[p.codigo_postal, p.poblacion].filter(Boolean).join(' '), p.provincia && p.provincia !== p.poblacion ? p.provincia : '', paisDe(p.pais_codigo_iso ?? 'ES')].filter(Boolean).join(', ') || '—'}</span>
          </div>
        ))}
        <div className="pen-sum-row pen-sum-col"><span className="k">Mercancía</span><span className="v">{mercResumen || '—'}</span></div>
        {manual && <div className="pen-sum-row"><span className="k">Transportista</span><span className="v notranslate" translate="no">{e.operador || '—'}</span></div>}
        {manual
          ? <div className="pen-sum-row"><span className="k">Precio acordado (sin IVA)</span><span className="v">{e.precio_acordado_operador != null ? euros(e.precio_acordado_operador) : 'No anotado'}</span></div>
          : <div className="pen-sum-row"><span className="k">Precio (sin IVA)</span><span className="v">{pc != null ? euros(pc) : <Pend />}</span></div>}
        {/* El TRANSPORTE, aquí mismo y siempre a la vista (usuario, 2026-11-18): antes iba en un
            desplegable aparte y había que abrirlo para ver la matrícula y el conductor. El día
            de carga ya está arriba («Fecha de carga»), así que no se repite. */}
        {!manual && e.estado !== 'cancelado' && (
          <div id="ficha-transporte" style={{ marginTop: '0.45rem', paddingTop: '0.45rem', borderTop: '1px dashed var(--gray-300)' }}>
            <div className="pen-sum-row"><span className="k">Transporte</span><span className="v">
              {e.estado === 'entregado' ? 'Entregado' : reservado
                ? <span className="asig-line asig-confirmado" style={{ marginTop: 0 }}><span className="asig-dot" />Confirmado</span>
                : <span className="asig-line asig-asignandose" style={{ marginTop: 0 }}><span className="asig-dot" />Sin camión todavía</span>}
            </span></div>
            <div className="pen-sum-row"><span className="k">Matrícula</span><span className="v">
              {e.matricula_camion ? <span className="dtc-mat">{e.matricula_camion}</span> : reservado && e.estado !== 'entregado' ? <Reservado que="matrículas pendientes de anotar" /> : <Pend />}
              {e.matricula_remolque && <span className="dtc-mat" style={{ marginLeft: '0.35rem' }}>{e.matricula_remolque}</span>}
            </span></div>
            <div className="pen-sum-row"><span className="k">Conductor</span><span className="v" style={{ textAlign: 'right' }}>
              {e.conductor_nombre || (e.estado === 'entregado' ? '—' : reservado ? <Reservado que="conductor pendiente de anotar" /> : <Pend />)}
              {e.estado !== 'entregado' && e.conductor_telefono && <> · <a href={`tel:${e.conductor_telefono}`} style={{ color: 'var(--purple)', fontWeight: 600 }}>{telBonito(e.conductor_telefono)}</a></>}
            </span></div>
          </div>
        )}
      </div>
      {aviso && <div className={`pt-aviso ${aviso.ok ? 'info' : 'error'}`} role="status" style={{ marginBottom: '0.8rem' }}><div>{aviso.txt}</div></div>}
      {manual && e.estado !== 'cancelado' && (
        <div className="det-block" style={{ marginBottom: '0.6rem' }}>
          <label htmlFor="em-estado" style={{ display: 'block', marginBottom: '0.3rem', fontSize: 'var(--fs-m)', fontWeight: 700, color: 'var(--gray-700)' }}>Estado del envío <span style={{ color: 'var(--gray-500)', fontWeight: 600 }}>· lo llevas tú (es con tu operador)</span></label>
          <select id="em-estado" className="ptar-select" value={e.estado} disabled={!!trabajando}
            onChange={(ev) => hacer('Guardando', () => marcarMiEnvioManual(e.id, ev.target.value))}>
            {FASES_M.map(([k, t]) => <option key={k} value={k}>{t}</option>)}
          </select>
          {/* El precio acordado con su transportista, a mano y sin salir de la ficha. */}
          <label htmlFor="em-precio" style={{ display: 'block', margin: '0.7rem 0 0.3rem', fontSize: 'var(--fs-m)', fontWeight: 700, color: 'var(--gray-700)' }}>Precio acordado con {e.operador || 'tu transportista'} <span style={{ color: 'var(--gray-500)', fontWeight: 600 }}>· sin IVA · opcional</span></label>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <input id="em-precio" type="text" inputMode="decimal" placeholder="Ej. 450,00" value={precioM} disabled={!!trabajando}
              onChange={(ev) => setPrecioM(ev.target.value)} style={{ flex: 1, minWidth: 0 }} />
            <button type="button" className="btn-secondary" disabled={!!trabajando || precioM.trim() === precioMIni}
              onClick={() => {
                const t = precioM.trim(); const v = t ? Number(t.replace(/\./g, '').replace(',', '.')) : null;
                if (v !== null && !(Number.isFinite(v) && v >= 0)) { setAviso({ ok: false, txt: 'El precio no es un número válido.' }); return; }
                hacer('Guardando', () => guardarPrecioEnvioManual(e.id, v));
              }}>Guardar precio</button>
          </div>
          <p style={{ margin: '0.6rem 0 0', fontSize: 'var(--fs-s)', color: 'var(--gray-500)' }}>Para cambiar la ruta, las fechas, la mercancía o el transportista, pulsa <strong>«Modificar envío»</strong>. Es tu envío: no se aplica ninguna condición ni se avisa a nadie.</p>
        </div>
      )}
      {asignandose && (
        <div className="pt-aviso info" role="status" style={{ marginBottom: '0.8rem' }}><div>
          <strong>Un transportista se está asignando a tu envío en este momento.</strong> Mientras termina, no se puede modificar ni cancelar desde aquí: vuelve a mirar en unos minutos. Si es urgente, llámanos al <a href={CONTACTO.telHref} style={{ fontWeight: 700 }}>{CONTACTO.telefono}</a>.
        </div></div>
      )}
      {!manual && <RevisionCliente envio={e} r={e.revision} hacer={hacer} />}
      {e.pago && e.estado !== 'cancelado' && <PagoCliente e={e} />}
      {!manual && <PedirCambio cambio={e.cambio} />}
      {!manual && ['cargando', 'en_ruta'].includes(e.estado) && <AvisoSiniestro quien="cliente" incidenciaHref={`/panel/incidencias?nueva=${e.id}&tipo=siniestro`} />}
      {/* ENVÍO Y SEGUIMIENTO unificados, lo primero del acordeón — el mismo esqueleto
          que la ficha de Dynamo (usuario, 2026-11-12). */}
      <Secc k="envio" titulo="Envío y seguimiento" abiertas={abiertas} toggle={toggle}
        resumen={[rutaCorta, mercResumen, precioTxt].filter(Boolean).join(' · ') || undefined}>
        {conSeguimiento && <>
          <SubTit primero>Seguimiento de la ruta</SubTit>
          <Etapas etapas={etapas} fichaParada={(n) => {
            const p = paradas[n - 1];
            return p ? puntoCli(p, p.tipo === 'carga' ? 'rec' : 'ent', n) : null;
          }} />
        </>}
        <SubTit primero={!conSeguimiento}>Solicitud</SubTit>
        <div className="pen-envio-sum">
          <div className="pen-sum-row"><span className="k">Nº de envío</span><span className="v">#{e.referencia_gx}</span></div>
          <div className="pen-sum-row"><span className="k">Tu referencia</span><span className="v">{e.referencia_cliente || '—'}</span></div>
          <div className="pen-sum-row"><span className="k">Creado</span><span className="v" style={{ textAlign: 'right' }}>{fechaHora(e.creado_en)}</span></div>
          <div className="pen-sum-row"><span className="k">{e.fecha_carga_real ? 'Fecha de carga real' : 'Fecha de carga · días de recogida'}</span><span className="v" style={{ textAlign: 'right' }}>{e.fecha_carga_real ? fecha(e.fecha_carga_real) : ventana(e.fecha_carga_desde, e.fecha_carga_hasta)}</span></div>
          {!e.fecha_carga_real && e.fecha_carga_prevista && <div className="pen-sum-row"><span className="k">Fecha de carga asignada</span><span className="v" style={{ color: 'var(--orange)', fontWeight: 800 }}>{fecha(e.fecha_carga_prevista)}</span></div>}
          <div className="pen-sum-row"><span className="k">Entrega estimada</span><span className="v">{e.fecha_entrega_estimada || e.entrega_desde ? fechaEntrega(e) : <Pend />}</span></div>
          {e.modificado_en && <div className="pen-sum-row"><span className="k">Última modificación</span><span className="v">{fechaHora(e.modificado_en)}</span></div>}
          {e.discrecion_comercial && <div className="pen-sum-row pen-sum-col"><span className="k">Discreción comercial</span><span className="v"><span style={{ color: 'var(--purple)' }}>Activada</span> — el conductor no revela el destino en la carga ni el origen en la entrega</span></div>}
        </div>
        {!conSeguimiento && <>
          <SubTit>Ruta{paradas.length > 2 ? ` (${paradas.length} paradas)` : ''}</SubTit>
          <div className="det-ruta">
            {[...recogidas.map((p, i) => ({ p, cls: 'rec' as const, num: i + 1 })),
              ...entregas.map((p, i) => ({ p, cls: 'ent' as const, num: recogidas.length + i + 1 }))].map(({ p, cls, num }) => puntoCli(p, cls, num))}
          </div>
        </>}
        <SubTit>Mercancía</SubTit>
        <div className="pen-envio-sum">
          <div className="pen-sum-row"><span className="k">Mercancía</span><span className="v" style={{ textAlign: 'right' }}>{e.descripcion_mercancia || (e.paletizado === false ? 'No paletizada' : 'Paletizada')}</span></div>
          <div className="pen-sum-row"><span className="k">Medidas</span><span className="v">{[e.metros_lineales != null && `${metros(e.metros_lineales)}`, e.toneladas != null && `${pesoTn(e.toneladas)}`].filter(Boolean).join(' · ') || '—'}</span></div>
          <div className="pen-sum-row"><span className="k">Tipo de carga</span><span className="v">{[tipoCargaTxt(e.tipo_carga, e.requiere_plataforma_elevadora), alturaMaxTxt(e.requiere_plataforma_elevadora)].filter(Boolean).join(' · ') || '—'}</span></div>
          <div className="pen-sum-row"><span className="k">Forma de carga</span><span className="v">{[e.carga_lateral && 'Lateral', e.carga_trasera && 'Trasera', e.carga_techo && 'Techo'].filter(Boolean).join(', ') || '—'}</span></div>
          <div className="pen-sum-row"><span className="k">Requisitos</span><span className="v" style={{ textAlign: 'right' }}>{[e.requiere_plataforma_elevadora && 'Plataforma elevadora', e.requiere_nima && 'Requiere NIMA', e.adr && 'Mercancía ADR', e.paletizado === false && 'No paletizada'].filter(Boolean).join(' · ') || 'Ninguno'}{e.requiere_nima && <> <Tip texto={SIGLAS.NIMA} aria="Qué significa NIMA" /></>}{e.adr && <> <Tip texto={SIGLAS.ADR} aria="Qué significa ADR" /></>}</span></div>
          {e.anotaciones_cliente && <div className="pen-sum-row pen-sum-col"><span className="k">Anotaciones</span><span className="v">{e.anotaciones_cliente}</span></div>}
          {e.estado !== 'cancelado' && <div className="modal-info-grid" style={{ marginTop: '0.2rem' }}><DatosCmr envioId={e.id} puedeEditar={['borrador', 'programado', 'hacia_la_carga'].includes(e.estado)} bloquearSiFirmado /></div>}
        </div>
        {<>
          <SubTit>Precio</SubTit>
          <div className="pen-envio-sum">
            {manual ? (
              <div className="pen-sum-row"><span className="k">Precio acordado con tu transportista (sin IVA)</span><span className="v">{e.precio_acordado_operador != null ? euros(e.precio_acordado_operador) : 'No anotado'}</span></div>
            ) : pc == null ? (
              <div className="pen-sum-row"><span className="k">Precio</span><span className="v"><Pend /></span></div>
            ) : (
              <>
                <div className="pen-sum-row"><span className="k" style={{ color: 'var(--navy)', fontWeight: 800 }}>Base imponible</span><span className="v" style={{ color: 'var(--purple)', fontSize: 'var(--fs-l)', fontWeight: 800 }}>{euros(pc)}</span></div>
                <div className="pen-sum-row"><span className="k">IVA ({porcentaje(iva)})</span><span className="v" style={{ fontWeight: 600 }}>{euros(pc * iva / 100)}</span></div>
                <div className="pen-sum-row"><span className="k">Total (IVA incl.)</span><span className="v">{euros(pc * (1 + iva / 100))}</span></div>
                <SelloPrecio r={e.revision} />
              </>
            )}
          </div>
        </>}
      </Secc>

      {(
        <Secc k="documentos" titulo="Documentos" abiertas={abiertas} toggle={toggle} resumen="albarán y CMR firmado">
          <div className="det-block">
            <Documentos dueno={{ campo: 'envio_id', id: e.id }} tipos={['albaran', 'cmr_firmado', 'otro']} editable={false}
              ayuda={<>El albarán y el CMR firmado aparecen aquí en cuanto los tengamos y se te notificará por email.</>} />
          </div>
        </Secc>
      )}

      {e.valoracion?.puede && <ValorarTransportista envio={e.id} v={e.valoracion} onHecho={() => refrescar()} />}

      <Secc k="historial" titulo="Historial" abiertas={abiertas} toggle={toggle}
        extra={(e.hitos ?? []).filter((h) => HITOS[h.hito]).length || undefined}>
        {(e.hitos ?? []).length > 0 && (
          <div className="pen-envio-sum">
            {e.hitos.filter((h) => HITOS[h.hito]).map((h) => (
              // Apilado y a la izquierda (usuario, 2026-11-14), como en la ficha de admin.
              <div key={h.id} className="pen-sum-row pen-sum-col"><span className="k" style={{ whiteSpace: 'nowrap' }}>{fechaHora(h.cuando)}</span><span className="v">{h.hito === 'etapa_corregida' ? 'Etapa del seguimiento actualizada' : HITOS[h.hito]}</span></div>
            ))}
          </div>
        )}
        <Historial tabla="envios" id={e.id} />
      </Secc>
    </Modal>
  );
}

// ---- El cliente puntúa al transportista (envío de Dynamo entregado) ----------------------
function ValorarTransportista({ envio, v, onHecho }: { envio: string; v: { nota: number | null; comentario: string | null; editable: boolean }; onHecho: () => void }) {
  const [nota, setNota] = useState<number | null>(v.nota ?? null);
  const [com, setCom] = useState(v.comentario ?? '');
  const [msg, setMsg] = useState<{ ok: boolean; txt: string } | null>(null);
  const [trabajando, setTrabajando] = useState(false);
  const cambiado = nota !== (v.nota ?? null) || com !== (v.comentario ?? '');
  async function guardar() {
    if (!nota) { setMsg({ ok: false, txt: 'Elige de 1 a 5 estrellas.' }); avisaFaltas(['val-nota']); return; }
    setMsg(null); setTrabajando(true);
    const r = await valorarMiEnvio(envio, nota, com);
    setTrabajando(false);
    setMsg(r.ok ? { ok: true, txt: r.aviso ?? 'Valoración guardada.' } : { ok: false, txt: r.error });
    if (r.ok) onHecho();
  }
  return <>
    <h4 className="modal-section-title">¿Qué tal el transportista?</h4>
    <div className="det-block">
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', flexWrap: 'wrap' }}>
        <div id="val-nota" className="valora-estrellas" role="radiogroup" aria-label="Nota de 1 a 5">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" role="radio" aria-checked={nota === n} aria-label={`${n} de 5`} disabled={!v.editable}
              className={nota != null && n <= nota ? 'on' : ''} onClick={() => setNota(n)}>★</button>
          ))}
        </div>
        <span style={{ fontSize: 'var(--fs-m)', color: 'var(--gray-500)' }}>{nota ? `${nota} de 5` : 'Puntúa de 1 a 5 estrellas'}</span>
      </div>
      {v.editable ? <>
        <textarea rows={2} maxLength={500} style={{ marginTop: '0.6rem', width: '100%' }} placeholder="Cuéntanos qué tal (puntualidad, trato, cuidado de la mercancía…) · opcional"
          value={com} onChange={(ev) => setCom(ev.target.value)} />
        <div style={{ marginTop: '0.5rem' }}>
          <button className="btn-primary" disabled={!cambiado || trabajando} onClick={guardar}>{v.nota ? 'Cambiar valoración' : 'Enviar valoración'}</button>
        </div>
        <p style={{ fontSize: 'var(--fs-s)', color: 'var(--gray-500)', margin: '0.4rem 0 0' }}>Solo la ve el equipo de Dynamo. Puedes cambiarla durante 30 días.</p>
      </> : (v.comentario && <p style={{ margin: '0.4rem 0 0', fontSize: 'var(--fs-m)', color: 'var(--gray-700)' }}>«{v.comentario}»</p>)}
      {msg && <div className={msg.ok ? 'pt-aviso info' : 'wiz-warn show'} style={{ marginTop: '0.5rem' }} role="status"><div>{msg.txt}</div></div>}
      {trabajando && <Cargando texto="Guardando tu valoración" />}
    </div>
  </>;
}

// Previo pago, visto por el cliente: qué falta, el total, la proforma y cómo pagar.
function PagoCliente({ e }: { e: EnvioCliente }) {
  const p = e.pago!;   // solo se pinta con pago
  // «Ya he hecho la transferencia»: se pregunta una vez (no es un botón para pulsar por si acaso).
  const refrescar = useRefrescar();
  const [preguntaAviso, setPreguntaAviso] = useState(false);
  const [avisando, setAvisando] = useState(false);
  const [resAviso, setResAviso] = useState<{ ok: boolean; txt: string } | null>(null);
  async function avisar() {
    setAvisando(true); setResAviso(null);
    const r = await avisarPagoTransferencia(e.id).catch(() => ({ ok: false as const, error: SIN_CONEXION }));
    setAvisando(false); setPreguntaAviso(false);
    setResAviso({ ok: r.ok, txt: r.ok ? (r.aviso ?? 'Aviso recibido.') : (r.error ?? 'No se ha podido registrar el aviso.') });
    if (r.ok) refrescar();
  }
  // Si ya pagó y el precio subió al modificar el envío, lo pagado queda a cuenta y solo
  // falta la diferencia (usuario, 2026-11-16).
  const aCuenta = Number(p.a_cuenta ?? 0);
  const resto = aCuenta > 0;
  const total = euros(resto ? Number(p.pendiente) : Number(p.total));
  if (p.estado_pago_previo === 'pendiente') {
    return (
      <div className="modal-warn-box" style={{ marginBottom: '0.8rem' }}>
        {e.pagoVuelta === 'ok' && <div style={{ color: '#0f6b3a', fontWeight: 800, marginBottom: '0.4rem' }}>Pago con tarjeta hecho. En unos segundos se confirma aquí (recarga si no cambia).</div>}
        {(e.pagoVuelta === 'error' || e.pagoVuelta === 'no_disponible') && <div style={{ color: '#b42318', fontWeight: 700, marginBottom: '0.4rem' }}>No se ha podido abrir el pago con tarjeta. Prueba otra vez en un momento o paga por transferencia.</div>}
        {e.pagoVuelta === 'caducado' && <div style={{ color: '#b42318', fontWeight: 700, marginBottom: '0.4rem' }}>Ha pasado el plazo para pagar este envío: se va a anular. Vuelve a pedirlo con «Repetir envío».</div>}
        {e.pagoVuelta === 'cancelado' && <div style={{ fontWeight: 700, marginBottom: '0.4rem' }}>Has salido del pago con tarjeta sin pagar. Puedes intentarlo de nuevo o pagar por transferencia.</div>}
        <div><strong style={{ color: '#b42318' }}>{resto ? 'Falta por pagar' : 'Pendiente de pago'} · {total}</strong> (IVA incluido).</div>
        {resto && <div style={{ marginTop: '0.3rem' }}>Has modificado el envío y el precio ha subido: ya tenías pagados <strong>{euros(aCuenta)}</strong> y el envío cuesta ahora <strong>{euros(Number(p.total))}</strong>. <strong>El envío no sigue adelante hasta que pagues la diferencia.</strong></div>}
        <div style={{ marginTop: '0.3rem', display: resto ? 'none' : undefined }}>{p.pago_motivo?.startsWith('Primer') ? 'Es tu primer envío con nosotros: este' : p.pago_motivo?.startsWith('Uno de los') ? 'Es uno de tus primeros envíos con nosotros: este' : p.pago_motivo?.startsWith('Crédito insuficiente') ? 'Con este envío superas tu línea de crédito disponible: este' : 'Este'} envío se paga por adelantado. <strong>Pasamos a programación en cuanto recibimos el pago.</strong></div>
        {p.pago_avisado_en ? (
          <div id="pago-avisado" className="pago-avisado" role="status">
            <span className="pa-ico" aria-hidden="true">✓</span>
            <span><strong>Transferencia avisada el {fechaHora(p.pago_avisado_en)}. La estamos validando.</strong> El plazo para pagar está <strong>parado</strong>: el envío no se anula mientras comprobamos el cobro. En cuanto lo veamos en el banco, pasa a programación y te avisamos.</span>
          </div>
        ) : p.pago_limite && (
          <div id="pago-plazo">
            <CuentaAtras grande hasta={p.pago_limite} vencidoTxt="Plazo vencido: el envío se anula en breve" />
            <div>Paga antes del <strong>{fechaHora(p.pago_limite)}</strong>. Si para entonces no has pagado con tarjeta ni nos has avisado de tu transferencia, el envío y su proforma <strong>se anulan solos</strong> y tendrás que crear un envío nuevo (con el precio de ese momento).</div>
          </div>
        )}
        {p.precio_provisional ? (
          <div style={{ marginTop: '0.3rem' }}>Como el precio es <strong>provisional</strong>, el pago se pide cuando lo revisemos{e.revision?.fecha_revision_precio ? <> (el <strong>{fecha(e.revision.fecha_revision_precio)}</strong>)</> : null}, ya con el precio definitivo. Desde ese momento tendrás un plazo para pagar.</div>
        ) : <>
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.7rem', flexWrap: 'wrap' }}>
          {e.tarjeta
            ? <form action="/api/stripe/pago" method="post"><input type="hidden" name="envio" value={e.id} /><button type="submit" className="btn-primary">Pagar {total} con tarjeta</button></form>
            : null}
          <a className="btn-secondary" href={`/panel/envios/${e.id}/proforma`} target="_blank" rel="noopener">Ver proforma (transferencia)</a>
          {!p.pago_avisado_en && !preguntaAviso && <button type="button" id="pago-avisar" className="btn-primary" onClick={() => { setResAviso(null); setPreguntaAviso(true); }}>Ya he hecho la transferencia</button>}
        </div>
        {preguntaAviso && !p.pago_avisado_en && (
          <div id="pago-avisar-confirmar" style={{ marginTop: '0.6rem', background: '#fff', border: '1px solid var(--gray-200)', borderRadius: 10, padding: '0.7rem 0.8rem' }}>
            <strong>¿Ya has hecho la transferencia de {total}?</strong>
            <div style={{ marginTop: '0.25rem' }}>Pulsa «Sí» solo si ya está hecha, con el concepto <strong>PRO-{e.referencia_gx}</strong>. Paramos el plazo y lo comprobamos en el banco; si no nos consta, el envío se anula.</div>
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.55rem', flexWrap: 'wrap' }}>
              <button type="button" className="btn-primary" disabled={avisando} onClick={avisar}>Sí, ya la he hecho: validadla</button>
              <button type="button" className="btn-ghost" disabled={avisando} onClick={() => setPreguntaAviso(false)}>Todavía no</button>
            </div>
          </div>
        )}
        {resAviso && <div className={resAviso.ok ? 'pt-aviso info' : 'wiz-warn show'} role="status" style={{ marginTop: '0.5rem' }}><div>{resAviso.ok ? resAviso.txt : `⚠ ${resAviso.txt}`}</div></div>}
        {avisando && <Cargando texto="Enviando tu aviso" />}
        <div style={{ fontSize: 'var(--fs-s)', color: 'var(--gray-500)', marginTop: '0.5rem' }}>
          {e.tarjeta ? 'Con tarjeta se confirma al momento. ' : 'El pago con tarjeta estará disponible muy pronto. '}
          Con <strong>tarjeta</strong> el envío pasa a <strong>programación de envíos al momento</strong>. Por <strong>transferencia inmediata</strong> (llega en segundos y tu banco no te cobra más que por una normal), usa los datos de la proforma, pon <strong>PRO-{e.referencia_gx}</strong> como concepto y pulsa <strong>«Ya he hecho la transferencia»</strong>: el plazo se para mientras la validamos.
        </div>
        </>}
      </div>
    );
  }
  if (p.estado_pago_previo === 'pagado') {
    return <div className="pt-aviso info" style={{ marginBottom: '0.8rem' }}><div><strong>Pagado</strong> {p.pago_metodo === 'stripe' ? 'con tarjeta' : 'por transferencia'}{p.pagado_en ? ` el ${fechaHora(p.pagado_en)}` : ''} · {euros(Number(p.total))}. Gracias: ya estamos asignando el camión.</div></div>;
  }
  return null;
}
