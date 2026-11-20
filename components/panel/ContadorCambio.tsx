'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import Modal from '@/components/panel/Modal';
import { anularCambioEnvio } from '@/app/panel/(app)/envios/acciones';
import type { CambioPendiente } from '@/lib/envios';

// ---- Contador de 30 s para anular un cambio (usuario, 2026-11-20) -------------------------
// «TODOS DEBEN ESPERAR… PONER SPINNER SEGUNDOS EN DETALLE Y EN LISTADO… PODER DESHACER ESE
// CAMBIO PULSANDO SPINNER Y SALE VENTANA DE ¿DESEA ANULAR EL CAMBIO REALIZADO?».
// Todos los emails esperan 30 s antes de salir. Mientras corren, la lista y la ficha enseñan
// un anillo que se vacía; al pulsarlo se puede anular: el envío vuelve a como estaba y no se
// avisa a nadie. Lo ven Dynamo y quien hizo el cambio (la base de datos ya filtra).

const TEXTOS: Record<string, { que: string; efecto: string }> = {
  creado: { que: 'Envío recién creado', efecto: 'El envío quedará anulado sin coste y no se avisará a nadie: ni a los sitios, ni al transportista, ni a Dynamo.' },
  modificado: { que: 'Cambio en el envío', efecto: 'El envío volverá a como estaba antes del cambio (fechas, ruta, mercancía…) y no saldrá ningún aviso.' },
  cancelado: { que: 'Cancelación del envío', efecto: 'La cancelación se deshace: el envío vuelve a estar como antes y no se avisa a nadie.' },
  asignado: { que: 'Asignación del transportista', efecto: 'El envío vuelve a como estaba antes de asignarlo y al transportista no le llega nada.' },
  email: { que: 'Email preparado', efecto: 'El email no saldrá. El envío no cambia.' },
};

function segundosHasta(iso: string): number {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 1000));
}

