'use client';

// AVISOS POR WHATSAPP (usuario, 2026-11-25): el permiso de cada usuario para recibir también por
// WhatsApp, en su móvil, los avisos que hoy le llegan por email. Dos piezas:
//  · TarjetaAvisosWhatsApp: la tarjeta de Mi cuenta, para darlo o quitarlo cuando quiera.
//  · PreguntaAvisosWhatsApp: la pregunta única a los usuarios de antes (banda arriba del panel),
//    que desaparece al contestar «Sí» o «Ahora no».
import { useState } from 'react';
import Link from 'next/link';
import { useRefrescar } from '@/lib/useRefrescar';
import { telBonito } from '@/lib/paises';
import { cambiarAvisosWhatsApp, noPreguntarAvisosWhatsApp } from '@/app/panel/(app)/mi-cuenta/acciones';

const QUE = 'los avisos de tus envíos (envío creado, pago, transportista asignado, cambios, cancelaciones, incidencias…)';

export function TarjetaAvisosWhatsApp({ activo, telefono, onEditarDatos }: { activo: boolean; telefono: string | null; onEditarDatos: () => void }) {
  const refrescar = useRefrescar();
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function cambiar(v: boolean) {
    setError(null); setTrabajando(true);
    const r = await cambiarAvisosWhatsApp(v).catch(() => ({ ok: false as const, error: 'No se ha podido guardar. Inténtalo de nuevo.' }));
    setTrabajando(false);
    if (!r.ok) { setError(r.error); return; }
    refrescar();
  }
  return (
    <div className="account-card" id="mc-whatsapp">
      <h3 className="account-card-title">Avisos por WhatsApp</h3>
      <p className="account-card-desc">Además del email, te mandamos por WhatsApp {QUE}. Lo puedes quitar cuando quieras.</p>
      <div className="account-row"><span className="account-row-label">Estado</span>
        <span className="account-row-value" id="mc-whatsapp-estado">{activo ? `Activados${telefono ? ` · ${telBonito(telefono)}` : ''}` : 'Desactivados'}</span></div>
      {activo
        ? <button type="button" className="btn-ghost account-edit" disabled={trabajando} onClick={() => cambiar(false)}>Quitar los avisos por WhatsApp</button>
        : telefono
          ? <button type="button" className="btn-secondary account-edit" disabled={trabajando} onClick={() => cambiar(true)}>Recibirlos también por WhatsApp</button>
          : <><p className="account-card-desc">Para activarlos, pon tu móvil en tus datos.</p>
              <button type="button" className="btn-ghost account-edit" onClick={onEditarDatos}>Poner mi móvil</button></>}
      {error && <div className="wiz-warn show" role="status" style={{ marginTop: '0.5rem' }}>⚠ {error}</div>}
    </div>
  );
}

export function PreguntaAvisosWhatsApp({ telefono }: { telefono: string | null }) {
  const refrescar = useRefrescar();
  const [oculta, setOculta] = useState(false);
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (oculta) return null;
  async function si() {
    setError(null); setTrabajando(true);
    const r = await cambiarAvisosWhatsApp(true).catch(() => ({ ok: false as const, error: 'No se ha podido guardar. Inténtalo de nuevo.' }));
    setTrabajando(false);
    if (!r.ok) { setError(r.error); return; }
    setOculta(true); refrescar();
  }
  async function no() {
    setOculta(true);
    await noPreguntarAvisosWhatsApp().catch(() => {});
    refrescar();
  }
  return (
    <div className="pt-aviso info" id="pregunta-whatsapp" role="region" aria-label="Avisos por WhatsApp" style={{ margin: '0 0 1rem' }}>
      <div style={{ display: 'grid', gap: '0.5rem' }}>
        <div><strong>¿Quieres recibir también por WhatsApp {QUE}?</strong> Te seguirán llegando por email igual.</div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          {telefono
            ? <button type="button" className="btn-primary" disabled={trabajando} onClick={si}>Sí, a mi móvil {telBonito(telefono)}</button>
            : <Link className="btn-primary" href="/panel/mi-cuenta" onClick={() => setOculta(true)}>Poner mi móvil</Link>}
          <button type="button" className="btn-ghost" disabled={trabajando} onClick={no}>Ahora no</button>
        </div>
        {error && <div className="wiz-warn show" role="status">⚠ {error}</div>}
      </div>
    </div>
  );
}
