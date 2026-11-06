'use client';

// PLATAFORMA EN VIVO (usuario, 2026-11-06): lo que cambia en la base de datos aparece solo,
// sin refrescar. La base de datos manda una señal SIN DATOS por Supabase Realtime (canal
// privado: «dynamo», «cliente:<id>» o «transportista:<id>», ver migración en_vivo) y aquí
// se vuelve a pedir la página al servidor (router.refresh), con los permisos de siempre.
//
// Para no molestar:
//  · Varias señales seguidas = un solo refresco (espera 1 s de calma, como mucho 4 s).
//  · Si estás escribiendo o tienes una ventana abierta, espera a que termines.
//  · Con la pestaña en segundo plano no refresca: lo hace al volver, si hubo cambios.
//  · Al reconectar (móvil que se duerme, wifi que cae) refresca por si se perdió algo.
//  · La campana se recarga cuando ya ha llegado la página (nunca a la vez).
import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseNavegador } from '@/lib/supabase/navegador';
import { EVENTO_RECARGAR } from './TirarParaRecargar';

const CALMA_MS = 1000;
const MAX_ESPERA_MS = 4000;
const REVISAR_MS = 1500;
// Un segundo refresco de confirmación poco después del primero. Comprobado (2026-11-06):
// a veces Next.js recibe la página nueva pero no la pinta (el marco sí, la página no); el
// segundo refresco siempre entra. Cuesta una petición más por tanda de cambios, no por señal.
const CONFIRMAR_MS = 2000;

// Para revisar en el navegador: localStorage.setItem('dynamo:envivo', '1') y mirar la consola.
const traza = (...a: unknown[]) => { try { if (localStorage.getItem('dynamo:envivo')) console.info('[en vivo]', ...a); } catch { /* sin almacenamiento */ } };

function ocupado() {
  if (document.querySelector('[aria-modal="true"]')) return true;
  const a = document.activeElement as HTMLElement | null;
  return !!a && (a.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(a.tagName));
}

// marca: la pone el servidor en cada render del marco; cuando cambia, ha llegado la página
// nueva y entonces se recarga la campana.
export default function EnVivo({ canales, marca }: { canales: string[]; marca: number }) {
  const router = useRouter();
  const campana = useRef(false);
  const pendiente = useRef(false);
  const primera = useRef<number | null>(null);
  const reloj = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clave = canales.join('|');

  useEffect(() => {
    const sb = supabaseNavegador();
    if (!sb || !clave) return;
    const lista = clave.split('|');

    let confirmar: ReturnType<typeof setTimeout> | null = null;
    const pedir = () => {
      campana.current = true;
      router.refresh();
      if (confirmar) clearTimeout(confirmar);
      confirmar = setTimeout(() => {
        confirmar = null;
        if (document.hidden || ocupado()) { pendiente.current = true; return; }
        traza('confirma'); router.refresh();
      }, CONFIRMAR_MS);
    };
    const refrescar = () => {
      if (document.hidden || ocupado()) { traza('espera', { oculta: document.hidden }); pendiente.current = true; return; }
      traza('refresca');
      pendiente.current = false; primera.current = null;
      pedir();
    };
    const señal = (m?: { payload?: unknown }) => {
      traza('señal', m?.payload);
      const ahora = Date.now();
      primera.current ??= ahora;
      if (reloj.current) clearTimeout(reloj.current);
      const espera = Math.max(0, Math.min(CALMA_MS, primera.current + MAX_ESPERA_MS - ahora));
      reloj.current = setTimeout(refrescar, espera);
    };
    // Lo que quedó esperando (ventana abierta, escribiendo, pestaña oculta) se aplica al acabar.
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
      if (confirmar) clearTimeout(confirmar);
      document.removeEventListener('visibilitychange', alVolver);
      for (const ch of suscritos) sb.removeChannel(ch);
    };
  }, [clave, router]);

  // La campana, cuando ya ha llegado la página nueva (cambia la marca), nunca a la vez:
  // si las dos peticiones al servidor se cruzan, Next.js puede quedarse con la vieja.
  useEffect(() => {
    if (campana.current) { campana.current = false; window.dispatchEvent(new Event(EVENTO_RECARGAR)); }
  }, [marca]);

  return null;
}
