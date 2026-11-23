'use client';

// MAPA GENERAL (usuario, 2026-11-22): todos los envíos en programación o en marcha a la vez —
// Dynamo ve todos; el cliente, los suyos. Los entregados y los cancelados no salen. El encuadre
// se ajusta solo a lo que haya (y a lo que deje ver el filtro). En marcha: el camión en su
// posición ESTIMADA y la ruta (línea recta hasta tener Google Maps); programados: un punto en
// su primera recogida. Pulsando un camión: su estado y botones para su mapa y su ficha.
// Se actualiza sola cada 2 minutos. Cuando un transportista comparta su GPS, su posición real
// sustituirá a la estimada (mapa_envio decide la posición; aquí solo se pinta).
import 'leaflet/dist/leaflet.css';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Map as MapaL, LayerGroup } from 'leaflet';
import { mapaEnviosEnCurso, situarParadasDelMapa, type EnvioMapa } from '@/app/panel/(app)/envios/acciones-mapa';
import { claveParada, posicionCamion } from '@/lib/mapaEnvio';
import { fecha } from '@/lib/formato';
import { nombreEstado } from '@/lib/estados';
import { ATRIBUCION, BotonEncuadrar, CAJA_MAPA, COLOR, TESELAS, TONO, VentanaMapa } from './MapaEnvio';
import { dibujarRuta, resaltador, ESTILO_MAPA, marcadorCamion, svgCamion, type Ruta } from './mapaRuta';

type Filtro = 'todos' | 'marcha' | 'programados';
const enMarcha = (e: EnvioMapa) => e.estado !== 'programado';

export default function MapaGeneral({ dynamo }: { dynamo: boolean }) {
  const [envios, setEnvios] = useState<EnvioMapa[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [abierto, setAbierto] = useState<{ id: string; ref: string } | null>(null);
  // Las coordenadas que faltan se buscan DESPUÉS de pintar (usuario, 2026-11-22: el mapa
  // tardaba 5 s esperándolas) y se añaden al llegar.
  const situando = useRef(false);
  const cargar = useCallback(async () => {
    const r = await mapaEnviosEnCurso().catch(() => ({ ok: false as const, error: 'No se ha podido cargar el mapa.' }));
    if (!r.ok) { setError(r.error); return; }
    setEnvios(r.envios); setError(null);
    if (situando.current || !r.envios.some((e) => e.paradas.some((p) => p.lat == null || p.lon == null))) return;
    situando.current = true;
    try {
      const x = await situarParadasDelMapa();
      if (x.ok && Object.keys(x.hallados).length) {
        setEnvios((l) => l && l.map((e) => ({ ...e, paradas: e.paradas.map((p) => {
          const c = p.lat == null || p.lon == null ? x.hallados[claveParada(p)] : undefined;
          return c ? { ...p, lat: c.lat, lon: c.lon, coord: 'codigo_postal' as const } : p;
        }) })));
      }
    } catch { /* se reintenta en la próxima actualización */ } finally { situando.current = false; }
  }, []);
  useEffect(() => { void cargar(); const t = setInterval(() => void cargar(), 120_000); return () => clearInterval(t); }, [cargar]);

  const visibles = useMemo(() => (envios ?? []).filter((e) => filtro === 'todos' || (filtro === 'marcha' ? enMarcha(e) : !enMarcha(e))), [envios, filtro]);
  const nMarcha = (envios ?? []).filter(enMarcha).length, nProg = (envios ?? []).length - nMarcha;
  const sinSituar = visibles.filter((e) => !e.paradas.some((p) => p.lat != null)).length;

  return (
    <section className="section active" aria-labelledby="tituloMapa">
      <div className="sec-header" style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
        <h2 id="tituloMapa" style={{ margin: 0 }}>Mapa de envíos</h2>
        <div role="tablist" aria-label="Qué envíos ver" style={{ display: 'flex', gap: '0.35rem', marginLeft: 'auto', flexWrap: 'wrap' }}>
          {([['todos', `Todos (${(envios ?? []).length})`], ['marcha', `En marcha (${nMarcha})`], ['programados', `Programados (${nProg})`]] as [Filtro, string][]).map(([k, t]) => (
            <button key={k} type="button" role="tab" aria-selected={filtro === k} onClick={() => setFiltro(k)}
              style={{ borderRadius: 999, padding: '0.3rem 0.8rem', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer',
                border: `1.5px solid ${filtro === k ? 'var(--purple)' : 'var(--gray-300)'}`, background: filtro === k ? 'var(--purple)' : '#fff', color: filtro === k ? '#fff' : 'var(--navy)' }}>{t}</button>
          ))}
        </div>
      </div>
      <p className="meta" style={{ margin: '0.2rem 0 0.7rem' }}>
        {dynamo ? 'Todos los envíos' : 'Tus envíos'} en programación y en marcha (los entregados y los cancelados no salen). La posición del camión es
        {' '}<strong>estimada</strong> con el horario previsto, las pausas del conductor y las firmas del CMR. Se actualiza sola cada 2 minutos.
        {sinSituar > 0 && ` ${sinSituar} sin coordenadas todavía (se están buscando; salen en cuanto se encuentren).`}
      </p>
      {error && <div className="pt-aviso error" style={{ marginBottom: '0.6rem' }}><div>{error}</div></div>}
      {envios && envios.length === 0 && <div className="pt-aviso ok" style={{ marginBottom: '0.6rem' }}><div>No hay envíos en programación ni en marcha ahora mismo.</div></div>}
      <Lienzo envios={visibles} dynamo={dynamo} onAbrir={(id, ref) => setAbierto({ id, ref })} />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.9rem', fontSize: '0.78rem', color: 'var(--gray-700)', marginTop: '0.5rem' }} aria-label="Leyenda del mapa general">
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}><span dangerouslySetInnerHTML={{ __html: svgCamion(34) }} style={{ display: 'inline-flex' }} />En marcha (borde: <span style={{ color: TONO.azul }}>en ruta</span> · <span style={{ color: TONO.ambar }}>cargando/descargando</span> · <span style={{ color: TONO.gris }}>parado</span> · <span style={{ color: TONO.rojo }}>con retraso</span>)</span>
        <span><span style={{ display: 'inline-block', width: 11, height: 11, borderRadius: 6, background: '#9ca3af', verticalAlign: 'middle' }} /> Programado (en su 1.ª recogida)</span>
        <span><span style={{ borderTop: `3px solid ${COLOR.ruta}`, width: 18, display: 'inline-block', verticalAlign: 'middle' }} /> Hecho · <span style={{ borderTop: `3px dashed ${COLOR.pendiente}`, width: 18, display: 'inline-block', verticalAlign: 'middle' }} /> Por hacer (en línea recta)</span>
        <span>Pulsa una parada o una ruta para ver todas sus paradas con su hora (si no caben todas, toca una parada o acerca el mapa).</span>
      </div>
      {abierto && <VentanaMapa envioId={abierto.id} referencia={abierto.ref} onCerrar={() => setAbierto(null)} />}
    </section>
  );
}

