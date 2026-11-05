'use client';

// Ficha del viaje para el TRANSPORTISTA (etapa C), con lo de mis_viajes(): su precio, la
// ruta con el horario y el teléfono de cada muelle, y la mercancía. Nunca el cliente de
// Dynamo ni lo que paga. Desde aquí marca cómo va el viaje, sube el albarán y fotos, y
// abre el CMR digital para que firmen en el muelle.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useRefrescar } from '@/lib/useRefrescar';
import Modal from './Modal';
import Documentos from './Documentos';
import Cargando from '@/components/Cargando';
import { euros, fecha, ventana, pesoTn, fechaHora, metros } from '@/lib/formato';

import { paisDe, telBonito } from '@/lib/paises';
import { marcarViaje, enlaceCmrPropio } from '@/app/panel/(app)/envios/acciones-transportista';
import AvisoSiniestro from '@/components/AvisoSiniestro';

const FASES: [string, string, string][] = [
  ['hacia_la_carga', 'Voy hacia la carga', 'Hacia la carga'], ['cargando', 'Estoy cargando', 'Cargando'],
  ['en_ruta', 'Cargado: salgo en ruta', 'En ruta'], ['entregado', 'Entregado', 'Entregado'],
];
const ORDEN = ['programado', 'hacia_la_carga', 'cargando', 'en_ruta', 'entregado'];
const NOMBRE: Record<string, string> = { programado: 'Programado', hacia_la_carga: 'Hacia la carga', cargando: 'Cargando', en_ruta: 'En ruta', entregado: 'Entregado', cancelado: 'Cancelado' };
const COLOR: Record<string, string> = { programado: 'prog', hacia_la_carga: 'hacia', cargando: 'cargando', en_ruta: 'enruta', entregado: 'entregado', cancelado: 'cancelada' };
const txtNum = (n: number | null | undefined) => (n == null ? '' : String(n).replace('.', ','));
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
function Celda({ l, children, span }: { l: string; children: React.ReactNode; span?: boolean }) {
  return <div style={span ? { gridColumn: '1/-1' } : undefined}><label>{l}</label><span className="v">{children ?? '—'}</span></div>;
}

export default function FichaViaje({ e, cerrarHref }: { e: any; cerrarHref: string }) {
  const router = useRouter();
  const refrescar = useRefrescar();
  const [trabajando, setTrabajando] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ ok: boolean; txt: string } | null>(null);
  const cerrar = () => router.push(cerrarHref, { scroll: false });
  const paradas: any[] = e.paradas ?? [];
  const idx = ORDEN.indexOf(e.estado);
  const siguiente = idx >= 0 && idx < ORDEN.length - 1 ? FASES.find(([k]) => k === ORDEN[idx + 1]) : null;
  const activo = idx >= 0 && e.estado !== 'entregado';

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

  return (
    <Modal abierto ancho={760} onCerrar={cerrar} titulo={`Viaje #${e.referencia_gx}`}
      sub={<span className={`badge badge-${COLOR[e.estado] ?? 'prog'}`}>{NOMBRE[e.estado] ?? e.estado}</span>} icono={<I d={ICO.camion} />} acciones={acciones}
      pie={<button className="btn-ghost" onClick={cerrar}>Cerrar</button>}>
      {trabajando && <Cargando texto={trabajando} />}
      {aviso && <div className={`pt-aviso ${aviso.ok ? 'info' : 'error'}`} role="status" style={{ marginBottom: '0.8rem' }}><div>{aviso.txt}</div></div>}
      {['hacia_la_carga', 'cargando', 'en_ruta'].includes(e.estado) && <AvisoSiniestro incidenciaHref={`/panel/incidencias?nueva=${e.id}&tipo=siniestro`} />}
      {e.discrecion_comercial && (
        <div className="modal-warn-box"><strong>Discreción comercial:</strong> en la carga no digas a dónde va la mercancía, ni en la entrega de dónde viene.</div>
      )}

      <h4 className="modal-section-title">Viaje</h4>
      <div className="det-block"><div className="modal-info-grid">
        <Celda l="Nº de viaje">#{e.referencia_gx}</Celda>
        <Celda l="Estado">{NOMBRE[e.estado] ?? e.estado}</Celda>
        <Celda l={e.fecha_carga_real ? 'Fecha de carga' : 'Días de recogida'}>{e.fecha_carga_real ? fecha(e.fecha_carga_real) : ventana(e.fecha_carga_desde, e.fecha_carga_hasta)}</Celda>
        <Celda l="Entrega estimada">{e.fecha_entrega_estimada ? fecha(e.fecha_entrega_estimada) : '—'}</Celda>
        <Celda l="Camión">{[e.matricula_camion, e.matricula_remolque].filter(Boolean).join(' · ') || '—'}</Celda>
        <Celda l="Conductor">{e.conductor_nombre ? <>{e.conductor_nombre}{e.conductor_telefono ? ` · ${telBonito(e.conductor_telefono)}` : ''}</> : '—'}</Celda>
        <Celda l="Tu precio (base sin IVA)" span><strong>{e.importe_transportista != null ? euros(e.importe_transportista) : '—'}</strong></Celda>
      </div></div>

      {activo && (
        <div className="pt-aviso info" style={{ marginTop: '0.6rem' }}><div>
          Avísanos de cómo va el viaje con el botón de arriba: <strong>{FASES.map(([k, , t]) => t).join(' → ')}</strong>. Cada paso queda con su hora.
        </div></div>
      )}

      <h4 className="modal-section-title">Ruta</h4>
      <div className="det-ruta">
        {paradas.map((p) => {
          const rec = p.tipo === 'carga';
          const n = paradas.filter((x) => x.tipo === p.tipo).indexOf(p) + 1;
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
                {[p.notas_sitio, p.anotaciones].filter(Boolean).map((t: string, i: number) => (
                  <div key={i} style={{ fontSize: 'var(--fs-m)', color: '#b45309', background: '#fef3c7', borderRadius: 8, padding: '0.35rem 0.5rem', marginTop: 4 }}>⚠ {t}</div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <h4 className="modal-section-title">Mercancía</h4>
      <div className="det-block"><div className="modal-info-grid">
        <Celda l="Mercancía">{e.descripcion_mercancia || (e.paletizado === false ? 'No paletizada' : 'Paletizada')}</Celda>
        <Celda l="Medidas">{[e.metros_lineales != null && `${metros(e.metros_lineales)}`, e.toneladas != null && `${pesoTn(e.toneladas)}`].filter(Boolean).join(' · ') || '—'}</Celda>
        <Celda l="Forma de carga">{[e.carga_lateral && 'Lateral', e.carga_trasera && 'Trasera', e.carga_techo && 'Techo'].filter(Boolean).join(', ') || '—'}</Celda>
        <Celda l="Requisitos">{[e.requiere_plataforma_elevadora && 'Plataforma elevadora', e.requiere_nima && 'NIMA', e.adr && 'Mercancía ADR'].filter(Boolean).join(' · ') || 'Ninguno'}</Celda>
      </div></div>

      <h4 className="modal-section-title">Documentos</h4>
      <div className="det-block">
        <Documentos dueno={{ campo: 'envio_id', id: e.id }} tipos={['albaran', 'cmr_firmado', 'foto_incidencia', 'gps_tacografo', 'adjunto']} editable={e.estado !== 'cancelado'} sinQuitar
          ayuda={<>Sube aquí el <strong>albarán firmado</strong> (o una foto clara) al entregar: sin él no se puede pagar el viaje. Si algo llega dañado, haz fotos <strong>antes de descargar</strong> y llámanos.</>} />
      </div>
    </Modal>
  );
}