export default function ContadorCambio({ envio, referencia, pendiente, barra = false }: {
  envio: string; referencia?: string; pendiente: CambioPendiente | null | undefined; barra?: boolean;
}) {
  const router = useRouter();
  // Sin segundos en el servidor: el reloj del navegador decide (evita el baile al hidratar).
  const [seg, setSeg] = useState<number | null>(null);
  const [total, setTotal] = useState(30);
  const [preguntar, setPreguntar] = useState(false);
  const [trabajando, setTrabajando] = useState(false);
  const [resultado, setResultado] = useState<{ ok: boolean; txt: string } | null>(null);
  // Tras anular, la página se refresca y el pendiente desaparece: la ventana con el
  // resultado sigue con lo último que se vio.
  const [ultimo, setUltimo] = useState<CambioPendiente | null>(pendiente ?? null);
  useEffect(() => { if (pendiente) setUltimo(pendiente); }, [pendiente]);
  const vence = pendiente?.vence_en ?? null;

  useEffect(() => {
    if (!vence) { setSeg(null); return; }
    const s0 = segundosHasta(vence);
    setSeg(s0); setTotal((t) => Math.max(t, s0, 1));
    if (s0 <= 0) return;
    const t = setInterval(() => {
      const s = segundosHasta(vence);
      setSeg(s);
      if (s <= 0) { clearInterval(t); setTimeout(() => router.refresh(), 1500); }
    }, 250);
    return () => clearInterval(t);
  }, [vence, router]);

  const p = pendiente ?? ultimo;
  if (!resultado && (!pendiente || seg === null || (seg <= 0 && !preguntar))) return null;
  if (!p) return null;
  const s = seg ?? 0;
  const txt = TEXTOS[p.tipo] ?? TEXTOS.email;
  // Sin emails esperando (p. ej. un envío con transportista propio): lo que corre es el cambio.
  const queSale = p.emails > 1 ? `Los ${p.emails} avisos` : p.emails === 1 ? 'El aviso' : 'El cambio';
  const verbo = p.emails > 0 ? (p.emails > 1 ? 'salen' : 'sale') : 'se confirma';
  const r = 15, circ = 2 * Math.PI * r;
  const lleno = Math.min(1, s / total);

  async function anular() {
    setTrabajando(true);
    const x = await anularCambioEnvio(envio).catch(() => ({ ok: false as const, error: 'No se ha podido anular. Inténtalo de nuevo.' }));
    setTrabajando(false);
    setResultado(x.ok ? { ok: true, txt: x.aviso ?? 'Cambio anulado.' } : { ok: false, txt: x.error });
    router.refresh();
  }

  const anillo = (
    <span className="cc-anillo" aria-hidden="true">
      <svg viewBox="0 0 36 36" width="100%" height="100%">
        <circle cx="18" cy="18" r={r} className="cc-fondo" />
        <circle cx="18" cy="18" r={r} className="cc-resto" strokeDasharray={circ} strokeDashoffset={circ * (1 - lleno)} />
      </svg>
      <span className="cc-num" suppressHydrationWarning>{s}</span>
    </span>
  );

  const ventana = (preguntar || resultado) && typeof document !== 'undefined' && createPortal(
    // Lo que se pulse aquí no debe llegar a la fila de la lista (abriría la ficha).
    <div onClick={(ev) => ev.stopPropagation()} onMouseDown={(ev) => ev.stopPropagation()} onKeyDown={(ev) => ev.stopPropagation()}>
      <Modal abierto titulo="¿Deseas anular el cambio realizado?" sub={`${txt.que}${referencia ? ` · #${referencia}` : ''}`}
        onCerrar={() => { setPreguntar(false); setResultado(null); }}
        pie={resultado
          ? <button className="btn-primary" onClick={() => { setPreguntar(false); setResultado(null); }}>Entendido</button>
          : <>
              <button className="btn-ghost" onClick={() => setPreguntar(false)} disabled={trabajando}>No, dejarlo así</button>
              <button className="btn-primary" style={{ background: 'var(--red)' }} onClick={anular} disabled={trabajando || s <= 0}>{trabajando ? 'Anulando…' : 'Sí, anular'}</button>
            </>}>
        {resultado
          ? <div className={resultado.ok ? 'modal-ok-box' : 'modal-warn-box'} role="status">{resultado.txt}</div>
          : <>
              <p style={{ margin: '0 0 0.7rem', lineHeight: 1.5 }}>{txt.efecto}</p>
              <div className="cc-ventana-cuenta">
                {anillo}
                <span>{s > 0 ? <>{queSale} {verbo} en <strong suppressHydrationWarning>{s} s</strong>. Hasta entonces se puede anular.</> : p.emails > 0 ? 'El plazo ha terminado: el aviso ya está saliendo.' : 'El plazo ha terminado: el cambio ya está confirmado.'}</span>
              </div>
              {p.autor && <p className="meta" style={{ margin: '0.6rem 0 0' }}>Cambio hecho por <span className="notranslate" translate="no">{p.autor}</span>.</p>}
            </>}
      </Modal>
    </div>, document.body);

  const abrir = (ev: React.MouseEvent) => { ev.preventDefault(); ev.stopPropagation(); if (p.puede_anular) setPreguntar(true); };
  const etiqueta = `${queSale} ${verbo} en ${s} s${p.puede_anular ? '. Pulsa para anular el cambio' : ''}`;
  // Con el plazo cumplido (o ya anulado) solo queda la ventana del resultado.
  if (!pendiente || s <= 0) return <>{ventana}</>;

  return (
    <>
      {barra ? (
        <button type="button" className="cc-barra" onClick={abrir} disabled={!p.puede_anular} aria-label={etiqueta} data-tipo={p.tipo}>
          {anillo}
          <span className="cc-barra-txt">
            <strong>{txt.que}: {queSale.toLowerCase()} {verbo} en <span suppressHydrationWarning>{s} s</span></strong>
            {p.puede_anular && <span>¿Te has equivocado? Pulsa aquí para anularlo.</span>}
          </span>
        </button>
      ) : (
        <button type="button" className="cc-chip" onClick={abrir} disabled={!p.puede_anular} title={etiqueta} aria-label={etiqueta} data-tipo={p.tipo}>
          {anillo}<span className="cc-chip-txt">Anular</span>
        </button>
      )}
      {ventana}
    </>
  );
}
