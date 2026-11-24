// ZOOM CON UN SOLO DEDO (usuario, 2026-11-24: «dos toques y, en el segundo, acerco el dedo
// hacia mí para acercar y lo subo para alejar», como en la app de Google Maps). El mapa web
// de Google no lo trae: acerca con dos toques, pero para alejar pide dos dedos.
//
// CÓMO: el SEGUNDO toque (seguido y cerca del primero) es NUESTRO desde que el dedo toca la
// pantalla, entero: ni Google ni el navegador llegan a verlo. Así en el iPhone el navegador no
// se lo queda para desplazar la página, recargarla tirando hacia abajo o hacer su propio zoom
// (la primera versión dejaba pasar el principio del gesto y por eso fallaba a ratos, sobre
// todo hacia abajo).
//   · Dedo hacia ABAJO (hacia ti): acerca. Hacia ARRIBA: aleja. El punto tocado no se mueve.
//   · Si el dedo se va de lado, mueve el mapa (como un arrastre normal).
//   · Dos toques sin arrastrar: acerca un nivel (lo hacemos nosotros, con su animación).
// La lógica va con los eventos «touch» (los que el iPhone respeta al cancelarlos); los
// «pointer» del mismo dedo solo se le esconden a Google.
/* eslint-disable @typescript-eslint/no-explicit-any -- la API de Google se carga en la página, sin tipos propios */
type G = any;

const ENTRE_TOQUES_MS = 450;   // lo que se espera el segundo toque
const TOQUE_MS = 350;          // un toque más largo ya no es un toque
const CERCA_PX = 60;           // el segundo toque, cerca del primero
const ARRANQUE_PX = 8;         // lo que hay que mover el dedo para que empiece el zoom o el arrastre
const PX_POR_NIVEL = 110;      // cuánto dedo es un nivel de zoom
const CONTROLES = 'button, a, select, input, [role="button"], [role="menu"], [role="menuitemradio"], [role="menuitemcheckbox"]';

type Punto = { x: number; y: number };