function Lienzo({ envios, dynamo, onAbrir }: { envios: EnvioMapa[]; dynamo: boolean; onAbrir: (id: string, ref: string) => void }) {
  const div = useRef<HTMLDivElement>(null);
  const inst = useRef<MapaL | null>(null);
  const capa = useRef<LayerGroup | null>(null);
  const encuadre = useRef('');
  const todos = useRef<[number, number][]>([]);
  // Todo lo que se ve (camiones, puntos y paradas), justo: ni falta ni sobra.
  const encuadrar = useCallback(() => {
    const m = inst.current, t = todos.current;
    if (!m || !t.length) return;
    if (t.length === 1) m.setView(t[0], 9);
    else void import('leaflet').then((mod) => m.fitBounds((mod.default ?? mod).latLngBounds(t), { padding: [40, 40], maxZoom: 10 }));
  }, []);
  const [listo, setListo] = useState(false);
  const abrir = useRef(onAbrir); abrir.current = onAbrir;
  const res = useRef(resaltador());

  useEffect(() => {
    let vivo = true;
    const r = res.current;
    void import('leaflet').then((mod) => {
      const L = mod.default ?? mod;
      if (!vivo || !div.current || inst.current) return;
      const m = L.map(div.current, { zoomControl: true });
      m.on('click', () => r.apagar());   // pulsar fuera de un envío: se apaga al momento
      L.tileLayer(TESELAS, { maxZoom: 18, attribution: ATRIBUCION }).addTo(m);
      m.attributionControl.setPrefix('<a href="https://leafletjs.com" target="_blank" rel="noopener">Leaflet</a>');
      m.setView([40.2, -3.7], 6);
      inst.current = m; capa.current = L.layerGroup().addTo(m);
      // Los botones de las ventanitas de los camiones abren el mapa del envío.
      div.current.addEventListener('click', (ev) => {
        const b = (ev.target as HTMLElement).closest<HTMLElement>('[data-abrir-mapa]');
        if (b) abrir.current(b.dataset.abrirMapa!, b.dataset.ref ?? '');
      });
      setListo(true);
      setTimeout(() => m.invalidateSize(), 300);
    });
    return () => { vivo = false; r.apagar(); inst.current?.remove(); inst.current = null; };
  }, []);

  useEffect(() => {
    if (!listo || !inst.current || !capa.current) return;
    void import('leaflet').then((mod) => {
      const L = mod.default ?? mod;
      const g = capa.current!;
      res.current.apagar();
      g.clearLayers();
      const puntos: [number, number][] = [];
      const rutas: Ruta[] = [];
      const esc = (t: string | null | undefined) => (t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
      for (const e of envios) {
        const pts = e.paradas.filter((p) => p.lat != null && p.lon != null);
        if (!pts.length) continue;
        const ruta = `${esc(pts[0].poblacion)} → ${esc(pts[pts.length - 1].poblacion)}`;
        const botones = `<div style="margin-top:6px;display:flex;gap:6px"><button type="button" data-abrir-mapa="${e.id}" data-ref="${esc(e.referencia)}" style="border:1px solid #3300cc;color:#3300cc;background:#fff;border-radius:6px;padding:2px 8px;cursor:pointer;font-weight:700">Mapa del envío</button><a href="/panel/envios?ver=${e.id}" style="font-weight:700">Ficha</a></div>`;
        const cabecera = `<strong>#${esc(e.referencia)}</strong>${dynamo && e.cliente ? ` · ${esc(e.cliente)}` : ''}<br>${ruta}`;
        // La ruta de cada envío, como en el mapa del envío: al pulsar una parada o la línea se
        // resalta (y se atenúan las demás) con las etiquetas de todas sus paradas, 4 segundos.
        // Los programados no se dibujan hasta pulsar su punto: el mapa no se llena de líneas.
        const r = dibujarRuta(L, g, e, { oculta: !enMarcha(e), alPulsar: () => res.current.resaltar(r) });
        rutas.push(r);
        if (!enMarcha(e)) {
          // Programado: un punto gris en su 1.ª recogida; al pulsarlo, su ficha breve y su ruta.
          const p = pts[0];
          L.circleMarker([+p.lat!, +p.lon!], { radius: 6, color: '#fff', weight: 2, fillColor: '#9ca3af', fillOpacity: 1, className: 'punto-programado', bubblingMouseEvents: false })
            .bindPopup(`${cabecera}<br>Programado${e.fecha_carga ? ` · carga ${fecha(e.fecha_carga)}` : ''}${botones}`, { autoPanPadding: [16, 16] })
            .on('click', () => res.current.resaltar(r, p.orden)).addTo(g);
          puntos.push([+p.lat!, +p.lon!]);
          continue;
        }
        const pc = posicionCamion(e);
        const donde: [number, number] = pc ? [pc.lat, pc.lon] : [+pts[0].lat!, +pts[0].lon!];
        const tono = pc ? TONO[pc.tono] : TONO.gris;
        const mc = marcadorCamion(tono);
        const icono = L.divIcon({ className: 'camion-mapa', iconSize: [mc.ancho, mc.alto], iconAnchor: [mc.ancho / 2, mc.alto / 2], html: mc.html });
        L.marker(donde, { icon: icono, title: `#${e.referencia}`, keyboard: false, zIndexOffset: 1000 })
          .bindPopup(`${cabecera}<br><span style="color:${tono};font-weight:700">${esc(pc?.titulo ?? nombreEstado(e.estado))}</span>${pc ? `<br>${esc(pc.detalle)}` : ''}<br><em>Posición estimada</em>${botones}`, { autoPanPadding: [16, 16] })
          .on('click', () => res.current.resaltar(r)).addTo(g);
        puntos.push(donde);
        for (const p of pts) puntos.push([+p.lat!, +p.lon!]);
      }
      res.current.poner(rutas);
      // Encuadre automático a lo que haya (solo cuando cambia QUÉ se ve, no en cada
      // actualización: si el usuario ha movido el mapa, se respeta).
      const clave = envios.map((e) => e.id).sort().join(',');
      todos.current = puntos;
      if (clave !== encuadre.current && puntos.length) { encuadre.current = clave; encuadrar(); }
    });
  }, [listo, envios, dynamo, encuadrar]);

  return (
    <div style={CAJA_MAPA}>
      <style>{ESTILO_MAPA}</style>
      <div ref={div} data-mapa-general="" role="region" aria-label="Mapa de los envíos en curso"
        style={{ width: '100%', height: 'min(72vh, 720px)', borderRadius: 12, overflow: 'hidden', border: '1px solid var(--gray-200)', background: '#eef2f7' }} />
      <BotonEncuadrar onClick={encuadrar} que="todos los envíos" />
    </div>
  );
}
