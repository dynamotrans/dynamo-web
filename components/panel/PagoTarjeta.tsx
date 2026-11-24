'use client';

// «PAGAR CON TARJETA» EN UNA VENTANA, sin salir de la plataforma (usuario, 2026-11-23: «la
// ventana de pago me saca de la plataforma»; «quiero Apple Pay, Google Pay, pago con tarjeta
// normal»). El botón abre una ventana nuestra y dentro pinta el formulario de pago de Stripe
// (él enseña la tarjeta y, donde el dispositivo y el dominio lo permiten, Apple Pay y Google
// Pay). El importe lo pone el servidor; aquí no viaja ningún precio ni ningún dato de tarjeta.
// RESPALDO: si no hay clave pública de Stripe, si su script no carga o si algo falla al
// montarlo, el botón hace lo de siempre: lleva a la página de pago de Stripe.
// Al terminar, el envío pasa a pagado cuando Stripe nos avisa (segundos): se vuelve a la
// ficha con «pago=ok», igual que al volver de su página.
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Modal from './Modal';

type PaginaPago = { mount: (donde: string | HTMLElement) => void; destroy: () => void };
type OpcionesPago = { fetchClientSecret: () => Promise<string>; onComplete?: () => void };
type StripeJs = {
  createEmbeddedCheckoutPage?: (o: OpcionesPago) => Promise<PaginaPago>;   // nombre desde marzo de 2026
  initEmbeddedCheckout?: (o: OpcionesPago) => Promise<PaginaPago>;         // nombre anterior
};
declare global { interface Window { Stripe?: (clave: string) => StripeJs } }

// El script de Stripe se carga siempre desde su casa (no se puede copiar): primero la versión
// con nombre y, si esa dirección no existiera, la de siempre.
const SCRIPTS = ['https://js.stripe.com/dahlia/stripe.js', 'https://js.stripe.com/v3/'];
function cargarStripe(): Promise<(clave: string) => StripeJs> {
  if (window.Stripe) return Promise.resolve(window.Stripe);
  const probar = (i: number): Promise<(clave: string) => StripeJs> => new Promise((vale, falla) => {
    const s = document.createElement('script');
    s.src = SCRIPTS[i]; s.async = true;
    s.onload = () => (window.Stripe ? vale(window.Stripe) : falla(new Error('Stripe no se ha cargado.')));
    s.onerror = () => { s.remove(); if (i + 1 < SCRIPTS.length) probar(i + 1).then(vale, falla); else falla(new Error('Stripe no se ha cargado.')); };
    document.head.appendChild(s);
  });
  return probar(0);
}

const AVISOS: Record<string, string> = {
  caducado: 'El plazo para pagar este envío ha terminado.',
  ya: 'Este envío ya no está pendiente de pago. Recarga la página para verlo al día.',
  sesion: 'Tu sesión ha caducado. Vuelve a entrar y repite el pago.',
  no_disponible: 'El pago con tarjeta no está disponible ahora mismo.',
};

export default function PagoTarjeta({ envioId, texto, id }: { envioId: string; texto: string; id?: string }) {
  const [abierta, setAbierta] = useState(false);
  const [estado, setEstado] = useState<'cargando' | 'lista' | 'aviso'>('cargando');
  const [aviso, setAviso] = useState<string | null>(null);
  const formulario = useRef<HTMLFormElement>(null);
  const caja = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierta) return;
    let vivo = true;
    let pagina: PaginaPago | null = null;
    // El respaldo: la página de pago de Stripe, como hasta ahora.
    const aSuPagina = () => { if (vivo) formulario.current?.submit(); };
    (async () => {
      try {
        const r = await fetch('/api/stripe/pago', { method: 'POST', body: new URLSearchParams({ envio: envioId, modo: 'incrustado' }) });
        const j = await r.json() as { ok: boolean; codigo?: string; secreto?: string; clave?: string };
        if (!vivo) return;
        if (!j.ok || !j.secreto || !j.clave) {
          if (j.codigo && AVISOS[j.codigo]) { setAviso(AVISOS[j.codigo]); setEstado('aviso'); return; }
          aSuPagina(); return;
        }
        const stripe = (await cargarStripe())(j.clave);
        const crear = stripe.createEmbeddedCheckoutPage ?? stripe.initEmbeddedCheckout;
        if (!crear) { aSuPagina(); return; }
        const secreto = j.secreto;
        const p = await crear.call(stripe, { fetchClientSecret: async () => secreto,
          onComplete: () => { window.location.assign(`/panel/envios?ver=${encodeURIComponent(envioId)}&pago=ok`); } });
        // La ventana puede tardar un instante en pintarse: se espera a tener dónde montar.
        for (let i = 0; i < 40 && vivo && !caja.current; i++) await new Promise((ok) => setTimeout(ok, 50));
        if (!vivo || !caja.current) { p.destroy(); if (vivo) aSuPagina(); return; }
        pagina = p; p.mount(caja.current); setEstado('lista');
      } catch { aSuPagina(); }
    })();
    return () => { vivo = false; try { pagina?.destroy(); } catch { /* ya no está */ } };
  }, [abierta, envioId]);

  return (
    <>
      {/* El formulario de siempre: lo usa el respaldo (y quien no tenga JavaScript). */}
      <form ref={formulario} action="/api/stripe/pago" method="post" style={{ display: 'contents' }}
        onSubmit={(e) => { e.preventDefault(); setAviso(null); setEstado('cargando'); setAbierta(true); }}>
        <input type="hidden" name="envio" value={envioId} />
        <button type="submit" className="btn-primary" id={id}>{texto}</button>
      </form>
      {/* Colgada del cuerpo de la página: el botón vive dentro de la ficha del envío, que es otra
          ventana, y una ventana pintada dentro de otra queda descolocada (fuera de la vista). */}
      {abierta && createPortal(
        <Modal titulo="Pagar con tarjeta" sub="Pago seguro con Stripe. Dynamo no ve ni guarda los datos de tu tarjeta." abierto
          onCerrar={() => setAbierta(false)} ancho={560}>
          <div id="pago-ventana" className="pago-ventana">
            {estado === 'cargando' && <p className="meta" role="status" style={{ margin: '1.2rem 0', textAlign: 'center' }}>Preparando el pago…</p>}
            {estado === 'aviso' && <p className="pt-aviso" role="alert" style={{ margin: 0 }}>{aviso}</p>}
            <div ref={caja} id="pago-stripe" />
          </div>
        </Modal>, document.body)}
    </>
  );
}
