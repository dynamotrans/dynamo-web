// La RUTA de un envío dibujada en un mapa de Leaflet, igual en todos los mapas de la plataforma
// (el del envío y el general) — usuario, 2026-11-22:
//   · tramos hechos en línea continua y los que faltan en discontinua (en el tramo en curso, la
//     parte hecha llega hasta el camión); en línea recta hasta tener las rutas de Google Maps;
//   · cada parada, un círculo numerado (✓ en verde si ya se hizo);
//   · al pulsar una parada o la línea, la ruta se RESALTA (más gruesa, por encima de las demás) y
//     salen las etiquetas de TODAS sus paradas, en varias líneas, con su hora real o prevista,
//     durante 4 segundos; pulsando fuera del envío se apaga al momento (eso lo lleva quien la
//     usa, con `resaltador`).
import type * as Leaflet from 'leaflet';
import { etiquetaParada, horaParada, posicionCamion, type MapaEnvio } from '@/lib/mapaEnvio';

type L = typeof Leaflet;
const MORADO = '#3300cc', GRIS = '#9ca3af', VERDE = '#16a34a', NARANJA = '#e07b00';

/** Estilo de las etiquetas de parada (varias líneas, estrechas). */
export const ESTILO_MAPA = `.leaflet-tooltip.tt-parada{white-space:normal;width:max-content;max-width:190px;line-height:1.25;font-size:12px;padding:5px 8px;border-radius:8px;box-shadow:0 2px 6px rgba(0,0,0,.25)}`;

export type Ruta = {
  id: string;
  puntos: [number, number][];
  activar: (excepto?: number) => void;
  desactivar: () => void;
  atenuar: (si: boolean) => void;
};

export function dibujarRuta(L: L, g: Leaflet.LayerGroup, mapa: MapaEnvio & { id?: string }, o: {
  grande?: boolean;          // paradas más grandes (el mapa de un solo envío)
  oculta?: boolean;          // no se ve hasta activarla (los programados del mapa general)
  alPulsar: () => void;      // al pulsar la línea o una parada
}): Ruta {
  const pts = mapa.paradas.filter((p) => p.lat != null && p.lon != null);
  const ll = (p: { lat: number | null; lon: number | null }) => [+p.lat!, +p.lon!] as [number, number];
  const c = mapa.camion;
  const pc = posicionCamion(mapa);
  const propia = L.layerGroup();
  const tramos: { linea: Leaflet.Polyline; base: Leaflet.PathOptions }[] = [];
  const pulsar = (ev: Leaflet.LeafletMouseEvent) => { L.DomEvent.stop(ev); o.alPulsar(); };
  const tramo = (a: [number, number], b: [number, number], hecho: boolean) => {
    const base: Leaflet.PathOptions = hecho
      ? { color: MORADO, weight: o.grande ? 4 : 3, opacity: 0.9, dashArray: undefined }
      : { color: GRIS, weight: o.grande ? 3 : 2, opacity: 0.85, dashArray: '8 8' };
    const linea = L.polyline([a, b], { ...base, bubblingMouseEvents: false }).on('click', pulsar).addTo(propia);
    tramos.push({ linea, base });
  };
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i], b = pts[i + 1];
    const hecho = !!horaParada(mapa, b)?.real || c.modo === 'entregado';
    if (c.modo === 'en_ruta' && c.desde === a.orden && c.hasta === b.orden && pc) {
      tramo(ll(a), [pc.lat, pc.lon], true);
      tramo([pc.lat, pc.lon], ll(b), false);
    } else tramo(ll(a), ll(b), hecho);
  }
  // Una línea invisible y ANCHA encima, para que sea fácil acertar con el dedo.
  if (pts.length > 1) {
    L.polyline(pts.map(ll), { opacity: 0, weight: 18, bubblingMouseEvents: false, className: 'ruta-toque' }).on('click', pulsar).addTo(propia);
  }
  const t = o.grande ? 28 : 20;
  for (const p of pts) {
    const hecha = !!horaParada(mapa, p)?.real;
    const color = hecha ? VERDE : p.tipo === 'carga' ? NARANJA : MORADO;
    const icono = L.divIcon({ className: 'parada-mapa', iconSize: [t, t], iconAnchor: [t / 2, t / 2],
      html: `<div style="width:${t}px;height:${t}px;border-radius:${t / 2}px;background:${color};color:#fff;font:800 ${o.grande ? 13 : 11}px/${t}px system-ui;text-align:center;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35)">${hecha ? '✓' : p.orden}</div>` });
    L.marker(ll(p), { icon: icono, title: `${p.tipo === 'carga' ? 'Recogida' : 'Entrega'} ${p.orden}`, keyboard: false, bubblingMouseEvents: false })
      .on('click', pulsar).addTo(propia);
  }
  if (!o.oculta) propia.addTo(g);

  let etiquetas: Leaflet.Tooltip[] = [];
  const ruta: Ruta = {
    id: mapa.id ?? '',
    puntos: pts.map(ll),
    activar(excepto) {
      if (o.oculta) propia.addTo(g);
      for (const x of tramos) x.linea.setStyle({ ...x.base, weight: (x.base.weight ?? 3) + 3, opacity: 1, color: x.base.color === GRIS ? MORADO : x.base.color }).bringToFront();
      for (const x of etiquetas) x.remove();
      etiquetas = pts.filter((p) => p.orden !== excepto).map((p) =>
        L.tooltip({ permanent: true, direction: 'top', offset: [0, -t / 2 - 2], className: 'tt-parada', interactive: false })
          .setLatLng(ll(p)).setContent(etiquetaParada(mapa, p)).addTo(g));
    },
    desactivar() {
      for (const x of etiquetas) x.remove();
      etiquetas = [];
      for (const x of tramos) x.linea.setStyle(x.base);
      if (o.oculta) propia.remove();
    },
    atenuar(si) {
      for (const x of tramos) x.linea.setStyle(si ? { ...x.base, opacity: 0.25 } : x.base);
    },
  };
  return ruta;
}

/** Quien lleva el resaltado de un mapa: una ruta activa como mucho, 4 segundos o hasta pulsar
 *  fuera; las demás se atenúan mientras tanto. */
export function resaltador() {
  let activa: Ruta | null = null;
  let reloj: ReturnType<typeof setTimeout> | null = null;
  let rutas: Ruta[] = [];
  const apagar = () => {
    if (reloj) { clearTimeout(reloj); reloj = null; }
    if (activa) { activa.desactivar(); activa = null; for (const r of rutas) r.atenuar(false); }
  };
  return {
    poner(lista: Ruta[]) { apagar(); rutas = lista; },
    resaltar(r: Ruta, excepto?: number) {
      apagar();
      activa = r;
      for (const x of rutas) if (x !== r) x.atenuar(true);
      r.activar(excepto);
      reloj = setTimeout(apagar, 4000);
    },
    apagar,
  };
}
