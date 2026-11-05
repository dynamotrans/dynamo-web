'use client';

// Medidor de fortaleza de la contraseña (el de crear-password.html). Lo usan la pantalla
// «Crea tu contraseña» y la ventana «Cambiar contraseña» de Mi cuenta.
import { REGLAS_CLAVE, claveValida } from '@/lib/clave';
export { REGLAS_CLAVE, claveValida };
const NIVELES = ['Muy débil', 'Débil', 'Aceptable', 'Buena', 'Fuerte'];
const COLORES = ['#dc2626', '#f97316', '#eab308', '#84cc16', '#22a55a'];


export default function MedidorClave({ clave }: { clave: string }) {
  const cumple = REGLAS_CLAVE.map(([, f]) => f(clave));
  const n = cumple.filter(Boolean).length;
  return (
    <>
      <div style={{ display: 'flex', gap: 4, margin: '0.2rem 0 0.35rem' }} aria-hidden="true">
        {[0, 1, 2, 3, 4].map((i) => <span key={i} style={{ flex: 1, height: 5, borderRadius: 3, background: clave && i < n ? COLORES[n - 1] : 'var(--gray-200)' }} />)}
      </div>
      {clave && <div style={{ fontSize: '0.8rem', fontWeight: 700, color: COLORES[Math.max(0, n - 1)], marginBottom: '0.4rem' }}>{NIVELES[Math.max(0, n - 1)]}</div>}
      <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 1rem', fontSize: '0.82rem', color: 'var(--gray-500)', display: 'grid', gap: 3 }}>
        {REGLAS_CLAVE.map(([t], i) => (
          <li key={t} style={{ color: cumple[i] ? '#0f6b3a' : undefined, fontWeight: cumple[i] ? 700 : 500 }}>{cumple[i] ? '✓' : '·'} {t}</li>
        ))}
      </ul>
    </>
  );
}
