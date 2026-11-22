'use client';

// MAPA DEL ENVÍO (usuario, 2026-11-22): ventana con la ruta (paradas numeradas, en línea recta
// hasta tener las rutas de Google Maps), el camión en su POSICIÓN ESTIMADA (plan del
// seguimiento + tacógrafo + firmas del CMR, ver lib/mapaEnvio.ts), su estado y la leyenda.
// Se abre con el botón «Mapa» de la ficha del envío y de cada fila de la lista. Se actualiza
// sola cada minuto mientras está abierta. Mapa libre (Leaflet + OpenStreetMap), sin clave.
import 'leaflet/dist/leaflet.css';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Map as MapaL } from 'leaflet';
import Modal from './Modal';
import { mapaDelEnvio } from '@/app/panel/(app)/envios/acciones-mapa';
import { estadoMapa, posicionCamion, type MapaEnvio } from '@/lib/mapaEnvio';
import { fechaHora } from '@/lib/formato';

export const TESELAS = process.env.NEXT_PUBLIC_MAPA_TESELAS || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
export const ATRIBUCION = process.env.NEXT_PUBLIC_MAPA_ATRIBUCION || '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';
export const COLOR = { carga: '#e07b00', descarga: '#3300cc', hecho: '#16a34a', ruta: '#3300cc', pendiente: '#9ca3af' };
export const TONO: Record<string, string> = { gris: '#6b7280', azul: '#2563eb', ambar: '#d97706', verde: '#16a34a', rojo: '#dc2626' };

// El mapa en su propia capa (isolation): los paneles de Leaflet llevan z-index altos y, sin
// esto, quedaban POR ENCIMA del menú desplegable de la cabecera (usuario, 2026-11-22).
export const CAJA_MAPA: React.CSSProperties = { position: 'relative', isolation: 'isolate', zIndex: 0 };

/** «Encuadrar»: vuelve a enseñar todo lo pintado, justo (sin que falte ni sobre). */
export function BotonEncuadrar({ onClick, que }: { onClick: () => void; que: string }) {
  return (
    <button type="button" onClick={onClick} aria-label={`Encuadrar ${que}`} title={`Encuadrar ${que}`} data-encuadrar=""
      style={{ position: 'absolute', top: 10, right: 10, zIndex: 1000, display: 'inline-flex', alignItems: 'center', gap: 6,
        background: '#fff', border: '2px solid rgba(0,0,0,.2)', borderRadius: 8, padding: '5px 10px', font: '700 13px system-ui',
        color: 'var(--navy)', cursor: 'pointer', boxShadow: '0 1px 4px rgba(0,0,0,.2)' }}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
      </svg>
      Encuadrar
    </button>
  );
}

export const IcoMapa = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2z" /><path d="M9 4v14M15 6v14" />
  </svg>
);

/** Botón «Mapa» que abre la ventana. `compacto`: solo el icono (filas de la lista). */
export function BotonMapa({ envioId, referencia, compacto, className }: { envioId: string; referencia?: string | null; compacto?: boolean; className?: string }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <button type="button" className={className ?? (compacto ? 'btn-icono' : 'btn-secondary')} data-boton-mapa=""
        aria-label={`Ver en el mapa${referencia ? ` el envío #${referencia}` : ''}`} title="Ver en el mapa"
        onClick={(e) => { e.stopPropagation(); e.preventDefault(); setAbierto(true); }}
        style={compacto ? { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 8, border: '1px solid var(--gray-300)', background: '#fff', color: 'var(--purple)', cursor: 'pointer' } : undefined}>
        <IcoMapa />{!compacto && <span style={{ marginLeft: 6 }}>Mapa</span>}
      </button>
      {/* A la ventana se la saca al final de la página y no deja pasar los clics ni las teclas:
          dentro de una fila de la lista abrirían la ficha, y Escape cerraría también la ficha
          que haya debajo. Escape cierra SOLO el mapa (por eso se le da el foco al abrirse). */}
      {abierto && createPortal(
        <div ref={(el) => { if (el && !el.contains(document.activeElement)) el.focus({ preventScroll: true }); }} tabIndex={-1} style={{ outline: 'none' }}
          onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}
          onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Escape') setAbierto(false); }}>
          <VentanaMapa envioId={envioId} referencia={referencia} onCerrar={() => setAbierto(false)} />
        </div>, document.body)}
    </>
  );
}