export function zoomConUnDedo(gm: G, mapa: G, div: HTMLElement, pixelALatLng: (x: number, y: number) => G | null): () => void {
  let primero: { t: number; x: number; y: number } | null = null;                 // el primer toque, ya soltado
  let abajo: { id: number; t: number; x: number; y: number; movido: boolean } | null = null;
  let decision: { t: number; si: boolean } | null = null;                          // lo decidido para el dedo que acaba de tocar
  let punteroNuestro: number | null = null;
  let gesto: {
    id: number; t: number; x0: number; y0: number; z0: number; modo: 'quieto' | 'zoom' | 'mover';
    ancla: Punto | null; centro0: Punto | null;
  } | null = null;
  let ultimo: Punto | null = null, cuadro = 0, animacion = 0;

  const dentro = (cx: number, cy: number): Punto => { const r = div.getBoundingClientRect(); return { x: cx - r.left, y: cy - r.top }; };
  const limites = () => ({ min: mapa.get('minZoom') ?? 3, max: mapa.get('maxZoom') ?? 18 });
  const mundo = (ll: G): Punto | null => { const p = ll && mapa.getProjection?.()?.fromLatLngToPoint(ll); return p ? { x: p.x, y: p.y } : null; };
  // La cámara: ese zoom y ese centro (en coordenadas del mundo de Google), sin animación.
  const camara = (z: number, c: Punto | null) => {
    const ll = c && mapa.getProjection?.()?.fromPointToLatLng(new gm.Point(c.x, c.y));
    if (ll && mapa.moveCamera) mapa.moveCamera({ zoom: z, center: ll });
    else { mapa.setZoom(z); if (ll) mapa.setCenter(ll); }
  };
  // El centro que deja el ancla quieta en pantalla al pasar de z0 a z.
  const centroCon = (g: NonNullable<typeof gesto>, z: number): Punto | null =>
    (g.ancla && g.centro0 ? { x: g.ancla.x + (g.centro0.x - g.ancla.x) / 2 ** (z - g.z0), y: g.ancla.y + (g.centro0.y - g.ancla.y) / 2 ** (z - g.z0) } : null);

  const aplicar = () => {
    cuadro = 0;
    const g = gesto;
    if (!g || !ultimo) return;
    if (g.modo === 'zoom') {
      const { min, max } = limites();
      const z = Math.min(max, Math.max(min, g.z0 + (ultimo.y - g.y0) / PX_POR_NIVEL));
      camara(z, centroCon(g, z));
    } else if (g.modo === 'mover' && g.centro0) {
      const k = 2 ** g.z0;   // píxeles de pantalla por unidad del mundo a ese zoom
      camara(g.z0, { x: g.centro0.x - (ultimo.x - g.x0) / k, y: g.centro0.y - (ultimo.y - g.y0) / k });
    }
  };
  // Dos toques sin arrastrar: un nivel más cerca, alrededor del punto tocado.
  const acercarUnNivel = (g: NonNullable<typeof gesto>) => {
    const { max } = limites();
    const hasta = Math.min(max, Math.round(g.z0) + 1), t0 = performance.now(), DURA = 220;
    if (hasta <= g.z0) return;
    cancelAnimationFrame(animacion);
    const paso = (ahora: number) => {
      const k = Math.min(1, (ahora - t0) / DURA), suave = 1 - (1 - k) ** 3;
      const z = g.z0 + (hasta - g.z0) * suave;
      camara(z, centroCon(g, z));
      if (k < 1) animacion = requestAnimationFrame(paso);
    };
    animacion = requestAnimationFrame(paso);
  };

  const sobreControl = (e: Event) => !!(e.target as HTMLElement | null)?.closest?.(CONTROLES);
  // ¿Este dedo que acaba de tocar es el segundo toque de un doble toque? Se decide UNA vez por
  // dedo (el «pointer» llega un instante antes que el «touch» y los dos tienen que coincidir).
  const esSegundo = (p: Punto, e: Event): boolean => {
    const ahora = performance.now();
    if (decision && ahora - decision.t < 120) return decision.si;
    const si = !!primero && !sobreControl(e) && ahora - primero.t < ENTRE_TOQUES_MS && Math.hypot(p.x - primero.x, p.y - primero.y) < CERCA_PX;
    decision = { t: ahora, si };
    return si;
  };

  // ---- A Google se le esconde el dedo entero (él escucha «pointer» o «touch», según el navegador).
  const pBajar = (e: PointerEvent) => {
    if (e.pointerType !== 'touch' || !e.isPrimary) return;
    const p = dentro(e.clientX, e.clientY);
    if (esSegundo(p, e)) { punteroNuestro = e.pointerId; e.stopPropagation(); }
  };
  const pSeguir = (e: PointerEvent) => {
    if (punteroNuestro === null || e.pointerId !== punteroNuestro) return;
    e.stopPropagation();
    if (e.type !== 'pointermove') punteroNuestro = null;
  };

  // ---- El gesto, con los eventos «touch».
  const tBajar = (e: TouchEvent) => {
    cancelAnimationFrame(animacion);
    if (e.touches.length !== 1) {   // un segundo dedo: es un pellizco, cosa de Google
      if (gesto) { gesto = null; ultimo = null; }
      primero = null; abajo = null; decision = null;
      return;
    }
    const t = e.touches[0], p = dentro(t.clientX, t.clientY), ahora = performance.now();
    if (esSegundo(p, e)) {
      if (e.cancelable) e.preventDefault();
      e.stopPropagation();
      const c = mundo(mapa.getCenter?.());
      gesto = { id: t.identifier, t: ahora, x0: p.x, y0: p.y, z0: mapa.getZoom() ?? 6, modo: 'quieto', ancla: mundo(pixelALatLng(p.x, p.y)), centro0: c };
      ultimo = p; primero = null; abajo = null;
      return;
    }
    abajo = sobreControl(e) ? null : { id: t.identifier, t: ahora, x: p.x, y: p.y, movido: false };
    primero = null;
  };
  const tMover = (e: TouchEvent) => {
    const g = gesto;
    if (g) {
      const t = Array.from(e.touches).find((x) => x.identifier === g.id);
      if (!t) return;
      if (e.cancelable) e.preventDefault();
      e.stopPropagation();
      const p = dentro(t.clientX, t.clientY), dx = p.x - g.x0, dy = p.y - g.y0;
      if (g.modo === 'quieto' && Math.hypot(dx, dy) >= ARRANQUE_PX) {
        g.modo = Math.abs(dx) > Math.abs(dy) * 1.5 ? 'mover' : 'zoom';
        // El zoom cuenta desde donde arranca, para que no dé un salto al empezar.
        if (g.modo === 'zoom') g.y0 = p.y;
      }
      ultimo = p;
      if (g.modo !== 'quieto') cuadro ||= requestAnimationFrame(aplicar);
      return;
    }
    if (abajo) {
      const t = Array.from(e.touches).find((x) => x.identifier === abajo!.id);
      if (t) { const p = dentro(t.clientX, t.clientY); if (Math.hypot(p.x - abajo.x, p.y - abajo.y) > 10) abajo.movido = true; }
    }
  };
  const tSoltar = (e: TouchEvent) => {
    const ahora = performance.now();
    const g = gesto;
    if (g && Array.from(e.changedTouches).some((x) => x.identifier === g.id)) {
      if (e.cancelable) e.preventDefault();
      e.stopPropagation();
      if (cuadro) { cancelAnimationFrame(cuadro); aplicar(); }
      if (g.modo === 'quieto' && e.type === 'touchend' && ahora - g.t < TOQUE_MS) acercarUnNivel(g);
      gesto = null; ultimo = null; primero = null; abajo = null;
      return;
    }
    // Un toque limpio (corto, sin moverse y con un solo dedo) es candidato a primer toque.
    const a = abajo;
    primero = a && e.type === 'touchend' && e.touches.length === 0 && !a.movido && ahora - a.t < TOQUE_MS
      && Array.from(e.changedTouches).some((x) => x.identifier === a.id) ? { t: ahora, x: a.x, y: a.y } : null;
    abajo = null;
  };

  const o = { capture: true, passive: false } as const;
  const escuchas: [string, EventListener][] = [
    ['pointerdown', pBajar as EventListener], ['pointermove', pSeguir as EventListener], ['pointerup', pSeguir as EventListener], ['pointercancel', pSeguir as EventListener],
    ['touchstart', tBajar as EventListener], ['touchmove', tMover as EventListener], ['touchend', tSoltar as EventListener], ['touchcancel', tSoltar as EventListener],
  ];
  for (const [n, f] of escuchas) div.addEventListener(n, f, o);
  return () => {
    cancelAnimationFrame(cuadro); cancelAnimationFrame(animacion);
    for (const [n, f] of escuchas) div.removeEventListener(n, f, o);
  };
}
