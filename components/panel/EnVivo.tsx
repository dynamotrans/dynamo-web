'use client';

// PLATAFORMA EN VIVO (usuario, 2026-11-06): lo que cambia en la base de datos aparece solo,
// sin refrescar. La base de datos manda una señal SIN DATOS por Supabase Realtime (canal
// privado: «dynamo», «cliente:<id>», «transportista:<id>» o, en las páginas con enlace,
// «enlace:<sha256>»; ver migraciones en_vivo) y aquí se vuelve a pedir la página al
// servidor (router.refresh), con los permisos de siempre.
//
// REGLA DE ORO: NUNCA SE PIERDE LO QUE EL USUARIO ESTÁ ESCRIBIENDO (usuario, 2026-11-06:
// «se queda en blanco lo que tenía relleno», «me borra la búsqueda»). Por eso NO se
// refresca solo:
//  · si en esta página has escrito o cambiado algún campo (formulario, buscador, ventana):
//    sale el aviso «Hay novedades · Actualizar» y decides tú. Vuelve a ser automático al
//    cambiar de página o de dirección (p. ej. cuando el buscador ya ha buscado);
//  · si hay una ventana abierta o el cursor está en un campo;
//  · si has tocado, pulsado o escrito algo hace menos de 5 s (a medias de algo);
//  · con la pestaña en segundo plano (se pone al día al volver).
// Además: varias señales seguidas = un solo refresco (1 s de calma, como mucho 4 s); al
// reconectar se refresca por si se perdió algo; la campana se recarga cuando ya ha llegado
// la página.
// Causa de que a veces no se pintara (resuelta 2026-11-06): el loading.tsx del panel; ya no
// existe (el cargador al navegar lo pone CargandoNavegacion). Por eso NO hay segundo refresco.
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseNavegador } from '@/lib/supabase/navegador';
import { EVENTO_RECARGAR } from './TirarParaRecargar';

const CALMA_MS = 1000;
const MAX_ESPERA_MS = 4000;
const REVISAR_MS = 1500;
const QUIETO_MS = 5000;      // tiempo sin tocar nada antes de refrescar solo

// Para revisar en el navegador: localStorage.setItem('dynamo:envivo', '1') y mirar la consola.
const traza = (...a: unknown[]) => { try { if (localStorage.getItem('dynamo:envivo')) console.info('[en vivo]', ...a); } catch { /* sin almacenamiento */ } };

const esCampo = (t: EventTarget | null): t is HTMLElement =>
  t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName));

