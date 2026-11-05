// Pantalla de MODO MANTENIMIENTO (la del mockup, #maintOverlay de dashboard.html): la ven
// clientes y transportistas mientras Dynamo tiene la plataforma en mantenimiento.
const P_EMAIL = 'M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z';
const P_WA = 'M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884';
const P_TEL = 'M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z';
const P_LLAVE = 'M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z';

export default function PantallaMantenimiento({ conSalir = true }: { conSalir?: boolean }) {
  return (
    <div className="maint-overlay" style={{ position: 'fixed' }}>
      <div className="maint-card">
        <div className="maint-icon">
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={P_LLAVE} /></svg>
        </div>
        <h1 className="maint-title">Plataforma en mantenimiento</h1>
        <p className="maint-sub">Estamos haciendo tareas de mantenimiento y el portal no está disponible ahora mismo. Volvemos enseguida — disculpa las molestias.</p>
        <div className="maint-block">
          <div className="maint-block-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
          </div>
          <div className="maint-block-body">
            <strong>¿Necesitas una factura, un albarán o una orden de carga?</strong>
            <span>Los tienes en tu <strong>correo electrónico</strong>: todos los documentos se envían siempre por email. Revisa tu bandeja de entrada.</span>
          </div>
        </div>
        <div className="maint-block">
          <div className="maint-block-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
          </div>
          <div className="maint-block-body">
            <strong>¿Quieres solicitar un transporte o reportar una incidencia?</strong>
            <span>Contáctanos directamente y te atendemos:</span>
          </div>
        </div>
        <div className="maint-contact">
          <a className="maint-btn maint-btn-email" href="mailto:info@dynamotrans.com"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d={P_EMAIL} /></svg> e-Mail</a>
          <a className="maint-btn maint-btn-wa" href="https://wa.me/34628995709" target="_blank" rel="noopener"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d={P_WA} /></svg> WhatsApp</a>
          <a className="maint-btn maint-btn-tel" href="tel:+34955225945"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d={P_TEL} /></svg> Teléfono</a>
        </div>
        <p className="maint-foot">Dynamo Operador Logístico, S.L.</p>
        {/* Enlace normal a propósito: con <Link> se precargaría y cerraría la sesión sin pulsar. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        {conSalir && <a className="maint-foot" href="/panel/salir" style={{ display: 'block', textDecoration: 'underline' }}>Cerrar sesión</a>}
      </div>
    </div>
  );
}
