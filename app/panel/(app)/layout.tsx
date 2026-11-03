import Link from 'next/link';
import { sesion, iniciales, esDynamo } from '@/lib/sesion';
import PantallaMantenimiento from '@/components/PantallaMantenimiento';
import SinConfigurar from '@/components/SinConfigurar';
import Marco from '@/components/panel/Marco';
import './dashboard.css';
import './ajustes.css';

export const dynamic = 'force-dynamic';

// Marco común del panel (menú lateral + barra superior), con el diseño de dashboard.html.
export default async function LayoutPanel({ children }: { children: React.ReactNode }) {
  const s = await sesion();
  if (!s) return <SinConfigurar />;
  const { supabase, user, perfil, empresa } = s;
  const nombre = perfil?.nombre || user.email || '';
  // Modo mantenimiento (lo enciende Dynamo): clientes y transportistas no entran.
  const { data: mant } = await supabase.rpc('mantenimiento_activo');
  const dynamo = esDynamo(perfil?.rol);
  if (mant && !dynamo) return <PantallaMantenimiento />;
  return (
    <Marco rol={perfil?.rol ?? 'cliente'} nombre={nombre} email={user.email ?? ''}
           empresa={empresa} iniciales={iniciales(perfil?.nombre, user.email ?? '')}>
      {mant && (
        <div className="pt-aviso error" style={{ marginBottom: '0.9rem' }}>
          <div><strong>Modo mantenimiento ACTIVADO:</strong> clientes y transportistas no pueden entrar ni aceptar cargas. <Link href="/panel/mantenimiento" style={{ color: 'inherit', fontWeight: 800 }}>Desactivarlo →</Link></div>
        </div>
      )}
      {children}
    </Marco>
  );
}
