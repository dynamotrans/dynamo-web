'use client';

// «Ver todos los horarios del año»: el modal de horarios de atención (teléfono por
// temporada, email/WhatsApp, festivos). Lo abren el menú de Soporte de la barra
// superior (Marco) y la pantalla de Soporte.
import Modal from './Modal';
import { semanaFestivaTexto } from '@/lib/atencion';

export default function ModalHorarios({ onCerrar }: { onCerrar: () => void }) {
  return (
    <Modal abierto titulo="Horarios de atención" sub="Teléfono según temporada · Email y WhatsApp todo el año." onCerrar={onCerrar}
      icono={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>}
      pie={<button className="btn-primary" style={{ flex: 1 }} onClick={onCerrar}>Entendido</button>}>
      <div className="hor-group">
        <div className="hor-group-title"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z" /></svg> Email y WhatsApp</div>
        <div className="hor-row"><span className="hor-when">Todo el año</span><span className="hor-time">Lunes a viernes 8:00–18:00</span></div>
      </div>
      <div className="hor-group">
        <div className="hor-group-title"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" /></svg> Teléfono</div>
        <div className="hor-row"><span className="hor-when">Horario habitual</span><span className="hor-time">Lunes a jueves 9:00–14:00 y 15:00–17:00 · viernes 9:00–14:00</span></div>
        <div className="hor-row"><span className="hor-when">Jornada intensiva</span><span className="hor-time">8:30–15:30</span></div>
        <ul className="hor-intensiva">
          <li>Verano<span className="hor-i-when">15 jun – 1 sep · lunes a viernes</span></li>
          <li>Navidad<span className="hor-i-when">22 dic – 6 ene · lunes a viernes</span></li>
          <li>Semana Santa<span className="hor-i-when">Lunes a miércoles santo</span></li>
          <li>Semana festiva local<span className="hor-i-when">{semanaFestivaTexto()}</span></li>
        </ul>
        <div className="hor-row closed"><span className="hor-when">Agosto (6–27)</span><span className="hor-time">Solo email y WhatsApp</span></div>
      </div>
      <div className="hor-group">
        <div className="hor-group-title"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.11 0-1.99.9-1.99 2L3 20a2 2 0 0 0 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zM5 8V6h14v2H5z" /></svg> Festivos (teléfono cerrado)</div>
        <p className="hor-note" style={{ marginTop: 0 }}>Año Nuevo (1 ene) · Reyes (6 ene) · Día del Trabajo (1 may) · Asunción (15 ago) · Fiesta Nacional (12 oct) · Todos los Santos (1 nov) · Constitución (6 dic) · Inmaculada (8 dic) · Navidad (25 dic) · Jueves y Viernes Santo.</p>
      </div>
      <p className="hor-note">Horario peninsular (Europe/Madrid), se ajusta solo en cada temporada. Email y WhatsApp también cierran domingos y festivos.</p>
    </Modal>
  );
}
