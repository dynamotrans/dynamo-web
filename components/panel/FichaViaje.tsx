'use client';

// Ficha del viaje para el TRANSPORTISTA (etapa C), con lo de mis_viajes(): su precio, la
// ruta con el horario y el teléfono de cada muelle, y la mercancía. Nunca el cliente de
// Dynamo ni lo que paga. Desde aquí marca cómo va el viaje, sube el albarán y fotos, y
// abre el CMR digital para que firmen en el muelle.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { avisarNavegando } from './CargandoNavegacion';
import { useRefrescar } from '@/lib/useRefrescar';
import Modal from './Modal';
import Documentos from './Documentos';
import Cargando from '@/components/Cargando';
import { euros, fecha, ventana, pesoTn, fechaHora, metros } from '@/lib/formato';

import { paisDe, telBonito } from '@/lib/paises';
import { marcarViaje, enlaceCmrPropio, responderCambioTransportista } from '@/app/panel/(app)/envios/acciones-transportista';
import AvisoSiniestro from '@/components/AvisoSiniestro';
import { ESTADOS_ENVIO, FASES_ENVIO, enMarcha, ordinal, type Etapa } from '@/lib/estados';
import Etapas, { nombreEtapa } from './ficha/Etapas';
import type { EnvioFila } from '@/lib/envios';
import type { Funcion } from '@/lib/supabase/tipos';
import { Secc } from './ficha/comun';

const FASES: [string, string, string][] = [
  ['hacia_la_carga', 'Voy hacia la carga', 'Yendo a la carga'], ['cargando', 'Estoy cargando', 'Cargando'],
  ['en_ruta', 'Cargado: salgo en ruta', 'En ruta'], ['entregado', 'Entregado', 'Entregado'],
];
const ORDEN: string[] = FASES_ENVIO;
const NOMBRE: Record<string, string> = Object.fromEntries(Object.entries(ESTADOS_ENVIO).map(([k, v]) => [k, v.label]));
const COLOR: Record<string, string> = Object.fromEntries(Object.entries(ESTADOS_ENVIO).map(([k, v]) => [k, v.color]));
const I = ({ d }: { d: string[] }) => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: '0.35rem' }}>
    {d.map((x, i) => <path key={i} d={x} />)}
  </svg>
);
const ICO = {
  camion: ['M1 4.5A1.5 1.5 0 0 1 2.5 3h12A1.5 1.5 0 0 1 16 4.5V16H1z', 'M16 8h4l3 3v5h-7z', 'M5.5 21a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z', 'M18.5 21a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z'],
  firma: ['M12 20h9', 'M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z'],
  fase: ['M5 12h14', 'M13 5l7 7-7 7'],
  aviso: ['M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z', 'M12 9v4', 'M12 17h.01'],
  doc: ['M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z', 'M14 2v6h6', 'M16 13H8', 'M16 17H8'],
};
// El viaje del transportista: la fila de la lista o la de mis_viajes_por_ids() (paradas en JSON).
type MiViaje = Funcion<'mis_viajes_por_ids'>[number];
export type ParadaViaje = {
  id?: string; tipo: string; realizado_en?: string | null; nombre_empresa: string | null; url_google_maps?: string | null;
  direccion: string | null; codigo_postal: string | null; poblacion: string | null; provincia: string | null; pais_codigo_iso: string | null;
  horarios?: string | null; contacto_telefono?: string | null; contacto_nombre?: string | null; requiere_cita?: boolean | null;
  tiene_medios_carga?: boolean | null; referencia?: string | null; notas_sitio?: string | null; anotaciones?: string | null;
};
export type Viaje = Omit<EnvioFila, 'paradas'> & Partial<Omit<MiViaje, keyof EnvioFila>> & { paradas: ParadaViaje[] };
export type CambioViaje = { id: string; precio_antes: number | null; precio_ahora: number | null; detalle: string; creado_en: string };
function Celda({ l, children, span }: { l: string; children: React.ReactNode; span?: boolean }) {
  return <div style={span ? { gridColumn: '1/-1' } : undefined}><label>{l}</label><span className="v">{children ?? '—'}</span></div>;
}