export function VentanaMapa({ envioId, referencia, onCerrar }: { envioId: string; referencia?: string | null; onCerrar: () => void }) {
  const [mapa, setMapa] = useState<MapaEnvio | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cargar = useCallback(async () => {
    const r = await mapaDelEnvio(envioId).catch(() => ({ ok: false as const, error: 'No se ha podido cargar el mapa.' }));
    if (r.ok) { setMapa(r.mapa); setError(null); } else setError(r.error);
  }, [envioId]);
  useEffect(() => { void cargar(); const t = setInterval(() => void cargar(), 60_000); return () => clearInterval(t); }, [cargar]);
  const ref = mapa?.referencia ?? referencia;
  const pc = mapa ? posicionCamion(mapa) : null;
  return (
    <Modal abierto envivo ancho={920} onCerrar={onCerrar} icono={<IcoMapa />}
      titulo={`Mapa del envío${ref ? ` #${ref}` : ''}`}
      sub={mapa ? <span data-mapa-estado="" style={{ color: pc ? TONO[pc.tono] : undefined, fontWeight: 700 }}>{estadoMapa(mapa)}</span> : error ?? 'Cargando el mapa…'}>
      {mapa && <>
        <Lienzo mapa={mapa} />
        <Leyenda />
        <ol className="mapa-paradas" style={{ margin: '0.6rem 0 0', paddingLeft: '1.2rem', fontSize: '0.85rem' }}>
          {mapa.paradas.map((p) => {
            const h = mapa.etapas.find((x) => x.estado === 'cargando' && x.parada === p.orden);
            return (
              <li key={p.orden} style={{ marginBottom: '0.2rem' }}>
                <strong>{p.tipo === 'carga' ? 'Recogida' : 'Entrega'}</strong> · {[p.empresa, p.poblacion].filter(Boolean).join(' · ')}
                {p.realizado_en ? <span style={{ color: COLOR.hecho }}> · ✓ {p.tipo === 'carga' ? 'cargado' : 'descargado'} {fechaHora(p.realizado_en)}</span>
                  : h?.hora ? <span style={{ color: 'var(--gray-500)' }}> · prevista {fechaHora(h.hora)}</span> : null}
                {p.coord === 'codigo_postal' && <span style={{ color: 'var(--gray-500)' }}> · (situada por su código postal)</span>}
                {p.coord === 'sin' && <span style={{ color: '#b45309' }}> · (sin coordenadas: no sale en el mapa)</span>}
              </li>
            );
          })}
        </ol>
        <p style={{ fontSize: '0.75rem', color: 'var(--gray-500)', margin: '0.6rem 0 0' }}>
          Posición <strong>estimada</strong>, no GPS: sale del horario previsto de cada parada, la velocidad media y las pausas obligatorias del
          conductor, corregida con las firmas del CMR (hora exacta y, si se dio permiso, su ubicación). La ruta se dibuja en línea recta
          entre paradas. Se actualiza sola cada minuto.
        </p>
      </>}
    </Modal>
  );
}

function Leyenda() {
  const punto = (c: string, t: string) => <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginRight: 14 }}><span style={{ width: 12, height: 12, borderRadius: 6, background: c, display: 'inline-block' }} />{t}</span>;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', fontSize: '0.78rem', color: 'var(--gray-700)', marginTop: '0.5rem' }} aria-label="Leyenda del mapa">
      {punto(COLOR.carga, 'Recogida')}{punto(COLOR.descarga, 'Entrega')}{punto(COLOR.hecho, 'Parada hecha')}
      <span style={{ marginRight: 14 }}>🚚 Camión (posición estimada)</span>
      <span style={{ marginRight: 14 }}><span style={{ borderTop: `3px solid ${COLOR.ruta}`, width: 18, display: 'inline-block', verticalAlign: 'middle' }} /> Hecho</span>
      <span><span style={{ borderTop: `3px dashed ${COLOR.pendiente}`, width: 18, display: 'inline-block', verticalAlign: 'middle' }} /> Por hacer</span>
    </div>
  );
}

