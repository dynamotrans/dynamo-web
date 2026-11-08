'use client';

// «Ver ejemplo →» del email de avisos del sitio (openEjemploAvisoSitio de dashboard.html):
// lo que recibiría el sitio, en recogida y en entrega. Desplegable dentro de la ficha.
import { useState } from 'react';

function Cuerpo({ tipo, cliente }: { tipo: 'recogida' | 'entrega'; cliente: string }) {
  const rec = tipo === 'recogida';
  const caja = { border: '1px solid var(--gray-200)', borderRadius: 10, overflow: 'hidden' as const };
  return (
    <>
      {/* La explicación de la discreción va ARRIBA, antes del email de ejemplo. */}
      <div style={{ marginBottom: '0.8rem', padding: '0.7rem 0.8rem', background: 'rgba(51,0,204,0.06)', border: '1px solid rgba(51,0,204,0.18)', borderRadius: 10, fontSize: 'var(--fs-m)', lineHeight: 1.55, color: 'var(--gray-700)' }}>
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ verticalAlign: -2 }}><rect width="18" height="11" x="3" y="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>{' '}
        <strong>Fíjate en lo que NO lleva el aviso</strong>: ni el origen ni el destino de la mercancía, ni precios, ni quién es el remitente o destinatario final.{' '}
        {rec
          ? <>El <strong>cargador</strong> donde recogemos <strong>no ve ni se le muestra el destino</strong>: solo sabe que <strong>{cliente}</strong> le recoge mercancía de su parte.</>
          : <>El <strong>destinatario</strong> que recibe el aviso <strong>no lee el sitio de carga</strong>: solo sabe que <strong>{cliente}</strong> le envía mercancía.</>}{' '}
        Se muestra <strong>quién gestiona el transporte, pero nunca de dónde a dónde</strong>. <strong>Discreción comercial garantizada.</strong>
      </div>
      <div style={caja}>
        <div style={{ background: 'var(--gray-100)', padding: '0.6rem 0.8rem', fontSize: 'var(--fs-s)', color: 'var(--gray-700)' }}>
          <div><strong>De:</strong> avisos@dynamotrans.com</div>
          <div><strong>Para:</strong> almacen@empresa.com</div>
          <div><strong>Asunto:</strong> {rec ? 'Aviso de recogida' : 'Aviso de entrega'} · Vie 18/07 · previsión 10:30-12:00 (pedido PED-0424)</div>
        </div>
        <div style={{ padding: '0.8rem', fontSize: 'var(--fs-m)', lineHeight: 1.6, color: 'var(--gray-700)' }}>
          Buenos días,<br /><br />
          <strong>{cliente}</strong> ha gestionado un transporte para <strong>{rec ? 'recoger' : 'entregar'} mercancía en vuestras instalaciones</strong>.<br /><br />
          <strong style={{ color: 'var(--navy)' }}>Lugar de {rec ? 'recogida' : 'entrega'} (vuestras instalaciones)</strong><br />
          · <strong>Empresa</strong>: Almacenes del Genil S.L. · Almacén / Nave<br />
          · <strong>Dirección</strong>: C. Francia, 78 · 18360 Huétor Tájar, Granada<br />
          · <strong>Horario</strong>: 8:00-16:00 · <strong>Tel.</strong> +34 645 89 87 95<br />
          · <strong>Contacto</strong>: Marina Robles · almacen@empresa.com<br /><br />
          <strong style={{ color: 'var(--navy)' }}>El transporte</strong><br />
          · <strong>Día</strong>: viernes 18/07 · previsión de llegada <strong>10:30-12:00</strong><br />
          · <strong>Mercancía</strong>: paletizada · 6 palets · 4.800 kg<br />
          · <strong>Nº de pedido</strong>: PED-0424<br />
          · <strong>Camión</strong>: matrícula 4512-MKL · conductor Andrés G.<br /><br />
          {rec ? 'Por favor, tened la mercancía preparada para la carga.' : 'Por favor, tened preparada la recepción de la mercancía.'} Os avisaremos si la previsión de hora cambia.
        </div>
      </div>
    </>
  );
}

export default function EjemploAviso({ cliente }: { cliente?: string }) {
  const nombre = (cliente ?? '').trim() || 'Tu empresa';
  const [abierto, setAbierto] = useState(false);
  const [tipo, setTipo] = useState<'recogida' | 'entrega'>('recogida');
  return (
    <>
      <button type="button" onClick={() => setAbierto((x) => !x)} aria-expanded={abierto}
        style={{ background: 'none', border: 'none', padding: 0, color: 'var(--purple)', fontWeight: 800, cursor: 'pointer', font: 'inherit', textDecoration: 'underline' }}>
        {abierto ? 'Ocultar ejemplo' : 'Ver ejemplo →'}
      </button>
      {abierto && (
        <div style={{ marginTop: '0.6rem' }}>
          <div className="aviso-tipo-toggle">
            {(['recogida', 'entrega'] as const).map((t) => (
              <button key={t} type="button" className={`aviso-tipo-btn${tipo === t ? ' active' : ''}`} onClick={() => setTipo(t)}>{t === 'recogida' ? 'Recogida' : 'Entrega'}</button>
            ))}
          </div>
          <Cuerpo tipo={tipo} cliente={nombre} />
        </div>
      )}
    </>
  );
}
