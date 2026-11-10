'use client';

// Ficha del envío (solo Dynamo, etapa A): el "Ver detalle" de dashboard.html con datos
// reales. Compacta (usuario, 2026-11-10): cabecera «vital» con lo esencial, 2-3 acciones
// primarias según el estado + el resto en «⋯ Más», y las secciones (Solicitud · Transporte
// · Ruta · Mercancía · Precio · Documentos · Seguimiento · Historial…) en ACORDEÓN con su
// resumen en la línea. Todo lo vuelve a comprobar el servidor y la base de datos.
import { SIN_CONEXION } from '@/lib/mensajeError';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { avisarNavegando } from './CargandoNavegacion';
import { useRefrescar } from '@/lib/useRefrescar';
import DatosCmr from './DatosCmr';
import Modal from './Modal';
import Documentos from './Documentos';
import Cargando from '@/components/Cargando';
import { euros, fecha, ventana, pesoTn, fechaHora, metros, porcentaje, tipoCargaTxt } from '@/lib/formato';
import { paisDe, telBonito } from '@/lib/paises';
import type { Ficha } from '@/lib/fichaEnvio';
import PagoPrevio from './PagoPrevio';
import { RevisionDynamo, SelloPrecio } from './RevisionPrecio';
import Historial from './Historial';
import { AvisoCambiosDynamo } from './CambiosEnvio';
import { deshacerCancelacion, revocarOferta, resolverContraoferta, resolverContraofertaCliente, responderCambioEnNombre } from '@/app/panel/(app)/envios/acciones';
import { CANALES, Celda, ESTADOS, ESTADO_OFERTA, HITOS, I, ICO, ORIGEN, Pend, Secc, Vista, enlaceOferta, txtNum } from './ficha/comun';
import { Punto } from './ficha/Punto';
import { Asignar } from './ficha/Asignar';
import { Estado } from './ficha/Estado';
import Etapas from './ficha/Etapas';
import { Cancelar } from './ficha/Cancelar';
import { Modificar } from './ficha/Modificar';
import { PonerPrecio } from './ficha/PonerPrecio';
import { Valoracion } from './ficha/Valoracion';
import { CmrDigital } from './ficha/CmrDigital';
import { Ofrecer } from './ficha/Ofrecer';

// ---- «⋯ Más»: las acciones secundarias en un desplegable (de 3 filas de botones a 1) --
// Rótulo de los bloques DENTRO de la sección unificada «Envío» (usuario, 2026-11-10:
// solicitud, ruta, mercancía y precio en un solo desplegable, ordenado y sin duplicar).
function SubTit({ children, primero }: { children: React.ReactNode; primero?: boolean }) {
  return <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--navy)', margin: primero ? '0 0 0.4rem' : '1rem 0 0.4rem' }}>{children}</div>;
}