function Lienzo({ mapa }: { mapa: MapaEnvio }) {
  const div = useRef<HTMLDivElement>(null);
  const inst = useRef<MapaL | null>(null);
  const capa = useRef<import('leaflet').LayerGroup | null>(null);
  const encuadrado = useRef(false);
  const puntos = useRef<[number, number][]>([]);
  const encuadrar = useCallback(() => {
    const m = inst.current, t = puntos.current;
    if (!m || !t.length) return;
    if (t.length === 1) m.setView(t[0], 10);
    else void import('leaflet').then((mod) => m.fitBounds((mod.default ?? mod).latLngBounds(t), { padding: [40, 40], maxZoom: 12 }));
  }, []);
  const [listo, setListo] = useState(false);

  useEffect(() => {
    let vivo = true;
    void import('leaflet').then((mod) => {
      const L = mod.default ?? mod;
      if (!vivo || !div.current || inst.current) return;
      const m = L.map(div.current, { zoomControl: true, attributionControl: true, scrollWheelZoom: true });
      L.tileLayer(TESELAS, { maxZoom: 18, attribution: ATRIBUCION }).addTo(m);
      m.attributionControl.setPrefix('<a href="https://leafletjs.com" target="_blank" rel="noopener">Leaflet</a>');
      m.setView([40.2, -3.7], 5);
      inst.current = m; capa.current = L.layerGroup().addTo(m);
      setListo(true);
      // La ventana se abre con animación: recalcula el tamaño cuando ya está en su sitio.
      setTimeout(() => m.invalidateSize(), 350);
    });
    return () => { vivo = false; inst.current?.remove(); inst.current = null; };
  }, []);

  useEffect(() => {
    if (!listo || !inst.current || !capa.current) return;
    void import('leaflet').then((mod) => {
      const L = mod.default ?? mod;
      const g = capa.current!;
      g.clearLayers();
      const pts = mapa.paradas.filter((p) => p.lat != null && p.lon != null);
      const pc = posicionCamion(mapa);
      const c = mapa.camion;
      // Tramos: hecho (línea continua) o por hacer (discontinua). En el tramo en curso, la
      // parte hecha va hasta el camión.
      for (let i = 0; i + 1 < pts.length; i++) {
        const a = pts[i], b = pts[i + 1];
        const hecho = !!b.realizado_en || c.modo === 'entregado';
        const enCurso = c.modo === 'en_ruta' && c.desde === a.orden && c.hasta === b.orden && pc;
        if (enCurso) {
          L.polyline([[+a.lat!, +a.lon!], [pc.lat, pc.lon]], { color: COLOR.ruta, weight: 4 }).addTo(g);
          L.polyline([[pc.lat, pc.lon], [+b.lat!, +b.lon!]], { color: COLOR.pendiente, weight: 3, dashArray: '8 8' }).addTo(g);
        } else {
          L.polyline([[+a.lat!, +a.lon!], [+b.lat!, +b.lon!]], hecho ? { color: COLOR.ruta, weight: 4 } : { color: COLOR.pendiente, weight: 3, dashArray: '8 8' }).addTo(g);
        }
      }
      for (const p of pts) {
        const color = p.realizado_en ? COLOR.hecho : p.tipo === 'carga' ? COLOR.carga : COLOR.descarga;
        const icono = L.divIcon({ className: '', iconSize: [28, 28], iconAnchor: [14, 14],
          html: `<div style="width:28px;height:28px;border-radius:14px;background:${color};color:#fff;font:800 13px/28px system-ui;text-align:center;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35)">${p.realizado_en ? '✓' : p.orden}</div>` });
        const txt = `${p.tipo === 'carga' ? 'Recogida' : 'Entrega'} ${p.orden}: ${[p.empresa, p.poblacion].filter(Boolean).join(' · ')}`;
        L.marker([+p.lat!, +p.lon!], { icon: icono, title: txt, keyboard: false }).bindTooltip(txt).addTo(g);
      }
      if (pc) {
        const icono = L.divIcon({ className: '', iconSize: [38, 38], iconAnchor: [19, 19],
          html: `<div style="width:38px;height:38px;border-radius:19px;background:#fff;border:3px solid ${TONO[pc.tono]};font:20px/32px system-ui;text-align:center;box-shadow:0 2px 6px rgba(0,0,0,.35)">🚚</div>` });
        L.marker([pc.lat, pc.lon], { icon: icono, title: pc.titulo, zIndexOffset: 1000, keyboard: false })
          .bindTooltip(`<strong>${pc.titulo}</strong><br>${pc.detalle}<br><em>Posición estimada</em>`).addTo(g);
      }
      // Encuadre: la primera vez, todas las paradas y el camión; después se respeta lo que
      // haya movido quien mira.
      const todos: [number, number][] = pts.map((p) => [+p.lat!, +p.lon!]);
      if (pc) todos.push([pc.lat, pc.lon]);
      puntos.current = todos;
      if (!encuadrado.current) { encuadrar(); encuadrado.current = todos.length > 0; }
    });
  }, [listo, mapa, encuadrar]);

  return (
    <div style={CAJA_MAPA}>
      <div ref={div} data-mapa-envio="" role="region" aria-label="Mapa de la ruta del envío"
        style={{ width: '100%', height: 'min(60vh, 460px)', borderRadius: 12, overflow: 'hidden', border: '1px solid var(--gray-200)', background: '#eef2f7' }} />
      <BotonEncuadrar onClick={encuadrar} que="la ruta" />
    </div>
  );
}
