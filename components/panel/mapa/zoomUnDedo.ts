// ZOOM CON UN SOLO DEDO (usuario, 2026-11-24: «en el móvil, dos toques y en el segundo mueves
// el dedo: hacia arriba se aleja y hacia abajo se acerca», como en la app de Google Maps). El
// mapa web de Google no lo trae: acerca con dos toques, pero para alejar pide dos dedos.
//   · Dos toques seguidos en el mismo sitio y, SIN SOLTAR el segundo, arrastrar en vertical.
//   · El punto tocado se queda quieto bajo el dedo mientras cambia el zoom.
//   · Dos toques sin arrastrar siguen acercando, como siempre (eso lo hace Google).
// Se escucha ANTES que Google (fase de captura): en cuanto el arrastre es nuestro, sus
// movimientos no le llegan (si no, además movería el mapa); el final sí, para que cierre su
// gesto con normalidad.
/* eslint-disable @typescript-eslint/no-explicit-any -- la API de Google se carga en la página, sin tipos propios */
type G = any;

const ENTRE_TOQUES_MS = 350;   // lo que se espera el segundo toque
const TOQUE_MS = 300;          // un toque más largo ya no es un toque
const CERCA_PX = 40;           // el segundo toque, cerca del primero
const ARRANQUE_PX = 10;        // lo que hay que arrastrar para que empiece el zoom
const PX_POR_NIVEL = 110;      // cuánto dedo es un nivel de zoom

export function zoomConUnDedo(gm: G, mapa: G, div: HTMLElement, pixelALatLng: (x: number, y: number) => G | null): () => void {
  let toque: { t: number; x: number; y: number } | null = null;          // el primer toque, ya soltado
  let abajo: { id: number; t: number; x: number; y: number; movido: boolean } | null = null;
  let segundo: { id: number; x: number; y: number } | null = null;        // el segundo toque, aún sin arrastrar
  let zoom: { id: number; y0: number; z0: number; ancla: { x: number; y: number } | null; centro0: { x: number; y: number } | null } | null = null;
  let dedos = 0;
  let pendiente: number | null = null, cuadro = 0;

  const aplicar = () => {
    cuadro = 0;
    if (!zoom || pendiente == null) return;
    const min = mapa.get('minZoom') ?? 3, max = mapa.get('maxZoom') ?? 18;
    const z = Math.min(max, Math.max(min, zoom.z0 + (pendiente - zoom.y0) / PX_POR_NIVEL));
    const pr = mapa.getProjection?.();
    // El punto tocado no se mueve: el centro se acerca a él (o se aleja) en la misma proporción.
    if (pr && zoom.ancla && zoom.centro0) {
      const k = 2 ** (z - zoom.z0);
      const c = pr.fromPointToLatLng(new gm.Point(zoom.ancla.x + (zoom.centro0.x - zoom.ancla.x) / k, zoom.ancla.y + (zoom.centro0.y - zoom.ancla.y) / k));
      if (c) {
        if (mapa.moveCamera) mapa.moveCamera({ zoom: z, center: c });
        else { mapa.setZoom(z); mapa.setCenter(c); }
        return;
      }
    }
    mapa.setZoom(z);
  };

  const alBajar = (e: PointerEvent) => {
    if (e.pointerType !== 'touch') return;
    dedos++;
    const r = div.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, ahora = performance.now();
    // Sobre un botón o un enlace del mapa (zoom, Mapa/Satélite, la ventanita de un camión) no
    // hay gesto. Sobre una parada o un camión sí: se puede empezar el zoom encima de ellos.
    const el = e.target as HTMLElement | null;
    if (dedos !== 1 || el?.closest('button, a, select, [role="button"], [role="menu"], [role="menuitemradio"], [role="menuitemcheckbox"]')) { toque = null; abajo = null; segundo = null; return; }
    abajo = { id: e.pointerId, t: ahora, x, y, movido: false };
    segundo = toque && ahora - toque.t < ENTRE_TOQUES_MS && Math.hypot(x - toque.x, y - toque.y) < CERCA_PX ? { id: e.pointerId, x, y } : null;
    toque = null;
  };
  const alMover = (e: PointerEvent) => {
    if (e.pointerType !== 'touch') return;
    const r = div.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    if (abajo && e.pointerId === abajo.id && Math.hypot(x - abajo.x, y - abajo.y) > ARRANQUE_PX) abajo.movido = true;
    if (!zoom && segundo && e.pointerId === segundo.id && dedos === 1) {
      const dy = y - segundo.y, dx = x - segundo.x;
      if (Math.abs(dy) < ARRANQUE_PX) return;
      if (Math.abs(dx) > Math.abs(dy)) { segundo = null; return; }   // arrastre de lado: mover el mapa, como siempre
      const pr = mapa.getProjection?.(), ll = pixelALatLng(segundo.x, segundo.y), c = mapa.getCenter?.();
      const a = pr && ll ? pr.fromLatLngToPoint(ll) : null, c0 = pr && c ? pr.fromLatLngToPoint(c) : null;
      zoom = { id: segundo.id, y0: y, z0: mapa.getZoom() ?? 6, ancla: a ? { x: a.x, y: a.y } : null, centro0: c0 ? { x: c0.x, y: c0.y } : null };
      segundo = null;
    }
    if (zoom && e.pointerId === zoom.id) {
      e.stopPropagation(); e.preventDefault();
      pendiente = y;
      cuadro ||= requestAnimationFrame(aplicar);
    }
  };
  const alSoltar = (e: PointerEvent) => {
    if (e.pointerType !== 'touch') return;
    dedos = Math.max(0, dedos - 1);
    const ahora = performance.now();
    if (zoom && e.pointerId === zoom.id) { if (cuadro) { cancelAnimationFrame(cuadro); aplicar(); } zoom = null; pendiente = null; toque = null; abajo = null; return; }
    if (segundo && e.pointerId === segundo.id) segundo = null;
    // Un toque limpio (corto y sin moverse) es candidato a primer toque.
    toque = abajo && e.pointerId === abajo.id && e.type === 'pointerup' && !abajo.movido && ahora - abajo.t < TOQUE_MS ? { t: ahora, x: abajo.x, y: abajo.y } : null;
    abajo = null;
  };
  // Mientras dura nuestro zoom, a Google tampoco le llegan los movimientos como «touch»
  // (según el navegador escucha unos u otros), y la página no se desplaza.
  const alTocarMover = (e: TouchEvent) => { if (zoom) { e.stopPropagation(); if (e.cancelable) e.preventDefault(); } };

  const o = { capture: true, passive: false } as const;
  div.addEventListener('pointerdown', alBajar, o);
  div.addEventListener('pointermove', alMover, o);
  div.addEventListener('pointerup', alSoltar, o);
  div.addEventListener('pointercancel', alSoltar, o);
  div.addEventListener('touchmove', alTocarMover, o);
  return () => {
    if (cuadro) cancelAnimationFrame(cuadro);
    div.removeEventListener('pointerdown', alBajar, o);
    div.removeEventListener('pointermove', alMover, o);
    div.removeEventListener('pointerup', alSoltar, o);
    div.removeEventListener('pointercancel', alSoltar, o);
    div.removeEventListener('touchmove', alTocarMover, o);
  };
}