function MasAcciones({ children }: { children: React.ReactNode }) {
  const [abierto, setAbierto] = useState(false);
  useEffect(() => {
    if (!abierto) return;
    const esc = (ev: KeyboardEvent) => { if (ev.key === 'Escape') setAbierto(false); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [abierto]);
  // EMERGENTE a lo ancho (usuario, 2026-11-10): velo + panel centrado (hoja inferior en
  // móvil). En PORTAL sobre <body>: dentro del modal de la ficha (que lleva transform por
  // su animación) el position:fixed se calcula contra el modal y el panel caía fuera de
  // la pantalla — solo se veía el velo. El velo cierra, así que no hace falta detectar
  // clics «fuera».
  return (
    <div className="ficha-mas">
      <button type="button" className="btn-secondary" aria-haspopup="menu" aria-expanded={abierto} onClick={() => setAbierto((v) => !v)}>⋯ Más</button>
      {abierto && createPortal(<>
        <div className="ficha-mas-backdrop" onClick={() => setAbierto(false)} />
        <div className="ficha-mas-menu" role="menu">
          <div className="fm-asa" aria-hidden="true" />
          <div className="fm-cab">
            <span>Más acciones</span>
            <button type="button" className="fm-x" aria-label="Cerrar" onClick={() => setAbierto(false)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M18 6 6 18" /><path d="M6 6l12 12" /></svg>
            </button>
          </div>
          <div className="fm-lista" onClick={() => setAbierto(false)}>{children}</div>
        </div>
      </>, document.body)}
    </div>
  );
}

export default function FichaEnvio({ ficha, cerrarHref }: { ficha: Ficha; cerrarHref: string }) {
  const router = useRouter();
  const refrescar = useRefrescar();
  const e = ficha.envio;
  const [vista, setVista] = useState<Vista>('ficha');
  // Hoja del eCMR + DeCA (pegada al pie, como «Más acciones»): todo lo del CMR junto.
  const [cmrAbierto, setCmrAbierto] = useState(false);
  useEffect(() => {
    if (!cmrAbierto) return;
    const esc = (ev: KeyboardEvent) => { if (ev.key === 'Escape') setCmrAbierto(false); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [cmrAbierto]);
  const [aviso, setAviso] = useState<{ ok: boolean; txt: string } | null>(null);
  const [trabajando, setTrabajando] = useState<string | null>(null);
  // CERRAR AL INSTANTE (usuario, 2026-11-10: «cerrar es muy lento»): la ventana se oculta
  // ya y el cargador fino cubre la vuelta a la lista mientras llega la página.
  const [cerrando, setCerrando] = useState(false);
  const cerrar = () => { setCerrando(true); avisarNavegando(); router.push(cerrarHref, { scroll: false }); };
  const manual = !!e.es_manual;
  const cancelado = e.estado === 'cancelado';
  const est0 = ESTADOS.find(([k]) => k === e.estado) ?? ESTADOS[0];
  const est: [string, string, string] = cancelado && ficha.pago?.estado === 'pendiente' ? ['cancelado', 'Anulado sin pago', 'cancelada'] : est0;

  const recogidas = ficha.paradas.filter((p) => p.tipo === 'carga');
  const entregas = ficha.paradas.filter((p) => p.tipo === 'descarga');
  const pc = e.importe_cliente != null ? Number(e.importe_cliente) : null;
  const pt = e.importe_transportista != null ? Number(e.importe_transportista) : null;
  const firmasHechas = ficha.firmasCmr.filter((x) => !x.extra).length;
  const firmasTotal = ficha.paradas.length + 1;

  // Acordeón: abierta por defecto SOLO la sección que toca según el estado.
  // SIEMPRE todo plegado al abrir (usuario, 2026-11-10): la cabecera vital y los resúmenes
  // de cada sección ya cuentan lo esencial; se abre solo lo que se toca.
  const [abiertas, setAbiertas] = useState<Set<string>>(() => new Set());
  const toggle = (k: string) => setAbiertas((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  async function hacer(texto: string, fn: () => Promise<{ ok: boolean; error?: string; aviso?: string }>, okTxt?: string) {
    setTrabajando(texto); setAviso(null);
    // Si la acción revienta (sin conexión, o justo tras publicar una versión nueva), no se
    // queda el «trabajando…» para siempre: se avisa y se puede reintentar.
    const r: Awaited<ReturnType<typeof fn>> = await fn().catch(() => ({ ok: false, error: SIN_CONEXION }));
    setTrabajando(null);
    if (!r.ok) { setAviso({ ok: false, txt: r.error ?? 'No se ha podido hacer.' }); return false; }
    setAviso({ ok: true, txt: r.aviso ?? okTxt ?? 'Hecho.' });
    setVista('ficha');
    refrescar();
    return true;
  }

  // ---- Acciones: 2-3 primarias según el estado y el resto en «⋯ Más» ----------------
  const acciones = cancelado ? (
    <>
      <button className="btn-primary" onClick={() => hacer('Deshaciendo la cancelación', () => deshacerCancelacion(e.id), 'Cancelación deshecha: el envío vuelve a estar como antes.')}>
        <I d={ICO.deshacer} />Deshacer cancelación
      </button>
      {!manual && <a className="btn-secondary" href={`/panel/nuevo-envio?repetir=${e.id}`}><I d={ICO.repetir} />Repetir envío</a>}
    </>
  ) : (
    <>
      {/* eCMR + DeCA EL PRIMERO y siempre a mano (usuario, 2026-11-10): TODO lo del CMR
          unificado detrás de este botón (vista propia: firmar, compartir el enlace, el
          PDF relleno y el registro de firmas). Ámbar con el contador; verde al completarse. */}
      <button type="button" className="btn-primary" onClick={() => setCmrAbierto(true)}
         title="Todo el eCMR + DeCA: firmar, compartir el enlace y el PDF relleno con el QR."
         style={{ background: firmasHechas >= firmasTotal ? 'var(--green)' : '#d97706' }}>
        <I d={ICO.doc} />eCMR + DeCA
        <span style={{ marginLeft: '0.3rem', padding: '0.1rem 0.55rem', borderRadius: 999, fontSize: 'var(--fs-s)', fontWeight: 800, background: 'rgba(255,255,255,0.24)', color: '#fff' }}>
          {firmasHechas}/{firmasTotal} firmas{firmasHechas >= firmasTotal ? ' ✓' : ''}
        </span>
      </button>
      {e.estado === 'borrador' && (e.estado_solicitud === 'pendiente_precio' || e.estado_solicitud === 'precio_propuesto') && (
        <button className="btn-primary" onClick={() => setVista('precio')}><I d={ICO.enviar} />{e.estado_solicitud === 'pendiente_precio' ? 'Poner precio' : 'Cambiar precio'}</button>
      )}
      {/* Pendiente de pago: ni ofertar ni asignar hasta que se pague (la base de datos lo
          rechaza igualmente); la caja naranja del pago ya explica qué hacer. El precio
          PROVISIONAL no bloquea nada (usuario, 2026-11-09): se oferta y se asigna
          igualmente, y al asignar camión el precio queda definitivo. */}
      {!manual && e.estado === 'programado' && !ficha.transportista && ficha.pago?.estado !== 'pendiente' && (
        <button className="btn-primary" onClick={() => setVista('ofrecer')}><I d={ICO.enviar} />Ofrecer envío</button>
      )}
      {!manual && !ficha.transportista && e.estado !== 'entregado' && ficha.pago?.estado !== 'pendiente' && (
        <button className="btn-primary" onClick={() => setVista('asignar')}><I d={ICO.camion} />Asignar transportista</button>
      )}
      {/* «Cambiar estado» vive DENTRO de Seguimiento (usuario, 2026-11-10); arriba solo
          queda cuando esa sección no existe (envío manual o sin etapas). */}
      {!(!cancelado && !manual && ficha.etapas.length > 0) && (
        <button className="btn-secondary" onClick={() => setVista('estado')}><I d={ICO.fase} />Cambiar estado</button>
      )}
      <MasAcciones>
        {/* Un solo «Modificar» (dentro de «Más», usuario 2026-11-10): abre el asistente de
            Nuevo envío con TODO precargado; si no se toca nada que afecte al precio, el
            precio se queda. El envío manual conserva su ventana rápida y su «Cambiar ruta». */}
        {manual
          ? <button className="fm-item" onClick={() => setVista('modificar')}><I d={ICO.editar} />Modificar</button>
          : <a className="fm-item" href={`/panel/nuevo-envio?editar=${e.id}`}><I d={ICO.editar} />Modificar</a>}
        {!manual && ficha.transportista && e.estado !== 'entregado' && (
          <button className="fm-item" onClick={() => setVista('asignar')}><I d={ICO.camion} />Cambiar transportista</button>
        )}
        {manual && ['programado', 'hacia_la_carga'].includes(e.estado) && ficha.firmasCmr.length === 0 && (
          <a className="fm-item" href={`/panel/nuevo-envio?ruta=${e.id}`}><I d={ICO.ruta} />Cambiar ruta</a>
        )}
        {!manual && <a className="fm-item" href={`/panel/nuevo-envio?repetir=${e.id}`}><I d={ICO.repetir} />Repetir envío</a>}
        {/* PDF: se generan al momento y se abren en el visor (regla 0-bis). La orden, cuando
            ya hay a quién mandarla. */}
        {(manual || ficha.transportista) && (
          <a className="fm-item" href={`/panel/envios/${e.id}/orden-de-carga`} target="_blank" rel="noopener"><I d={ICO.doc} />Orden de carga</a>
        )}
        {/* Incidencia en cualquier estado del envío (decisión 2026-07-12); penalización en los de Dynamo. */}
        <a className="fm-item" href={`/panel/incidencias?nueva=${e.id}`}><I d={ICO.aviso} />Reportar incidencia</a>
        {!manual && <a className="fm-item" href={`/panel/penalizaciones?nueva=${e.id}`}><I d={ICO.x} />Crear penalización</a>}
        <button className="fm-item rojo" onClick={() => setVista('cancelar')}><I d={ICO.x} />Cancelar envío</button>
      </MasAcciones>
    </>
  );

  const fallo = aviso && !aviso.ok ? aviso.txt : null;
  if (vista === 'asignar') return <Asignar ficha={ficha} onVolver={() => setVista('ficha')} hacer={hacer} trabajando={trabajando} fallo={fallo} />;
  if (vista === 'estado') return <Estado ficha={ficha} onVolver={() => setVista('ficha')} hacer={hacer} trabajando={trabajando} fallo={fallo} />;
  if (vista === 'cancelar') return <Cancelar ficha={ficha} onVolver={() => setVista('ficha')} hacer={hacer} trabajando={trabajando} fallo={fallo} />;
  if (vista === 'modificar') return <Modificar ficha={ficha} onVolver={() => setVista('ficha')} hacer={hacer} trabajando={trabajando} fallo={fallo} />;
  if (vista === 'precio') return <PonerPrecio ficha={ficha} onVolver={() => setVista('ficha')} hacer={hacer} trabajando={trabajando} fallo={fallo} />;
  if (vista === 'ofrecer') return <Ofrecer ficha={ficha} onVolver={() => { setVista('ficha'); refrescar(); }} />;

  // ---- Cabecera «vital»: lo que se mira el 90 % de las veces, sin scroll ------------
  const rutaCorta = [recogidas[0]?.poblacion, entregas[entregas.length - 1]?.poblacion].filter(Boolean).join(' → ');
  const fechaVital = e.fecha_carga_real ? fecha(e.fecha_carga_real)
    : e.fecha_carga_prevista ? fecha(e.fecha_carga_prevista)
    : e.fecha_carga_desde ? ventana(e.fecha_carga_desde, e.fecha_carga_hasta) : '';
  const mercResumen = [e.metros_lineales != null && metros(e.metros_lineales), e.toneladas != null && pesoTn(e.toneladas),
    e.descripcion_mercancia || (e.paletizado === false ? 'No paletizada' : 'Paletizada')].filter(Boolean).join(' · ');

  if (cerrando) return null;
  return (
    <Modal abierto envivo ancho={760} onCerrar={cerrar} titulo={`Detalle de envío #${e.referencia_gx}`}
      sub={<>{ficha.cliente ? `${ficha.cliente.nombre} · ` : ''}<span className={`badge badge-${est[2]}`}>{est[1]}</span></>}
      icono={<I d={ICO.ojo} />} acciones={acciones}
      pie={<button className="btn-ghost" onClick={cerrar}>Cerrar</button>}>
      {/* CABECERA EN CAJA (usuario, 2026-11-10: «esa info es un caos; ponlo en caja
          simple, ordenado, claro»): fecha, ruta con TODAS las paradas (CP, localidad,
          provincia y país), mercancía y precios, cada cosa en su fila. */}
      <div className="det-block" style={{ marginBottom: '0.8rem' }}>
        <div className="pen-envio-sum">
          <div className="pen-sum-row"><span className="k">Fecha de carga</span><span className="v" style={{ color: 'var(--orange)', fontWeight: 800 }}>{fechaVital || '—'}</span></div>
          {[...recogidas.map((p, i) => ({ p, color: 'var(--orange)', lbl: recogidas.length > 1 ? `Recogida ${i + 1}` : 'Recogida' })),
            ...entregas.map((p, i) => ({ p, color: 'var(--green)', lbl: entregas.length > 1 ? `Entrega ${i + 1}` : 'Entrega' }))].map(({ p, color, lbl }) => (
            <div key={p.id} className="pen-sum-row">
              <span className="k" style={{ whiteSpace: 'nowrap' }}><span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: '50%', background: color, marginRight: '0.4rem' }} />{lbl}</span>
              <span className="v" style={{ textAlign: 'right' }}>{[[p.codigo_postal, p.poblacion].filter(Boolean).join(' '), p.provincia && p.provincia !== p.poblacion ? p.provincia : '', paisDe(p.pais_codigo_iso ?? 'ES')].filter(Boolean).join(', ') || '—'}</span>
            </div>
          ))}
          <div className="pen-sum-row"><span className="k">Mercancía</span><span className="v" style={{ textAlign: 'right' }}>{mercResumen || '—'}</span></div>
          {!manual && ficha.transportista && <div className="pen-sum-row"><span className="k">Transportista</span><span className="v" style={{ textAlign: 'right' }}>{ficha.transportista.nombre}</span></div>}
          {manual
            ? <div className="pen-sum-row"><span className="k">Precio acordado</span><span className="v">{e.precio_acordado_operador != null ? euros(e.precio_acordado_operador) : 'No anotado'}</span></div>
            : <div className="pen-sum-row"><span className="k">Precio</span><span className="v">
                {pc != null ? <>Cliente <strong>{euros(pc)}</strong></> : 'Pendiente'}
                {pt != null && <> · Transp. {euros(pt)}</>}
                {e.margen_euros != null && <> · Margen <strong style={{ color: Number(e.margen_euros) >= 0 ? '#0f6b3a' : '#dc2626' }}>{euros(e.margen_euros)}</strong></>}
              </span></div>}
        </div>
      </div>
      {aviso && <div className={`pt-aviso ${aviso.ok ? 'info' : 'error'}`} role="status" style={{ marginBottom: '0.8rem' }}><div>{aviso.txt}</div></div>}
      {e.estado === 'borrador' && e.estado_solicitud === 'pendiente_precio' && (
        <div className="modal-warn-box"><strong>Solicitud del cliente esperando precio.</strong> Pónselo con «Poner precio»: lo verá en su panel para aceptarlo (prometemos menos de 25 minutos en horario de oficina).</div>
      )}
      {e.estado === 'borrador' && e.estado_solicitud === 'contraoferta' && e.importe_contraoferta_cliente != null && (
        <div className="modal-warn-box" style={{ marginBottom: '0.8rem' }}>
          <strong>Contraoferta del cliente:</strong> propone <strong>{euros(Number(e.importe_contraoferta_cliente))}</strong> (sin IVA) frente a nuestros {euros(e.importe_cliente)}
          {e.importe_cliente ? <> ({Math.round((1 - Number(e.importe_contraoferta_cliente) / Number(e.importe_cliente)) * 1000) / 10} % menos)</> : null}
          {e.importe_transportista != null && <> · coste del transporte previsto {euros(e.importe_transportista)}, margen con su precio {euros(Number(e.importe_contraoferta_cliente) - Number(e.importe_transportista))}</>}.
          Ya aceptó las condiciones al proponerlo.
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.6rem', flexWrap: 'wrap' }}>
            <button className="btn-primary" onClick={() => hacer('Aprobando', () => resolverContraofertaCliente(e.id, true))}>Aprobar su precio y confirmar el envío</button>
            <button className="btn-ghost" style={{ color: '#dc2626' }} onClick={() => hacer('Rechazando', () => resolverContraofertaCliente(e.id, false))}>Rechazar (vuelve a ver nuestro precio)</button>
          </div>
        </div>
      )}
      {e.importe_cliente_inicial != null && e.importe_contraoferta_cliente != null && e.estado_solicitud === 'aceptada' && (
        <div className="pt-aviso info" style={{ marginBottom: '0.8rem' }}><div>Precio conseguido por <strong>contraoferta del cliente</strong>: {euros(e.importe_cliente)} (le dimos {euros(e.importe_cliente_inicial)}).</div></div>
      )}
      {e.estado === 'borrador' && e.estado_solicitud === 'precio_propuesto' && (
        <div className="pt-aviso info"><div>Precio enviado al cliente: <strong>{euros(e.importe_cliente)}</strong>{e.precio_caduca_en ? <> · válido hasta el {fechaHora(e.precio_caduca_en)}</> : null}. Esperando su respuesta.</div></div>
      )}
      {e.estado_solicitud === 'aceptada' && e.condiciones_aceptadas_en && (
        <div className="pt-aviso info"><div>Pedido por el cliente desde su panel. Aceptó el precio y las condiciones generales el {fechaHora(e.condiciones_aceptadas_en)}.</div></div>
      )}
      {!manual && <AvisoCambiosDynamo e={e} hacer={hacer} onModificar={() => { window.location.assign(`/panel/nuevo-envio?editar=${e.id}`); }} />}
      {/* Propuesta de cambios al TRANSPORTISTA (usuario, 2026-11-10): el cambio ya está
          aplicado; aquí se ve si la aceptó, la rechazó (desasignado automático) o sigue
          pendiente — con el botón de aceptarla en su nombre tras hablar con él. */}
      {ficha.cambioTransportista && (() => {
        const c = ficha.cambioTransportista;
        const rango = c.precio_antes !== c.precio_ahora && c.precio_ahora != null
          ? <> · su precio {euros(c.precio_antes)} → <strong>{euros(c.precio_ahora)}</strong></> : null;
        if (c.estado === 'pendiente') return (
          <div className="pt-aviso info" style={{ marginBottom: '0.8rem' }}><div>
            <strong>Cambios enviados al transportista</strong> ({fechaHora(c.creado_en)}){rango}: pendiente de que los acepte. {c.detalle}
            <div style={{ marginTop: '0.5rem' }}>
              <button className="btn-secondary" disabled={!!trabajando} onClick={() => hacer('Aceptando en su nombre', () => responderCambioEnNombre(c.id, true))}>Aceptar en su nombre (he hablado con él)</button>
            </div>
          </div></div>);
        if (c.estado === 'rechazado' && !ficha.transportista) return (
          <div className="pt-aviso error" style={{ marginBottom: '0.8rem' }}><div>
            <strong>El transportista RECHAZÓ los cambios</strong>{c.motivo_rechazo ? <> («{c.motivo_rechazo}»)</> : null}: el envío quedó <strong>sin transportista</strong> — asigna otro camión.
          </div></div>);
        if (c.estado === 'aceptado') return (
          <div className="pt-aviso info" style={{ marginBottom: '0.8rem' }}><div>
            Cambios <strong>aceptados</strong> {c.en_nombre ? 'en su nombre' : 'por el transportista'}{c.respondido_en ? ` el ${fechaHora(c.respondido_en)}` : ''}{rango}.
          </div></div>);
        return null;
      })()}
      {!manual && <RevisionDynamo envio={e} r={{ ...e, margen_pct: ficha.margenRevision }} hacer={hacer} />}
      {!manual && <PagoPrevio envio={e} pago={ficha.pago} hacer={hacer}
        libre={!e.transportista_id && (e.estado_asignacion ?? 'sin_asignar') === 'sin_asignar' && !e.publicado_en_bolsa_en} />}
      {ficha.contraofertas.length > 1 && (
        <div className="pt-aviso info" style={{ marginBottom: '0.6rem' }}><div><strong>{ficha.contraofertas.length} contraofertas esperando.</strong> El envío sigue abierto: elige la que quieras; al aprobar una (o si otro la acepta al precio ofertado), las demás quedan rechazadas solas.</div></div>
      )}
      {ficha.contraofertas.map((c) => (
        <div key={c.id} className="modal-warn-box">
          {c.alta_online && (
            <div style={{ marginBottom: '0.5rem' }}>
              <strong style={{ color: '#b42318' }}>Transportista NUEVO, dado de alta online desde el enlace</strong> ({c.alta_online.cif}).
              {c.alta_online.verificado ? ' Ya está verificado (activo).' : <> Solo ha dado su bolsa, código, país, CIF y teléfono. Antes de aprobar, <strong>búscalo en la bolsa de cargas</strong>, completa en{' '}
                <a href={`/panel/transportistas?ver=${c.alta_online.id}`} style={{ color: 'var(--purple)', fontWeight: 700 }}>su ficha</a> la razón social y lo que quieras desde allí, y ponlo como <strong>Activo</strong>. Si no está en la bolsa o algo no cuadra, rechaza: el envío vuelve a quedar libre.</>}
            </div>
          )}
          <strong>{c.alta_online ? 'Pide el envío:' : 'Contraoferta pendiente:'}</strong> {c.transportista ?? 'Un transportista'} acepta el envío por <strong>{euros(c.precio_propuesto)}</strong>
          {c.precio_base != null && <> (ofertada a {euros(c.precio_base)}, {c.precio_propuesto > c.precio_base ? '+' : ''}{euros(c.precio_propuesto - c.precio_base)})</>}.
          El envío sigue abierto a otros mientras decides.
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.6rem', flexWrap: 'wrap' }}>
            <button className="btn-primary" onClick={() => hacer('Aprobando', () => resolverContraoferta(c.id, true))}>Aprobar su precio</button>
            <button className="btn-ghost" style={{ color: '#dc2626' }} onClick={() => hacer('Rechazando', () => resolverContraoferta(c.id, false))}>Rechazar</button>
          </div>
        </div>
      ))}
      {e.estado === 'entregado' && ficha.transportista && !manual && <Valoracion ficha={ficha} hacer={hacer} trabajando={trabajando} />}

      {/* Seguimiento EL PRIMERO del acordeón (usuario, 2026-11-10): es lo que más se mira. */}
      {!cancelado && !manual && ficha.etapas.length > 0 && (
        <Secc k="seguimiento" titulo="Seguimiento" abiertas={abiertas} toggle={toggle}
          resumen={<>{ficha.etapas.length} etapas{e.seguimiento_automatico === false ? ' · pausado' : ''}</>}>
          <Etapas etapas={ficha.etapas} pausado={e.seguimiento_automatico === false} />
          <div style={{ marginTop: '0.6rem' }}>
            <button className="btn-secondary" style={{ width: '100%', justifyContent: 'center' }} onClick={() => setVista('estado')}><I d={ICO.fase} />Cambiar estado</button>
          </div>
        </Secc>
      )}

      {/* Documentos PRIMERO de la lista de información y, detrás de Transporte y Ofertas,
          TODOS los datos del envío (solicitud, ruta, mercancía y precio) en UN solo
          desplegable, ordenados y sin repetir lo que ya dice la cabecera (usuario,
          2026-11-10: «unifica en un desplegable; sintetiza, no dupliques»). */}
      <Secc k="documentos" titulo="Documentos" abiertas={abiertas} toggle={toggle} resumen="adjuntos y copias">
        <div className="det-block">
          {/* TODO lo del CMR vive detrás del botón ámbar «eCMR + DeCA» de arriba. SIN
              selector de tipo: se sube y punto (tipo «Otro»); la visibilidad la decide
              la casilla «Lo ve el cliente» de cada fila. */}
          <Documentos dueno={{ campo: 'envio_id', id: e.id }} conVisibleCliente tipos={['otro']} />
        </div>
      </Secc>

      {!manual && (
        <Secc k="transporte" titulo="Transporte" abiertas={abiertas} toggle={toggle}
          resumen={cancelado || e.estado === 'entregado'
            ? (ficha.transportista ? ficha.transportista.nombre : '—')
            : ficha.transportista ? <>Confirmado · {ficha.transportista.nombre}{pt != null ? ` · ${euros(pt)}` : ''}</> : 'Sin transportista todavía'}>
          <div className="det-block">
            <div className="modal-info-grid">
              <Celda l="Estado asignación transportista" span>
                {cancelado || e.estado === 'entregado' ? '—' : ficha.transportista
                  ? <span className="asig-line asig-confirmado" style={{ marginTop: 0 }}><span className="asig-dot" />Confirmado</span>
                  : <span className="asig-line asig-asignandose" style={{ marginTop: 0 }}><span className="asig-dot" />Sin transportista todavía</span>}
              </Celda>
              <Celda l="Día previsto de carga">{e.fecha_carga_prevista ? fecha(e.fecha_carga_prevista) : <Pend />}</Celda>
              <Celda l="Transportista asignado el">{e.asignado_en ? fechaHora(e.asignado_en) : <Pend />}</Celda>
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
              {e.requiere_nima && <div style={{ marginTop: '0.4rem', fontSize: 'var(--fs-m)' }}>NIMA del transportista: <strong>{e.transportista_nima || <Pend />}</strong></div>}
            </div>
            {/* El botón de asignar/cambiar TAMBIÉN dentro de la sección (usuario, 2026-11-10):
                quien mira aquí el estado no tiene que volver arriba a por la acción. */}
            {!manual && !cancelado && e.estado !== 'entregado' && ficha.pago?.estado !== 'pendiente' && (
              <button className={ficha.transportista ? 'btn-secondary' : 'btn-primary'} style={{ marginTop: '0.7rem' }} onClick={() => setVista('asignar')}>
                <I d={ICO.camion} />{ficha.transportista ? 'Cambiar transportista' : 'Asignar transportista'}
              </button>
            )}
          </div>
        </Secc>
      )}

      {ficha.ofertas.length > 0 && (
        <Secc k="ofertas" titulo="Ofertas a transportistas" extra={ficha.ofertas.length} abiertas={abiertas} toggle={toggle}
          resumen={`${ficha.ofertas.filter((o) => o.estado === 'activa').length} activas`}>
          <div className="pen-envio-sum">
            {ficha.ofertas.map((o) => {
              const [et, ec] = ESTADO_OFERTA[o.estado] ?? [o.estado, 'gray'];
              return (
                <div key={o.id} className="pen-sum-row" style={{ alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                  <span className="k">
                    <strong style={{ color: 'var(--navy)' }}>{o.para ?? CANALES[o.canal] ?? o.canal}</strong>{o.para ? ` · ${CANALES[o.canal] ?? o.canal}` : ''}
                    {' · '}{euros(o.precio)}{o.banda_euros ? ` ± ${euros(o.banda_euros)}` : ''}{o.pronto_pago ? ' · pronto pago' : ''}
                    <br />{fechaHora(o.enviada_en)} · {o.aperturas} apertura{o.aperturas === 1 ? '' : 's'}{o.abierta_en ? ` (1.ª ${fechaHora(o.abierta_en)})` : ''}
                  </span>
                  <span className="v" style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                    <span className={`badge badge-${ec}`}>{et}</span>
                    {o.estado === 'activa' && <>
                      <button className="btn-ghost" style={{ minHeight: 30, padding: '0 0.6rem' }} onClick={() => navigator.clipboard?.writeText(enlaceOferta(o.token))}>Copiar enlace</button>
                      <button className="btn-ghost" style={{ minHeight: 30, padding: '0 0.6rem', color: '#dc2626' }} onClick={() => hacer('Retirando la oferta', () => revocarOferta(o.id), 'Oferta retirada: su enlace ya no vale.')}>Retirar</button>
                    </>}
                  </span>
                </div>
              );
            })}
          </div>
        </Secc>
      )}

      <Secc k="envio" titulo="Envío" abiertas={abiertas} toggle={toggle}
        resumen={[rutaCorta, mercResumen,
          manual ? (e.precio_acordado_operador != null ? euros(e.precio_acordado_operador) : null) : pc != null ? euros(pc) : null,
        ].filter(Boolean).join(' · ') || undefined}>
        <SubTit primero>Solicitud</SubTit>
        <div className="det-block"><div className="modal-info-grid">
          <Celda l="Nº de envío">#{e.referencia_gx}</Celda>
          <Celda l="Ref. cliente">{e.referencia_cliente || '—'}</Celda>
          <Celda l="Cliente">{ficha.cliente ? <>{ficha.cliente.nombre} <span style={{ color: 'var(--gray-500)' }}>· {ficha.cliente.cif}</span></> : '—'}</Celda>
          <Celda l="Creado">{fechaHora(e.creado_en)}{ficha.creadoPor ? ` · ${ficha.creadoPor}` : ''}</Celda>
          {manual && <Celda l="Operador de transporte" span><span style={{ color: '#b45309', fontWeight: 700 }}>{ficha.operador ?? '—'}</span> · envío registrado a mano (Dynamo no interviene en el transporte)</Celda>}
          <Celda l={e.fecha_carga_real ? 'Fecha de carga real' : 'Fecha de carga · días de recogida'}>{e.fecha_carga_real ? fecha(e.fecha_carga_real) : ventana(e.fecha_carga_desde, e.fecha_carga_hasta)}</Celda>
          {/* El día que el transportista eligió dentro de la ventana, junto a ella. */}
          {!e.fecha_carga_real && e.fecha_carga_prevista
            ? <Celda l="Fecha de carga asignada"><span style={{ color: 'var(--orange)', fontWeight: 800 }}>{fecha(e.fecha_carga_prevista)}</span></Celda>
            : <Celda l="Entrega estimada">{e.fecha_entrega_estimada ? fecha(e.fecha_entrega_estimada) : <Pend />}</Celda>}
          {!e.fecha_carga_real && e.fecha_carga_prevista && <Celda l="Entrega estimada">{e.fecha_entrega_estimada ? fecha(e.fecha_entrega_estimada) : <Pend />}</Celda>}
          {e.modificado_en && <Celda l="Última modificación">{fechaHora(e.modificado_en)}</Celda>}
          {e.discrecion_comercial && <Celda l="Discreción comercial" span><span style={{ color: 'var(--purple)', fontWeight: 700 }}>Activada</span> — el conductor no revela el destino en la carga ni el origen en la entrega</Celda>}
        </div></div>
        <SubTit>Ruta{ficha.paradas.length > 2 ? ` (${ficha.paradas.length} paradas)` : ''}</SubTit>
        <div className="det-ruta">
          {recogidas.map((p, i) => <Punto key={p.id} p={p} cls="rec" num={i + 1} label={`Recogida ${i + 1}`} />)}
          {entregas.map((p, i) => <Punto key={p.id} p={p} cls="ent" num={i + 1} label={`Entrega ${i + 1}`} />)}
        </div>
        <SubTit>Mercancía</SubTit>
        <div className="det-block"><div className="modal-info-grid">
          <Celda l="Mercancía">{e.descripcion_mercancia || (e.paletizado === false ? 'No paletizada' : 'Paletizada')}</Celda>
          <Celda l="Medidas">{[e.metros_lineales != null && `${metros(e.metros_lineales)}`, e.toneladas != null && `${pesoTn(e.toneladas)}`].filter(Boolean).join(' · ') || '—'}</Celda>
          <Celda l="Tipo de carga">{tipoCargaTxt(e.tipo_carga, e.requiere_plataforma_elevadora) || '—'}</Celda>
          <Celda l="Forma de carga">{[e.carga_lateral && 'Lateral', e.carga_trasera && 'Trasera', e.carga_techo && 'Techo'].filter(Boolean).join(', ') || '—'}</Celda>
          <Celda l="Requisitos" span>{[e.requiere_plataforma_elevadora && 'Plataforma elevadora', e.requiere_nima && 'Requiere NIMA', e.adr && 'Mercancía ADR', e.paletizado === false && 'No paletizada'].filter(Boolean).join(' · ') || 'Ninguno'}</Celda>
          {e.anotaciones_cliente && <Celda l="Anotaciones" span>{e.anotaciones_cliente}</Celda>}
          <DatosCmr envioId={e.id} puedeEditar={e.estado !== 'cancelado'} />
        </div></div>
        <SubTit>Precio</SubTit>
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
              <div className="alm-price-row alm-price-sub"><span className="k">IVA ({porcentaje(e.iva_pct ?? 21)})</span><span className="v">{euros(pc * Number(e.iva_pct ?? 21) / 100)}</span></div>
              <div className="alm-price-row alm-price-sub"><span className="k">Total (IVA incl.)</span><span className="v">{euros(pc * (1 + Number(e.iva_pct ?? 21) / 100))}</span></div>
              <SelloPrecio r={e} />
            </div>
          )}
          {!manual && (
            <div className="pen-envio-sum" style={{ marginTop: '0.6rem' }}>
              <div className="pen-sum-row"><span className="k">P. transportista <span style={{ color: 'var(--red)', fontWeight: 800 }}>· solo admin</span></span><span className="v">{pt != null ? euros(pt) : '—'}</span></div>
              <div className="pen-sum-row"><span className="k">Margen</span><span className="v" style={{ color: e.margen_euros == null ? undefined : Number(e.margen_euros) >= 0 ? '#0f6b3a' : '#dc2626', fontWeight: 800 }}>{e.margen_euros != null ? euros(e.margen_euros) : '—'}</span></div>
              {e.factor_tarifa_pct != null && <div className="pen-sum-row"><span className="k">Factor del cliente aplicado</span><span className="v">{txtNum(e.factor_tarifa_pct)} %</span></div>}
              {e.precio_fijado_a_mano && <div className="pen-sum-row"><span className="k">Precio</span><span className="v">fijado a mano</span></div>}
            </div>
          )}
        </div>
      </Secc>

      {ficha.penalizaciones.length > 0 && (
        <Secc k="penalizaciones" titulo="Penalizaciones" extra={ficha.penalizaciones.length} abiertas={abiertas} toggle={toggle}
          resumen={euros(ficha.penalizaciones.reduce((s, p) => s + Number(p.importe_cliente ?? 0), 0))}>
          <div className="pen-envio-sum">
            {ficha.penalizaciones.map((p) => (
              <div key={p.id} className="pen-sum-row">
                <span className="k">{p.codigo} · {p.tipo}{p.generada_auto ? ' · automática' : ''} · <em>{p.estado === 'pendiente_confirmar' ? 'pendiente de confirmar' : p.estado}</em></span>
                <span className="v">{euros(p.importe_cliente)}</span>
              </div>
            ))}
          </div>
        </Secc>
      )}

      {e.valoracion_cliente != null && (
        <Secc k="valoracion" titulo="Valoración del cliente" abiertas={abiertas} toggle={toggle}
          resumen={`${'★'.repeat(e.valoracion_cliente)} ${e.valoracion_cliente} de 5`}>
          <div className="det-block">
            <span style={{ color: '#f5b301', fontSize: '1.2rem', letterSpacing: 1 }}>{'★'.repeat(e.valoracion_cliente)}</span><span style={{ color: 'var(--gray-200)', fontSize: '1.2rem', letterSpacing: 1 }}>{'★'.repeat(5 - e.valoracion_cliente)}</span>
            <span style={{ fontSize: 'var(--fs-m)', color: 'var(--gray-500)', marginLeft: '0.5rem' }}>{e.valoracion_cliente} de 5{e.valoracion_cliente_en ? ` · ${fechaHora(e.valoracion_cliente_en)}` : ''}</span>
            {e.valoracion_cliente_comentario && <p style={{ margin: '0.4rem 0 0', fontSize: 'var(--fs-m)', color: 'var(--gray-700)' }}>«{e.valoracion_cliente_comentario}»</p>}
          </div>
        </Secc>
      )}


      <Secc k="historial" titulo="Historial" extra={ficha.hitos.length || undefined} abiertas={abiertas} toggle={toggle}
        resumen={ficha.hitos.length ? `último ${fechaHora(ficha.hitos[ficha.hitos.length - 1].cuando)}` : 'Sin movimientos'}>
        <div className="pen-envio-sum">
          {ficha.hitos.length === 0 && <div className="pen-sum-row"><span className="k">Sin movimientos</span><span className="v" /></div>}
          {ficha.hitos.map((h) => (
            <div key={h.id} className="pen-sum-row">
              <span className="k" style={{ whiteSpace: 'nowrap' }}>{fechaHora(h.cuando)}</span>
              <span className="v" style={{ textAlign: 'right' }}>
                {/* La etapa anclada por una firma del CMR no es «a mano»: la firma de la
                    recogida/entrega fija la hora real de esa parada (usuario, 2026-11-10). */}
                {h.hito === 'etapa_corregida' && h.datos?.por === 'firma_cmr'
                  ? `Parada completada: lo fija la firma del CMR (${{ remitente: 'cargador', transportista: 'transportista', destinatario: 'destinatario' }[h.datos.rol ?? ''] ?? 'firmante'})`
                  : HITOS[h.hito] ?? h.hito}
                {h.datos?.motivo_cancelacion && <> — «{h.datos.motivo_cancelacion}»</>}
                {h.hito === 'matricula_asignada' && h.datos?.camion && <> — {h.datos.camion}{h.datos.remolque ? ` + ${h.datos.remolque}` : ''}</>}
                <span style={{ color: 'var(--gray-500)', fontWeight: 500 }}>{h.quien ? ` · ${h.quien}` : ORIGEN[h.origen ?? ''] ? ` · ${ORIGEN[h.origen ?? '']}` : ''}</span>
              </span>
            </div>
          ))}
        </div>
        <Historial tabla="envios" id={e.id} />
      </Secc>
      {/* HOJA del eCMR + DeCA pegada al pie (usuario, 2026-11-10): mismas piezas que el
          menú «Más» (velo + hoja en portal sobre body), con todo lo del CMR dentro. */}
      {cmrAbierto && createPortal(<>
        <div className="ficha-mas-backdrop" onClick={() => setCmrAbierto(false)} />
        <div className="ficha-mas-menu fm-hoja-cmr" role="dialog" aria-label="eCMR + DeCA">
          <div className="fm-asa" aria-hidden="true" />
          <div className="fm-cab">
            <span>eCMR + DeCA · {firmasHechas}/{firmasTotal} firmas{firmasHechas >= firmasTotal ? ' ✓' : ''}</span>
            <button type="button" className="fm-x" aria-label="Cerrar" onClick={() => setCmrAbierto(false)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M18 6 6 18" /><path d="M6 6l12 12" /></svg>
            </button>
          </div>
          <div style={{ padding: '0 0.35rem 0.35rem' }}>
            {cancelado
              ? <div className="pt-aviso info"><div>El envío está cancelado: no lleva CMR.</div></div>
              : <CmrDigital ficha={ficha} hacer={hacer} trabajando={trabajando} />}
          </div>
        </div>
      </>, document.body)}
      {trabajando && <Cargando texto={trabajando} />}
    </Modal>
  );
}
