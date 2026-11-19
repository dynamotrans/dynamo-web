// Caja roja del transportista mientras falten las matrículas (usuario, 2026-11-19): el
// envío está confirmado, pero no ve las direcciones (solo el código postal) ni el eCMR
// hasta que las dé. El mismo mensaje que la orden de carga en PDF y su email.
export default function AvisoDireccionesOcultas({ style }: { style?: React.CSSProperties }) {
  return (
    <div id="aviso-direcciones-ocultas" role="alert" style={{ background: '#fde8e8', border: '1px solid #dc2626', borderLeft: '5px solid #dc2626',
      borderRadius: 10, padding: '0.75rem 0.9rem', color: '#8c1414', textAlign: 'left', lineHeight: 1.45, ...style }}>
      <div style={{ fontWeight: 900, marginBottom: '0.3rem' }}>DIRECCIONES OCULTAS HASTA RECIBIR LAS MATRÍCULAS</div>
      <div style={{ marginBottom: '0.3rem' }}><strong>El envío está confirmado.</strong> Danos las <strong>matrículas</strong> (tractora y semirremolque) y te mandamos <strong>al momento</strong> la orden de carga con las direcciones de carga y descarga.</div>
      <div><strong>Sin matrículas no se carga:</strong> las comunicamos a los almacenes antes de que llegue el camión.</div>
    </div>
  );
}
