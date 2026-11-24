// El mapa de GOOGLE (Maps JavaScript API, con la clave del navegador restringida a nuestras
// webs). Las marcas y las etiquetas son HTML nuestro colocado sobre el mapa (una sola capa de
// Google las sitúa todas), así que se ven igual que en el mapa de reserva. Ver ./motor.
import type { Direccion, Etiqueta, EstiloLinea, Grupo, LL, Motor } from './motor';

/* eslint-disable @typescript-eslint/no-explicit-any -- la API de Google se carga en la página, sin tipos propios */
type G = any;

let cargando: Promise<G> | null = null;
function cargarGoogle(clave: string): Promise<G> {
  const w = window as unknown as { google?: { maps?: G }; __dynamoMapa?: () => void; gm_authFailure?: () => void };
  if (w.google?.maps?.Map) return Promise.resolve(w.google.maps);
  cargando ??= new Promise<G>((ok, mal) => {
    const fuera = setTimeout(() => { cargando = null; mal(new Error('Google Maps tarda demasiado')); }, 15000);
    w.__dynamoMapa = () => { clearTimeout(fuera); ok(w.google!.maps); };
    w.gm_authFailure = () => console.error('[mapa] Google rechaza la clave del mapa (revisa sus restricciones de sitio web y de API)');
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(clave)}&v=weekly&loading=async&language=es&region=ES&callback=__dynamoMapa`;
    s.async = true;
    s.onerror = () => { clearTimeout(fuera); cargando = null; mal(new Error('No se ha podido cargar Google Maps')); };
    document.head.appendChild(s);
  });
  return cargando;
}

const ESTILO = `
.gm-dynamo-marca{position:absolute;transform:translate(-50%,-50%);cursor:pointer}
.gm-dynamo-ventana{font:13px/1.4 system-ui,sans-serif;color:#1f2937;padding:2px 2px 0}
.gm-dynamo-ventana strong{font-weight:700}
.gm-dynamo-etq{position:absolute;pointer-events:none;background:#fff;color:#1f2937;border:1px solid rgba(0,0,0,.15);font-family:system-ui,sans-serif}
`;

type Pieza = { el: HTMLElement; en: LL; colocar: (x: number, y: number) => void };

export async function crearMotorGoogle(div: HTMLElement, centro: LL, zoom: number, clave: string): Promise<Motor> {
  const gm = await cargarGoogle(clave);
  if (!document.getElementById('gm-dynamo-estilo')) {
    const st = document.createElement('style'); st.id = 'gm-dynamo-estilo'; st.textContent = ESTILO; document.head.appendChild(st);
  }
  const m = new gm.Map(div, {
    // Vista simple (callejero) por defecto; el satélite, opcional, con su botón arriba a la
    // derecha (usuario, 2026-11-24).
    center: { lat: centro[0], lng: centro[1] }, zoom, mapTypeId: 'roadmap', disableDefaultUI: true, zoomControl: true,
    mapTypeControl: true, mapTypeControlOptions: { mapTypeIds: ['roadmap', 'hybrid'], position: gm.ControlPosition?.TOP_RIGHT },
    gestureHandling: 'greedy', clickableIcons: false, keyboardShortcuts: false, maxZoom: 18, minZoom: 3,
  });
  div.classList.add('gm-dynamo');

  // UNA capa nuestra sitúa todo el HTML (marcas y etiquetas) cada vez que el mapa se mueve.
  const piezas = new Set<Pieza>();
  const capa = new gm.OverlayView();
  let lista: () => void = () => {};
  const preparada = new Promise<void>((ok) => { lista = ok; });
  capa.onAdd = () => lista();
  const situar = (p: Pieza) => {
    const pr = capa.getProjection();
    if (!pr) return;
    const px = pr.fromLatLngToDivPixel(new gm.LatLng(p.en[0], p.en[1]));
    if (px) p.colocar(px.x, px.y);
  };
  capa.draw = () => { for (const p of piezas) situar(p); };
  capa.onRemove = () => { for (const p of piezas) p.el.remove(); piezas.clear(); };
  capa.setMap(m);
  await preparada;
  const panel = (cual: 'overlayMouseTarget' | 'floatPane'): HTMLElement => capa.getPanes()[cual];

  // Sin la cabecera de Google (dejaba un hueco arriba): se cierra pulsando fuera, como las etiquetas.
  const ventana = new gm.InfoWindow({ maxWidth: 260, headerDisabled: true });
  const camino = (e: EstiloLinea) => (e.discontinua
    ? { strokeColor: e.color, strokeWeight: e.grosor, strokeOpacity: 0,
        icons: [{ icon: { path: 'M 0,-1 0,1', strokeOpacity: e.opacidad, strokeColor: e.color, scale: e.grosor }, offset: '0', repeat: '16px' }] }
    : { strokeColor: e.color, strokeWeight: e.grosor, strokeOpacity: e.opacidad, icons: [] });
  const ruta = (pts: LL[]) => pts.map(([lat, lng]) => ({ lat, lng }));
  let z = 10;

  const grupo = (visible = true): Grupo => {
    let seVe = visible;
    const lineas: G[] = [];
    const mias = new Set<Pieza>();
    const poner = (p: Pieza, dentro: HTMLElement) => { mias.add(p); if (seVe) { dentro.appendChild(p.el); piezas.add(p); situar(p); } (p as Pieza & { dentro?: HTMLElement }).dentro = dentro; };
    return {
      linea(puntos, estilo, alPulsar) {
        const l = new gm.Polyline({ path: ruta(puntos), map: seVe ? m : null, clickable: !!alPulsar, zIndex: z++, ...camino(estilo) });
        if (alPulsar) l.addListener('click', () => alPulsar());
        lineas.push(l);
        return { estilo: (e) => l.setOptions(camino(e)), alFrente: () => l.setOptions({ zIndex: z++ }) };
      },
      toque(puntos, alPulsar) {
        const l = new gm.Polyline({ path: ruta(puntos), map: seVe ? m : null, strokeOpacity: 0, strokeWeight: 18, clickable: true, zIndex: 5 });
        l.addListener('click', () => alPulsar());
        lineas.push(l);
      },
      marca(en, o) {
        const el = document.createElement('div');
        el.className = `gm-dynamo-marca ${o.clase}`;
        el.style.width = `${o.ancho}px`; el.style.height = `${o.alto}px`;
        if (o.encima) el.style.zIndex = '1000';
        if (o.titulo) el.title = o.titulo;
        el.innerHTML = o.html;
        gm.OverlayView.preventMapHitsAndGesturesFrom(el);
        el.addEventListener('click', (ev) => {
          ev.stopPropagation();
          if (o.ventana) { ventana.setContent(`<div class="gm-dynamo-ventana">${o.ventana}</div>`); ventana.setPosition({ lat: en[0], lng: en[1] }); ventana.setOptions({ pixelOffset: new gm.Size(0, -o.alto / 2) }); ventana.open({ map: m }); }
          o.alPulsar?.();
        });
        poner({ el, en, colocar: (x, y) => { el.style.left = `${x}px`; el.style.top = `${y}px`; } }, panel('overlayMouseTarget'));
        return { el: () => el };
      },
      etiqueta(en, html, clase): Etiqueta {
        const el = document.createElement('div');
        el.className = `gm-dynamo-etq ${clase}`;
        el.innerHTML = html;
        let dir: Direccion = 'top', d: [number, number] = [0, 0];
        const T: Record<Direccion, string> = { top: 'translate(-50%,-100%)', bottom: 'translate(-50%,0)', left: 'translate(-100%,-50%)', right: 'translate(0,-50%)' };
        const p: Pieza = { el, en, colocar: (x, y) => { el.style.left = `${x + d[0]}px`; el.style.top = `${y + d[1]}px`; el.style.transform = T[dir]; } };
        poner(p, panel('floatPane'));
        return {
          contenido: (h) => { el.innerHTML = h; },
          colocar: (nueva, des) => { dir = nueva; d = des; situar(p); },
          el: () => el,
          quitar: () => { el.remove(); piezas.delete(p); mias.delete(p); },
        };
      },
      mostrar() {
        if (seVe) return; seVe = true;
        for (const l of lineas) l.setMap(m);
        for (const p of mias) { (p as Pieza & { dentro?: HTMLElement }).dentro?.appendChild(p.el); piezas.add(p); situar(p); }
      },
      ocultar() {
        if (!seVe) return; seVe = false;
        for (const l of lineas) l.setMap(null);
        for (const p of mias) { p.el.remove(); piezas.delete(p); }
      },
      vaciar() {
        for (const l of lineas) l.setMap(null);
        lineas.length = 0;
        for (const p of mias) { p.el.remove(); piezas.delete(p); }
        mias.clear();
        ventana.close();
      },
    };
  };

  return {
    nombre: 'google',
    grupo,
    alPulsarFondo: (f) => { m.addListener('click', () => { ventana.close(); f(); }); },
    alCambiarZoom: (f) => {
      // Con el mapa ya quieto (las piezas recolocadas): el primer «idle» tras cambiar el zoom.
      let pendiente = false;
      const a = m.addListener('zoom_changed', () => { pendiente = true; });
      const b = m.addListener('idle', () => { if (pendiente) { pendiente = false; f(); } });
      return () => { a.remove(); b.remove(); };
    },
    contenedor: () => div,
    encuadrar: (puntos, zoomMaximo) => {
      if (!puntos.length) return;
      const caja = new gm.LatLngBounds();
      for (const [lat, lng] of puntos) caja.extend({ lat, lng });
      m.fitBounds(caja, 40);
      gm.event.addListenerOnce(m, 'idle', () => { if ((m.getZoom() ?? 0) > zoomMaximo) m.setZoom(zoomMaximo); });
    },
    centrar: (en, zm) => { m.setCenter({ lat: en[0], lng: en[1] }); m.setZoom(zm); },
    recalcular: () => { gm.event.trigger(m, 'resize'); },
    destruir: () => { capa.setMap(null); gm.event.clearInstanceListeners(m); div.classList.remove('gm-dynamo'); div.innerHTML = ''; },
  };
}