// marca: la pone el servidor en cada render del marco; cuando cambia, ha llegado la página
// nueva y entonces se recarga la campana. Las páginas con enlace (sin cuenta) no la usan.
export default function EnVivo({ canales, marca = 0 }: { canales: string[]; marca?: number }) {
  const router = useRouter();
  const campana = useRef(false);
  const pendiente = useRef(false);
  const primera = useRef<number | null>(null);
  const reloj = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [aviso, setAviso] = useState(false);
  const avisoCerrado = useRef(false);   // «Ahora no»: no vuelve a salir hasta la próxima novedad
  // Página «tocada»: dirección en la que se escribió algo (null = nada escrito).
  const tocada = useRef<string | null>(null);
  const ultimoGesto = useRef(0);
  const clave = canales.join('|');

  // Qué está haciendo el usuario: escribir en un campo marca la página; cualquier gesto
  // (tecla, toque, clic) retrasa el refresco unos segundos.
  useEffect(() => {
    const gesto = () => { ultimoGesto.current = Date.now(); };
    const escribe = (e: Event) => {
      gesto();
      if (esCampo(e.target) && !e.target.closest('[data-envivo-ignorar]')) tocada.current = location.href;
    };
    document.addEventListener('keydown', gesto, true);
    document.addEventListener('pointerdown', gesto, true);
    document.addEventListener('input', escribe, true);
    document.addEventListener('change', escribe, true);
    return () => {
      document.removeEventListener('keydown', gesto, true);
      document.removeEventListener('pointerdown', gesto, true);
      document.removeEventListener('input', escribe, true);
      document.removeEventListener('change', escribe, true);
    };
  }, []);

  useEffect(() => {
    const sb = supabaseNavegador();
    if (!sb || !clave) return;
    const lista = clave.split('|');

    // Por qué no se puede refrescar ahora (null = sí se puede).
    const motivo = (): string | null => {
      if (tocada.current && tocada.current !== location.href) tocada.current = null;   // ya cambió de página o de búsqueda
      if (tocada.current) return 'escrito';
      if (document.hidden) return 'oculta';
      if (document.querySelector('[aria-modal="true"]')) return 'ventana';
      if (esCampo(document.activeElement)) return 'campo';
      if (Date.now() - ultimoGesto.current < QUIETO_MS) return 'gesto';
      return null;
    };

    const pedir = () => { campana.current = true; router.refresh(); };
    const refrescar = () => {
      const m = motivo();
      if (m) {
        traza('espera', m);
        pendiente.current = true;
        // Si es porque has escrito, no se sabe cuándo acabarás: se avisa y decides tú.
        if (m === 'escrito' && !avisoCerrado.current) setAviso(true);
        return;
      }
      traza('refresca');
      pendiente.current = false; primera.current = null; setAviso(false);
      pedir();
    };
    const señal = (m?: { payload?: unknown }) => {
      traza('señal', m?.payload);
      avisoCerrado.current = false;
      const ahora = Date.now();
      primera.current ??= ahora;
      if (reloj.current) clearTimeout(reloj.current);
      const espera = Math.max(0, Math.min(CALMA_MS, primera.current + MAX_ESPERA_MS - ahora));
      reloj.current = setTimeout(refrescar, espera);
    };
    // Lo que quedó esperando se aplica en cuanto se pueda.
    const revisar = setInterval(() => { if (pendiente.current) refrescar(); }, REVISAR_MS);
    const alVolver = () => { if (!document.hidden && pendiente.current) refrescar(); };
    document.addEventListener('visibilitychange', alVolver);

    let vivo = true;
    const suscritos: ReturnType<typeof sb.channel>[] = [];
    (async () => {
      await sb.auth.getSession();
      await sb.realtime.setAuth();
      if (!vivo) return;
      for (const nombre of lista) {
        let yaEstuvo = false;
        const ch = sb.channel(nombre, { config: { private: true } })
          .on('broadcast', { event: 'cambio' }, señal)
          .subscribe((estado, err) => {
            traza(nombre, estado, err?.message ?? '');
            if (estado === 'SUBSCRIBED') { if (yaEstuvo) señal(); yaEstuvo = true; }
          });
        suscritos.push(ch);
      }
    })();

    return () => {
      vivo = false;
      clearInterval(revisar);
      if (reloj.current) clearTimeout(reloj.current);
      document.removeEventListener('visibilitychange', alVolver);
      for (const ch of suscritos) sb.removeChannel(ch);
    };
  }, [clave, router]);

  // La campana, cuando ya ha llegado la página nueva (cambia la marca), nunca a la vez:
  // si las dos peticiones al servidor se cruzan, Next.js puede quedarse con la vieja.
  useEffect(() => {
    if (campana.current) { campana.current = false; window.dispatchEvent(new Event(EVENTO_RECARGAR)); }
  }, [marca]);

  if (!aviso) return null;
  const boton: React.CSSProperties = { border: 0, borderRadius: 999, padding: '0.45rem 0.9rem', fontWeight: 800, cursor: 'pointer', font: 'inherit' };
  return (
    <div role="status" style={{ position: 'fixed', left: '50%', bottom: 'calc(1rem + env(safe-area-inset-bottom))', transform: 'translateX(-50%)', zIndex: 1200,
      display: 'flex', alignItems: 'center', gap: '0.5rem', background: '#0a0230', color: '#fff', borderRadius: 999, padding: '0.35rem 0.4rem 0.35rem 1rem',
      boxShadow: '0 8px 24px rgba(10,2,48,0.3)', fontSize: '0.9rem', maxWidth: 'calc(100vw - 2rem)' }}>
      <span>Hay novedades</span>
      <button type="button" style={{ ...boton, background: '#22a55a', color: '#fff', fontWeight: 800 }}
        onClick={() => { pendiente.current = false; tocada.current = null; setAviso(false); campana.current = true; router.refresh(); }}>Actualizar</button>
      <button type="button" aria-label="Ahora no" style={{ ...boton, background: 'transparent', color: '#fff', padding: '0.45rem 0.6rem' }}
        onClick={() => { avisoCerrado.current = true; setAviso(false); }}>✕</button>
    </div>
  );
}
