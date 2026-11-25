'use client';

// Vigilante del «hueco vacío al final» en el iPhone (ver lib/vistaPantalla.ts).
//
// Antes solo se recolocaba la página al cerrar el teclado, que era UNA de las formas de
// llegar al fallo; por las demás (cambiar de una pantalla larga a otra corta, volver a la
// pestaña…) volvía a salir. Ahora no se adivina por dónde llega: cada vez que la pantalla se
// queda quieta se MIDE si está mirando más allá del final de la página y, si lo está, se
// recoloca sola. Y cada vez que pasa queda apuntado (Mantenimiento → Descuadres de pantalla)
// con las medidas de antes y de después, para saber cuándo pasa y si el arreglo sirvió.
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { descuadre, destinoVista, paginaLarga, type MedidaVista } from '@/lib/vistaPantalla';

const ES_CAMPO = /^(INPUT|TEXTAREA|SELECT)$/;

function medir(): MedidaVista {
  const vv = window.visualViewport, a = document.activeElement;
  return {
    y: Math.round(window.scrollY), alto: window.innerHeight, doc: document.documentElement.scrollHeight,
    contenido: document.body ? Math.round(document.body.getBoundingClientRect().bottom + window.scrollY) : null,
    vvAlto: vv ? Math.round(vv.height) : null, vvArriba: vv ? Math.round(vv.offsetTop) : null,
    vvPagina: vv ? Math.round(vv.pageTop) : null, escala: vv ? vv.scale : 1,
    campo: !!a && (ES_CAMPO.test(a.tagName) || (a as HTMLElement).isContentEditable === true),
  };
}

export default function GuardaVista() {
  const ruta = usePathname();
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const esIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (/Mac/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
    const st = { tocando: false, intentos: 0, fallidos: 0, informes: 0, apagado: false, altoVisto: vv.height, dichos: new Set<string>() };
    const relojes = new Set<ReturnType<typeof setTimeout>>();
    let espera: ReturnType<typeof setTimeout> | null = null;
    const luego = (f: () => void, ms: number) => { const t = setTimeout(() => { relojes.delete(t); f(); }, ms); relojes.add(t); return t; };

    const informar = (causa: string, motivo: string, antes: MedidaVista, despues: MedidaVista | null, corregido: boolean) => {
      if (st.informes >= 3) return;   // como mucho 3 por carga de página
      st.informes++;
      try {
        void fetch('/api/vista-informe', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, keepalive: true,
          body: JSON.stringify({ causa, motivo, ruta: window.location.pathname, corregido, antes, despues }),
        }).catch(() => { /* apuntarlo nunca debe romper nada */ });
      } catch { /* igual */ }
    };

    // Recolocar: se mueve la página 1 px y se devuelve a su sitio en el fotograma siguiente,
    // para que el navegador vuelva a calcular dónde está. Si a la primera no basta, a la
    // segunda además se le cambia un instante el alto de la página, que le obliga a rehacer
    // la zona por la que deja desplazarse.
    const recolocar = (m: MedidaVista, intento: number) => {
      const x = window.scrollX, destino = destinoVista(m), h = document.documentElement;
      const previo = h.style.minHeight;
      if (intento > 1) { h.style.minHeight = `${m.doc + 2}px`; void h.offsetHeight; }
      window.scrollTo(x, destino > 0 ? destino - 1 : 1);
      requestAnimationFrame(() => { if (intento > 1) h.style.minHeight = previo; window.scrollTo(x, destino); });
    };

    const comprobar = (motivo: string) => {
      if (st.apagado || st.tocando || document.hidden) return;
      if (document.body.style.position === 'fixed') return;   // pantalla bloqueada a propósito (firma del CMR)
      const antes = medir();
      const causa = descuadre(antes);
      if (!causa) {
        st.intentos = 0;
        if (paginaLarga(antes) && !st.dichos.has(antes.doc + window.location.pathname)) {
          st.dichos.add(antes.doc + window.location.pathname);
          informar('pagina_larga', motivo, antes, null, false);
        }
        return;
      }
      if (st.intentos >= 2) return;   // dos intentos por vez: no se pelea con el navegador
      st.intentos++;
      recolocar(antes, st.intentos);
      luego(() => {
        const despues = medir(), bien = !descuadre(despues);
        if (!bien && ++st.fallidos >= 3) st.apagado = true;   // no sirve en este teléfono: se deja de tocar
        informar(causa, motivo, antes, despues, bien);
      }, 450);
    };
    // Se comprueba cuando la pantalla lleva un momento quieta (no en mitad de un rebote).
    const programar = (motivo: string, ms = 250) => { if (espera) clearTimeout(espera); espera = setTimeout(() => { espera = null; comprobar(motivo); }, ms); };

    // Solo iPhone/iPad: empujón de 1 px aunque las medidas parezcan buenas, porque a veces
    // el fallo no se deja medir. Al cerrar el teclado y al cambiar de pantalla.
    const empujar = () => {
      if (!esIOS || st.apagado || st.tocando || document.body.style.position === 'fixed') return;
      const m = medir();
      if (m.campo || Math.abs(m.escala - 1) > 0.01) return;
      recolocar(m, 1);
    };

    const alScroll = () => programar('scroll');
    const alTocar = () => { st.tocando = true; };
    const alSoltar = () => { st.tocando = false; programar('toque', 400); };
    const alCambiarZona = () => {
      const cerroTeclado = vv.height > st.altoVisto + 80;
      st.altoVisto = vv.height;
      if (cerroTeclado) luego(empujar, 120);
      programar(cerroTeclado ? 'teclado' : 'zona', cerroTeclado ? 400 : 300);
    };
    const alSalirDeCampo = (e: FocusEvent) => {
      if (!(e.target instanceof HTMLElement) || !ES_CAMPO.test(e.target.tagName)) return;
      luego(empujar, 150); programar('teclado', 450);
    };
    const alVolver = () => programar('volver', 400);

    window.addEventListener('scroll', alScroll, { passive: true });
    window.addEventListener('touchstart', alTocar, { passive: true });
    window.addEventListener('touchend', alSoltar, { passive: true });
    window.addEventListener('touchcancel', alSoltar, { passive: true });
    window.addEventListener('pageshow', alVolver);
    window.addEventListener('orientationchange', alVolver);
    document.addEventListener('visibilitychange', alVolver);
    document.addEventListener('focusout', alSalirDeCampo);
    vv.addEventListener('resize', alCambiarZona);
    vv.addEventListener('scroll', alScroll);
    // Al entrar en esta pantalla (también al venir de otra más larga).
    luego(empujar, 350);
    luego(() => comprobar('pantalla'), 600);
    luego(() => comprobar('pantalla'), 1500);
    return () => {
      window.removeEventListener('scroll', alScroll);
      window.removeEventListener('touchstart', alTocar);
      window.removeEventListener('touchend', alSoltar);
      window.removeEventListener('touchcancel', alSoltar);
      window.removeEventListener('pageshow', alVolver);
      window.removeEventListener('orientationchange', alVolver);
      document.removeEventListener('visibilitychange', alVolver);
      document.removeEventListener('focusout', alSalirDeCampo);
      vv.removeEventListener('resize', alCambiarZona);
      vv.removeEventListener('scroll', alScroll);
      if (espera) clearTimeout(espera);
      relojes.forEach((t) => clearTimeout(t));
    };
  }, [ruta]);
  return null;
}
