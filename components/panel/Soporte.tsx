'use client';

// Pantalla de SOPORTE (la del mockup, #sec-soporte): «Atención directa» con los tres
// canales y «Horario de atención» con el horario vigente y el modal de todo el año.
// Se abre desde «Soporte» en el menú del usuario; «← Volver» lleva al inicio del perfil.
import { useState } from 'react';
import Link from 'next/link';
import { CONTACTO, HORARIO_ONLINE, horarioTelefono } from '@/lib/atencion';
import ModalHorarios from './ModalHorarios';

export default function Soporte({ inicio }: { inicio: string }) {
  const [horarios, setHorarios] = useState(false);
  return (
    <section className="section active" id="sec-soporte">
      <div className="sec-header">
        <h2>Soporte</h2>
        <Link href={inicio} className="btn-ghost" style={{ textDecoration: 'none' }}>← Volver</Link>
      </div>
      <div className="account-grid">
        <div className="account-card">
          <h3 className="account-card-title">Atención directa</h3>
          <p className="account-card-desc">Estamos para lo que necesites — incidencias urgentes, cambios de última hora o consultas operativas.</p>
          <a href={`mailto:${CONTACTO.email}`} className="support-link">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-10 5L2 7" /></svg>
            {CONTACTO.email}
          </a>
          <a href={CONTACTO.waHref} target="_blank" rel="noopener" className="support-link">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.5 14.4c-.3-.1-1.7-.8-2-.9-.3-.1-.5-.2-.7.2-.2.3-.8.9-1 1.1-.2.2-.4.2-.7.1-.3-.1-1.3-.5-2.4-1.5-.9-.8-1.5-1.8-1.7-2.1-.2-.3 0-.5.1-.6.1-.1.3-.4.4-.6.1-.2.2-.3.3-.5.1-.2 0-.4 0-.5 0-.1-.7-1.6-.9-2.2-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.4 0 1.4 1 2.8 1.2 3 .1.2 2 3 4.8 4.2.7.3 1.2.5 1.6.6.7.2 1.3.2 1.8.1.6-.1 1.7-.7 2-1.4.3-.7.3-1.3.2-1.4-.1-.1-.3-.2-.6-.4z" /><path d="M20.5 3.5C18.3 1.2 15.3 0 12 0 5.4 0 0 5.4 0 12c0 2.1.6 4.2 1.7 6L0 24l6.2-1.6c1.7.9 3.7 1.4 5.7 1.4 6.6 0 12-5.4 12-12 0-3.2-1.2-6.2-3.4-8.4zM12 21.8c-1.8 0-3.6-.5-5.1-1.4l-.4-.2-3.7 1 1-3.6-.2-.4C2.6 15.7 2 13.9 2 12 2 6.5 6.5 2 12 2c2.7 0 5.2 1 7.1 2.9 1.9 1.9 2.9 4.4 2.9 7.1 0 5.5-4.5 11.8-10 11.8z" /></svg>
            WhatsApp directo
          </a>
          <a href={CONTACTO.telHref} className="support-link">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" /></svg>
            {CONTACTO.telefono}
          </a>
        </div>
        <div className="account-card">
          <h3 className="account-card-title">Horario de atención</h3>
          <div className="account-row"><span className="account-row-label">Teléfono</span><span className="account-row-value">{horarioTelefono()}</span></div>
          <div className="account-row"><span className="account-row-label">WhatsApp / Email</span><span className="account-row-value">{HORARIO_ONLINE}</span></div>
          <button type="button" className="support-link" style={{ marginTop: '0.6rem', background: 'none', border: 'none', font: 'inherit', fontWeight: 'inherit', cursor: 'pointer', width: '100%' }} onClick={() => setHorarios(true)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
            Ver todos los horarios del año
          </button>
          <p className="account-card-desc" style={{ marginTop: '0.7rem' }}>Temporadas (verano, Navidad, Semana Santa, agosto), festivos y jornada intensiva. Si tu envío está en curso y necesitas algo urgente, escríbenos por WhatsApp — lo verá un operador de guardia.</p>
        </div>
      </div>
      {horarios && <ModalHorarios onCerrar={() => setHorarios(false)} />}
    </section>
  );
}
