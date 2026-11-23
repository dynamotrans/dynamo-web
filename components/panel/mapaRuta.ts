// La RUTA de un envío dibujada en un mapa de Leaflet, igual en todos los mapas de la plataforma
// (el del envío y el general) — usuario, 2026-11-22:
//   · tramos hechos en línea continua y los que faltan en discontinua (en el tramo en curso, la
//     parte hecha llega hasta el camión); en línea recta hasta tener las rutas de Google Maps;
//   · cada parada, un círculo con su número (naranja recogida, morado entrega), también ya hecha;
//   · al pulsar una parada o la línea, la ruta se RESALTA (más gruesa, por encima de las demás) y
//     salen las etiquetas de TODAS sus paradas, en varias líneas, con su hora real o prevista,
//     durante 4 segundos; pulsando fuera del envío se apaga al momento (eso lo lleva quien la
//     usa, con `resaltador`).
import type * as Leaflet from 'leaflet';
import { etiquetaParada, etiquetaParadaCorta, horaParada, posicionCamion, type MapaEnvio } from '@/lib/mapaEnvio';

type L = typeof Leaflet;
const MORADO = '#3300cc', GRIS = '#9ca3af', NARANJA = '#e07b00';

// EL CAMIÓN DEL MAPA (usuario, 2026-11-22: «nada de emoticono; un tráiler fino con el logo
// de Dynamo en el remolque»): dibujo propio de perfil, remolque blanco con «dynamo» y la cabeza
// morada. Va dentro de una cajita blanca cuyo borde lleva el color del estado.
const SVG_CAMION = `<svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" viewBox="0 0 66 30" width="__W__" height="__H__"> <rect x="1" y="3" width="45" height="18" rx="1.8" fill="#fff" stroke="#1f2937" stroke-width="1.2"/> <text x="6.5" y="15.4" font-family="Arial, Helvetica, sans-serif" font-weight="800" font-size="10" fill="#3300cc" letter-spacing="-0.3">dynamo</text> <path d="M37.4 7.2 a4.4 4.4 0 0 1 4.8 3.5" fill="none" stroke="#22a55a" stroke-width="1.8" stroke-linecap="round"/> <rect x="1" y="21" width="46" height="1.8" fill="#374151"/> <rect x="45" y="20.4" width="19" height="2.4" rx="1" fill="#374151"/> <path d="M49 6.5 h8.4 a2.2 2.2 0 0 1 1.8 .9 l3.9 5.4 a2.4 2.4 0 0 1 .4 1.3 V21.5 H49 Z" fill="#3300cc" stroke="#1f2937" stroke-width=".8"/> <path d="M56.9 8.4 l3.6 5 h-5.4 v-5 Z" fill="#dbe4ff"/> <rect x="50.4" y="9" width="3.4" height="9" rx=".8" fill="none" stroke="#fff" stroke-opacity=".45" stroke-width=".7"/> <rect x="61.6" y="17" width="1.8" height="1.4" rx=".4" fill="#ffd400"/> <g fill="#111827"><circle cx="9" cy="24.8" r="2.9"/><circle cx="15.2" cy="24.8" r="2.9"/><circle cx="21.4" cy="24.8" r="2.9"/><circle cx="52" cy="24.8" r="2.9"/><circle cx="59.6" cy="24.8" r="2.9"/></g> <g fill="#9ca3af"><circle cx="9" cy="24.8" r="1"/><circle cx="15.2" cy="24.8" r="1"/><circle cx="21.4" cy="24.8" r="1"/><circle cx="52" cy="24.8" r="1"/><circle cx="59.6" cy="24.8" r="1"/></g> </svg>`;
export const svgCamion = (ancho: number) => SVG_CAMION.replace('__W__', String(ancho)).replace('__H__', String(Math.round(ancho * 30 / 66)));
/** HTML del marcador del camión: cajita blanca con el borde del color de su estado. */
export function marcadorCamion(color: string, grande = false): { html: string; ancho: number; alto: number } {
  const ancho = grande ? 62 : 52, alto = grande ? 36 : 31;
  return { ancho, alto, html: `<div style="width:${ancho}px;height:${alto}px;box-sizing:border-box;border-radius:10px;background:#fff;border:2.5px solid ${color};box-shadow:0 2px 6px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center">${svgCamion(ancho - 10)}</div>` };
}

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
  const pulsar = (ev: Leaflet.LeafletMouseEvent) => { L.DomEvent.stop(ev); solo = null; o.alPulsar(); };
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
  const marcas: Leaflet.Marker[] = [];
  let solo: number | null = null;   // la parada pulsada: su etiqueta sale siempre
  for (const p of pts) {
    // Siempre su NÚMERO y su color (naranja recogida, morado entrega), también ya hecha
    // (usuario, 2026-11-22: con un ✓ no se sabe si era la 1 o la 2; dónde va el camión ya
    // dice por dónde ha pasado). La hora real sale en su etiqueta.
    const color = p.tipo === 'carga' ? NARANJA : MORADO;
    const icono = L.divIcon({ className: 'parada-mapa', iconSize: [t, t], iconAnchor: [t / 2, t / 2],
      html: `<div style="width:${t}px;height:${t}px;border-radius:${t / 2}px;background:${color};color:#fff;font:800 ${o.grande ? 13 : 11}px/${t}px system-ui;text-align:center;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35)">${p.orden}</div>` });
    marcas.push(L.marker(ll(p), { icon: icono, title: `${p.tipo === 'carga' ? 'Recogida' : 'Entrega'} ${p.orden}`, keyboard: false, bubblingMouseEvents: false })
      .on('click', (ev: Leaflet.LeafletMouseEvent) => { L.DomEvent.stop(ev); solo = p.orden; o.alPulsar(); }).addTo(propia));
  }
  if (!o.oculta) propia.addTo(g);

  let etiquetas: { tt: Leaflet.Tooltip; larga: string; corta: string; orden: number }[] = [];
  let mapaL: Leaflet.Map | null = null;
  // SIN PISARSE (usuario, 2026-11-23: «se pisan los carteles»): cada etiqueta prueba varias
  // posiciones alrededor de su parada (arriba, abajo, a los lados y en diagonal) y se queda
  // donde no pise a otra etiqueta ni a un círculo de parada ni se salga del mapa; si no cabe,
  // prueba la versión corta («Recogida 1 · Bruxelles» y la hora); y si ni así, NO sale (se ve
  // acercándose o tocando esa parada, que tiene preferencia). Se recoloca al hacer zoom.
  const off = t / 2 + 2;
  const POS: [Leaflet.Direction, [number, number]][] = [
    ['top', [0, -off]], ['bottom', [0, off]], ['right', [off, 0]], ['left', [-off, 0]],
    ['top', [70, -off]], ['top', [-70, -off]], ['bottom', [70, off]], ['bottom', [-70, off]],
    ['right', [off, -28]], ['right', [off, 28]], ['left', [-off, -28]], ['left', [-off, 28]],
  ];
  const colocar = () => {
    const caja = mapaL?.getContainer().getBoundingClientRect();
    const puestas: DOMRect[] = marcas.map((m) => m.getElement()?.getBoundingClientRect()).filter((r): r is DOMRect => !!r);
    const pisa = (r: DOMRect) => {
      let a = 0;
      for (const q of puestas) {
        const w = Math.min(r.right, q.right) - Math.max(r.left, q.left) + 3, h = Math.min(r.bottom, q.bottom) - Math.max(r.top, q.top) + 3;
        if (w > 0 && h > 0) a += w * h;
      }
      if (caja) a += Math.max(0, caja.top - r.top) * r.width + Math.max(0, r.bottom - caja.bottom) * r.width
        + Math.max(0, caja.left - r.left) * r.height + Math.max(0, r.right - caja.right) * r.height;
      return a;
    };
    const poner = (e: (typeof etiquetas)[number], corta: boolean, i: number) => {
      e.tt.setContent(corta ? e.corta : e.larga);
      e.tt.options.direction = POS[i][0]; e.tt.options.offset = POS[i][1]; e.tt.update();
    };
    // La pulsada, primero (siempre sale).
    const orden = [...etiquetas].sort((a, b) => (a.orden === solo ? -1 : b.orden === solo ? 1 : 0));
    for (const e of orden) {
      const el = () => e.tt.getElement();
      el()?.style.removeProperty('display');
      let mejor: { i: number; corta: boolean; s: number } | null = null;
      for (const corta of [false, true]) {
        for (let i = 0; i < POS.length; i++) {
          poner(e, corta, i);
          const r = el()?.getBoundingClientRect();
          const s = r ? pisa(r) : 0;
          if (!mejor || s < mejor.s) mejor = { i, corta, s };
          if (s === 0) break;
        }
        if (mejor && mejor.s === 0) break;
      }
      if (!mejor) continue;
      poner(e, mejor.corta, mejor.i);
      if (mejor.s > 0 && e.orden !== solo) { const x = el(); if (x) x.style.display = 'none'; continue; }
      const r = el()?.getBoundingClientRect();
      if (r) puestas.push(r);
    }
  };
  const ruta: Ruta = {
    id: mapa.id ?? '',
    puntos: pts.map(ll),
    activar(excepto) {
      if (o.oculta) propia.addTo(g);
      for (const x of tramos) x.linea.setStyle({ ...x.base, weight: (x.base.weight ?? 3) + 3, opacity: 1, color: x.base.color === GRIS ? MORADO : x.base.color }).bringToFront();
      for (const x of etiquetas) x.tt.remove();
      etiquetas = pts.filter((p) => p.orden !== excepto).map((p) => ({
        orden: p.orden, larga: etiquetaParada(mapa, p), corta: etiquetaParadaCorta(mapa, p),
        tt: L.tooltip({ permanent: true, direction: 'top', offset: [0, -off], className: 'tt-parada', interactive: false })
          .setLatLng(ll(p)).setContent(etiquetaParada(mapa, p)).addTo(g),
      }));
      mapaL = (g as unknown as { _map?: Leaflet.Map })._map ?? null;
      colocar();
      mapaL?.on('zoomend', colocar);
    },
    desactivar() {
      mapaL?.off('zoomend', colocar);
      for (const x of etiquetas) x.tt.remove();
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
