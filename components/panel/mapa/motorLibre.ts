// El mapa de RESERVA (Leaflet + OpenStreetMap): solo cuando la plataforma no tiene la clave
// de Google (pruebas automáticas y local). Ver ./motor.
import 'leaflet/dist/leaflet.css';
import type * as Leaflet from 'leaflet';
import type { Etiqueta, EstiloLinea, Grupo, LL, Motor } from './motor';

const TESELAS = process.env.NEXT_PUBLIC_MAPA_TESELAS || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATRIBUCION = process.env.NEXT_PUBLIC_MAPA_ATRIBUCION || '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';

const camino = (e: EstiloLinea): Leaflet.PathOptions => ({ color: e.color, weight: e.grosor, opacity: e.opacidad, dashArray: e.discontinua ? '8 8' : undefined });

export async function crearMotorLibre(div: HTMLElement, centro: LL, zoom: number): Promise<Motor> {
  const mod = await import('leaflet');
  const L = (mod as unknown as { default?: typeof Leaflet }).default ?? mod;
  const m = L.map(div, { zoomControl: true, attributionControl: true, scrollWheelZoom: true });
  L.tileLayer(TESELAS, { maxZoom: 18, attribution: ATRIBUCION }).addTo(m);
  m.attributionControl.setPrefix('<a href="https://leafletjs.com" target="_blank" rel="noopener">Leaflet</a>');
  m.setView(centro, zoom);

  const grupo = (visible = true): Grupo => {
    const g = L.layerGroup();
    if (visible) g.addTo(m);
    return {
      linea(puntos, estilo, alPulsar) {
        const l = L.polyline(puntos, { ...camino(estilo), bubblingMouseEvents: false }).addTo(g);
        if (alPulsar) l.on('click', (ev) => { L.DomEvent.stop(ev); alPulsar(); });
        return { estilo: (e) => { l.setStyle(camino(e)); }, alFrente: () => { l.bringToFront(); } };
      },
      toque(puntos, alPulsar) {
        L.polyline(puntos, { opacity: 0, weight: 18, bubblingMouseEvents: false, className: 'ruta-toque' })
          .on('click', (ev) => { L.DomEvent.stop(ev); alPulsar(); }).addTo(g);
      },
      marca(en, o) {
        const icono = L.divIcon({ className: o.clase, iconSize: [o.ancho, o.alto], iconAnchor: [o.ancho / 2, o.alto / 2], html: o.html });
        const mk = L.marker(en, { icon: icono, title: o.titulo, keyboard: false, bubblingMouseEvents: false, zIndexOffset: o.encima ? 1000 : 0 });
        if (o.ventana) mk.bindPopup(o.ventana, { maxWidth: 240, autoPanPadding: [16, 16] });
        if (o.alPulsar) mk.on('click', (ev) => { if (!o.ventana) L.DomEvent.stop(ev); o.alPulsar!(); });
        mk.addTo(g);
        return { el: () => mk.getElement() ?? null };
      },
      etiqueta(en, html, clase): Etiqueta {
        const tt = L.tooltip({ permanent: true, direction: 'top', offset: [0, 0], className: clase, interactive: false }).setLatLng(en).setContent(html).addTo(g);
        return {
          contenido: (h) => { tt.setContent(h); },
          colocar: (dir, d) => { tt.options.direction = dir; tt.options.offset = d; tt.update(); },
          el: () => tt.getElement() ?? null,
          quitar: () => { tt.remove(); },
        };
      },
      mostrar: () => { g.addTo(m); },
      ocultar: () => { g.remove(); },
      vaciar: () => { g.clearLayers(); },
    };
  };

  return {
    nombre: 'libre',
    grupo,
    alPulsarFondo: (f) => { m.on('click', f); },
    alCambiarZoom: (f) => { m.on('zoomend', f); return () => { m.off('zoomend', f); }; },
    contenedor: () => m.getContainer(),
    encuadrar: (puntos, zoomMaximo) => { if (puntos.length) m.fitBounds(L.latLngBounds(puntos), { padding: [40, 40], maxZoom: zoomMaximo }); },
    centrar: (en, z) => { m.setView(en, z); },
    recalcular: () => { m.invalidateSize(); },
    destruir: () => { m.remove(); },
  };
}
