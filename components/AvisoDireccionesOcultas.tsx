// Caja roja del transportista mientras falten las matrículas. Desde el 2026-11-20 las
// direcciones se ven siempre (usuario: «ocultar direcciones, mejor no»): solo queda el aviso
// del DeCA, el mismo texto que la orden de carga en PDF y su email.
export default function AvisoDireccionesOcultas({ style }: { style?: React.CSSProperties }) {
  return (
    <div id="aviso-deca-matriculas" role="alert" style={{ background: '#fde8e8', border: '1px solid #dc2626', borderLeft: '5px solid #dc2626',
      borderRadius: 10, padding: '0.75rem 0.9rem', color: '#8c1414', textAlign: 'left', lineHeight: 1.45, ...style }}>
      <strong>DeCA:</strong> Les rogamos nos faciliten las <strong>MATRÍCULAS</strong> del vehículo; de no recibirlas, entenderemos que el transportista efectivo gestiona el DeCA conforme a la Orden FOM/2861/2012, quedando nuestra empresa exenta de cualquier responsabilidad derivada de su emisión u omisión.
    </div>
  );
}