export default function FichaViaje({ e, etapas = [], cerrarHref, cambio = null }: { e: Viaje; etapas?: Etapa[]; cerrarHref: string; cambio?: CambioViaje | null }) {
  const router = useRouter();
  const refrescar = useRefrescar();
  const [trabajando, setTrabajando] = useState<string | null>(null);
  const [rechazando, setRechazando] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [aviso, setAviso] = useState<{ ok: boolean; txt: string } | null>(null);
  // CERRAR AL INSTANTE (usuario, 2026-11-10: «cerrar es muy lento»): la ventana se oculta
  // ya y el cargador fino cubre la vuelta a la lista mientras llega la página.
  const [cerrando, setCerrando] = useState(false);
  const cerrar = () => { setCerrando(true); avisarNavegando(); router.push(cerrarHref, { scroll: false }); };
  const paradas = e.paradas ?? [];
  const idx = ORDEN.indexOf(e.estado);
  // Siguiente paso, parada a parada si hay etapas (seguimiento): «He llegado: cargo en la 1.ª parada»,
  // «Salgo hacia la 2.ª parada»… Si no, el de siempre.
  const act = etapas.find((x) => x.actual);
  const prox = act ? etapas.find((x) => x.paso === act.paso + 1) : undefined;
  const textoProx = (x: Etapa) => x.estado === 'hacia_la_carga' ? 'Voy hacia la carga'
    : x.estado === 'cargando' ? `He llegado: ${x.tipo_parada === 'descarga' ? 'descargo' : 'cargo'} en la ${ordinal(x.parada)} parada`
    : x.estado === 'en_ruta' ? `Salgo hacia la ${ordinal(x.parada)} parada` : 'Entregado';
  const siguiente: [string, string, string] | null | undefined = prox ? [prox.estado, textoProx(prox), nombreEtapa(prox)]
    : idx >= 0 && idx < ORDEN.length - 1 ? FASES.find(([k]) => k === ORDEN[idx + 1]) : null;
  const nombreActual = act ? nombreEtapa(act) : NOMBRE[e.estado] ?? e.estado;
  const activo = idx >= 0 && e.estado !== 'entregado';
  // SIEMPRE todo plegado al abrir (usuario, 2026-11-10), como las otras fichas.
  const [abiertas, setAbiertas] = useState<Set<string>>(() => new Set());
  const toggle = (k: string) => setAbiertas((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  // Aceptar o rechazar los cambios que Dynamo ha hecho en este viaje. El rechazo libera
  // el viaje (Dynamo asigna otro camión) y esta ficha deja de ser suya.
  async function responderCambio(acepta: boolean) {
    if (!cambio) return;
    setTrabajando(acepta ? 'Aceptando los cambios' : 'Rechazando los cambios'); setAviso(null);
    const r = await responderCambioTransportista(cambio.id, acepta, acepta ? undefined : motivo.trim() || undefined);
    setTrabajando(null);
    setAviso({ ok: r.ok, txt: r.ok ? r.aviso ?? 'Hecho.' : r.error });
    if (r.ok) { setRechazando(false); if (acepta) refrescar(); else { avisarNavegando(); router.push(cerrarHref, { scroll: false }); refrescar(); } }
  }

  async function avanzar(estado: string) {
    setTrabajando('Guardando'); setAviso(null);
    const r = await marcarViaje(e.id, estado);
    setTrabajando(null);
    setAviso({ ok: r.ok, txt: r.ok ? r.aviso ?? 'Hecho.' : r.error });
    if (r.ok) refrescar();
  }
  async function abrirCmr() {
    // La ventana se abre YA (si no, el navegador del móvil la bloquea) y luego se le da la dirección.
    const w = window.open('about:blank', '_blank');
    setTrabajando('Abriendo el CMR');
    const r = await enlaceCmrPropio(e.id);
    setTrabajando(null);
    if (!r.ok) { w?.close(); setAviso({ ok: false, txt: r.error }); return; }
    const url = `/cmr/${r.token}`;
    if (w) w.location.href = url; else window.location.href = url;
  }

  const acciones = (
    <>
      {activo && siguiente && <button className="btn-primary" disabled={!!trabajando} onClick={() => avanzar(siguiente[0])}><I d={ICO.fase} />{siguiente[1]}</button>}
      {e.estado !== 'cancelado' && <button className="btn-secondary" disabled={!!trabajando} onClick={abrirCmr}><I d={ICO.firma} />CMR digital para firmar</button>}
      {e.estado !== 'cancelado' && <a className="btn-secondary" href={`/panel/envios/${e.id}/orden-de-carga`} target="_blank" rel="noopener"><I d={ICO.doc} />Orden de carga (PDF)</a>}
      <a className="btn-secondary" href={`/panel/incidencias?nueva=${e.id}`}><I d={ICO.aviso} />Reportar incidencia</a>
    </>
  );

  if (cerrando) return null;
  return (
    <Modal abierto envivo ancho={760} onCerrar={cerrar} titulo={`Viaje #${e.referencia_gx}`}
      sub={<span className={`badge badge-${COLOR[e.estado] ?? 'prog'}`}>{nombreActual}</span>} icono={<I d={ICO.camion} />} acciones={acciones}
      pie={<button className="btn-ghost" onClick={cerrar}>Cerrar</button>}>
      {trabajando && <Cargando texto={trabajando} />}
      {aviso && <div className={`pt-aviso ${aviso.ok ? 'info' : 'error'}`} role="status" style={{ marginBottom: '0.8rem' }}><div>{aviso.txt}</div></div>}
      {enMarcha(e.estado) && <AvisoSiniestro incidenciaHref={`/panel/incidencias?nueva=${e.id}&tipo=siniestro`} />}
      {e.discrecion_comercial && (
        <div className="modal-warn-box"><strong>Discreción comercial:</strong> en la carga no digas a dónde va la mercancía, ni en la entrega de dónde viene.</div>
      )}
      {/* CAMBIOS DE DYNAMO PENDIENTES (usuario, 2026-11-10): el viaje ya va con los datos
          nuevos; aquí los aceptas o los rechazas. Rechazar libera el viaje. */}
      {cambio && (
        <div className="modal-warn-box" style={{ marginBottom: '0.8rem' }}>
          <strong>Dynamo ha cambiado este viaje</strong> ({fechaHora(cambio.creado_en)}).
          {cambio.precio_antes !== cambio.precio_ahora && cambio.precio_ahora != null && (
            <div style={{ marginTop: '0.3rem' }}>Tu precio: {cambio.precio_antes != null ? euros(cambio.precio_antes) : '—'} → <strong>{euros(cambio.precio_ahora)}</strong> (base sin IVA).</div>
          )}
          <div style={{ marginTop: '0.3rem' }}>{cambio.detalle}</div>
          {!rechazando ? (
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.6rem', flexWrap: 'wrap' }}>
              <button className="btn-primary" disabled={!!trabajando} onClick={() => responderCambio(true)}>Acepto los cambios</button>
              <button className="btn-ghost" disabled={!!trabajando} onClick={() => setRechazando(true)}>No los acepto…</button>
            </div>
          ) : (
            <div style={{ marginTop: '0.6rem' }}>
              <label htmlFor="rc-motivo" style={{ display: 'block', fontWeight: 700 }}>¿Por qué no? <span style={{ color: 'var(--gray-500)', fontWeight: 600 }}>· opcional</span></label>
              <textarea id="rc-motivo" rows={2} maxLength={500} value={motivo} onChange={(ev) => setMotivo(ev.target.value)} placeholder="Ej. con ese precio no me sale" />
              <div className="pt-aviso" style={{ margin: '0.5rem 0' }}><div>Al rechazar, <strong>el viaje queda liberado</strong> (deja de ser tuyo) y Dynamo buscará otro camión.</div></div>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <button className="btn-primary" style={{ background: 'var(--red)' }} disabled={!!trabajando} onClick={() => responderCambio(false)}>Rechazar y liberar el viaje</button>
                <button className="btn-ghost" disabled={!!trabajando} onClick={() => setRechazando(false)}>Volver</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Seguimiento EL PRIMERO del acordeón (usuario, 2026-11-10): es lo que más se mira. */}
      {etapas.length > 0 && e.estado !== 'cancelado' && (
        <Secc k="seguimiento" titulo="Seguimiento" abiertas={abiertas} toggle={toggle} resumen="el horario previsto, parada a parada">
          <Etapas etapas={etapas} paradas={paradas} />
        </Secc>
      )}

      <Secc k="viaje" titulo="Viaje" abiertas={abiertas} toggle={toggle}
        resumen={<>{e.fecha_carga_prevista ? fecha(e.fecha_carga_prevista) : e.fecha_carga_real ? fecha(e.fecha_carga_real) : ventana(e.fecha_carga_desde, e.fecha_carga_hasta)}{e.importe_transportista != null ? <> · <strong>{euros(e.importe_transportista)}</strong></> : null}</>}>
      <div className="det-block"><div className="modal-info-grid">
        <Celda l="Nº de viaje">#{e.referencia_gx}</Celda>
        <Celda l="Estado">{nombreActual}</Celda>
        {e.fecha_carga_prevista && <Celda l="Día en que cargas">{fecha(e.fecha_carga_prevista)}</Celda>}
        <Celda l={e.fecha_carga_real ? 'Fecha de carga' : 'Días de recogida'}>{e.fecha_carga_real ? fecha(e.fecha_carga_real) : ventana(e.fecha_carga_desde, e.fecha_carga_hasta)}</Celda>
        <Celda l="Entrega estimada">{e.fecha_entrega_estimada ? fecha(e.fecha_entrega_estimada) : '—'}</Celda>
        <Celda l="Camión">{[e.matricula_camion, e.matricula_remolque].filter(Boolean).join(' · ') || '—'}</Celda>
        <Celda l="Conductor">{e.conductor_nombre ? <>{e.conductor_nombre}{e.conductor_telefono ? ` · ${telBonito(e.conductor_telefono)}` : ''}</> : '—'}</Celda>
        <Celda l="Tu precio (base sin IVA)" span><strong>{e.importe_transportista != null ? euros(e.importe_transportista) : '—'}</strong></Celda>
      </div></div>
      </Secc>

      {activo && (
        <div className="pt-aviso info" style={{ marginTop: '0.6rem' }}><div>
          Avísanos de cómo va el viaje con el botón de arriba. Si no nos avisas, el estado avanza solo con el horario previsto (abajo); lo que marques manda y desde ahí sigue.
        </div></div>
      )}

      <Secc k="ruta" titulo="Ruta" extra={paradas.length} abiertas={abiertas} toggle={toggle}
        resumen={`${paradas.find((p) => p.tipo === 'carga')?.poblacion ?? ''} → ${[...paradas].reverse().find((p) => p.tipo === 'descarga')?.poblacion ?? ''}`}>
      <div className="det-ruta">
        {paradas.map((p) => {
          const rec = p.tipo === 'carga';
          // Nº de PARADA del recorrido, continuo (2026-11-11); la tipología va aparte.
          const n = paradas.indexOf(p) + 1;
          return (
            <div key={p.id} className="det-punto">
              <div className="det-punto-head">
                <span className={`ptar-route-num ${rec ? 'rec' : 'ent'}`}>{n}</span>
                <span className="det-punto-label">{rec ? `Recogida ${n}` : `Entrega ${n}`}</span>
                {p.realizado_en && <span className="det-punto-tipo">Hecha: {fechaHora(p.realizado_en)}</span>}
              </div>
              <div className="det-punto-body">
                {p.nombre_empresa && <strong>{p.url_google_maps ? <a href={p.url_google_maps} target="_blank" rel="noopener" style={{ color: 'var(--purple)' }}>{p.nombre_empresa}</a> : p.nombre_empresa}</strong>}
                {p.nombre_empresa && <br />}
                {[p.direccion, [p.codigo_postal, p.poblacion].filter(Boolean).join(' '), p.provincia && p.provincia !== p.poblacion ? p.provincia : '', paisDe(p.pais_codigo_iso ?? 'ES')].filter(Boolean).join(', ')}
                {(p.horarios || p.contacto_telefono) && (
                  <div style={{ fontSize: 'var(--fs-m)', color: 'var(--gray-500)', marginTop: 2 }}>
                    {p.horarios && <>Horario: {p.horarios}</>}
                    {p.horarios && p.contacto_telefono && ' · '}
                    {p.contacto_telefono && <>Tfno: <a href={`tel:${p.contacto_telefono}`} style={{ color: 'var(--purple)', fontWeight: 600 }}>{telBonito(p.contacto_telefono)}</a>{p.contacto_nombre ? ` (${p.contacto_nombre})` : ''}</>}
                  </div>
                )}
                {(p.requiere_cita || p.tiene_medios_carga === false) && (
                  <div style={{ fontSize: 'var(--fs-m)', color: '#b45309', fontWeight: 600, marginTop: 2 }}>{[p.requiere_cita && 'Con cita previa', p.tiene_medios_carga === false && 'Sin medios de carga'].filter(Boolean).join(' · ')}</div>
                )}
                {p.referencia && <div style={{ fontSize: 'var(--fs-m)', marginTop: 2 }}>Referencia: <strong>{p.referencia}</strong></div>}
                {[p.notas_sitio, p.anotaciones].filter((t): t is string => Boolean(t)).map((t, i) => (
                  <div key={i} style={{ fontSize: 'var(--fs-m)', color: '#b45309', background: '#fef3c7', borderRadius: 8, padding: '0.35rem 0.5rem', marginTop: 4 }}>⚠ {t}</div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      </Secc>

      <Secc k="mercancia" titulo="Mercancía" abiertas={abiertas} toggle={toggle}
        resumen={[e.metros_lineales != null && metros(e.metros_lineales), e.toneladas != null && pesoTn(e.toneladas), e.descripcion_mercancia].filter(Boolean).join(' · ')}>
      <div className="det-block"><div className="modal-info-grid">
        <Celda l="Mercancía">{e.descripcion_mercancia || (e.paletizado === false ? 'No paletizada' : 'Paletizada')}</Celda>
        <Celda l="Medidas">{[e.metros_lineales != null && `${metros(e.metros_lineales)}`, e.toneladas != null && `${pesoTn(e.toneladas)}`].filter(Boolean).join(' · ') || '—'}</Celda>
        <Celda l="Forma de carga">{[e.carga_lateral && 'Lateral', e.carga_trasera && 'Trasera', e.carga_techo && 'Techo'].filter(Boolean).join(', ') || '—'}</Celda>
        <Celda l="Requisitos">{[e.requiere_plataforma_elevadora && 'Plataforma elevadora', e.requiere_nima && 'NIMA', e.adr && 'Mercancía ADR'].filter(Boolean).join(' · ') || 'Ninguno'}</Celda>
      </div></div>
      </Secc>

      <Secc k="documentos" titulo="Documentos" abiertas={abiertas} toggle={toggle} resumen="sube aquí el albarán firmado">
      <div className="det-block">
        {/* SIN selector de tipo (usuario, 2026-11-10): lo que sube el transportista aquí es
            el albarán firmado (o su foto) — se registra como albarán, que es lo que miran
            el pago y el export «ALB REC?». */}
        <Documentos dueno={{ campo: 'envio_id', id: e.id }} tipos={['albaran']} editable={e.estado !== 'cancelado'} sinQuitar
          ayuda={<>Sube aquí el <strong>albarán firmado</strong> (o una foto clara) al entregar: sin él no se puede pagar el viaje. Si algo llega dañado, haz fotos <strong>antes de descargar</strong> y llámanos.</>} />
      </div>
      </Secc>
    </Modal>
  );
}
