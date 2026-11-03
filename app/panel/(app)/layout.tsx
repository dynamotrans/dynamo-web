import { sesion, iniciales } from '@/lib/sesion';
import SinConfigurar from '@/components/SinConfigurar';
import Marco from '@/components/panel/Marco';
import './dashboard.css';
import './ajustes.css';

export const dynamic = 'force-dynamic';

// Marco común del panel (menú lateral + barra superior), con el diseño de dashboard.html.
export default async function LayoutPanel({ children }: { children: React.ReactNode }) {
  const s = await sesion();
  if (!s) return <SinConfigurar />;
  const { user, perfil, empresa } = s;
  const nombre = perfil?.nombre || user.email || '';
  return (
    <Marco rol={perfil?.rol ?? 'cliente'} nombre={nombre} email={user.email ?? ''}
           empresa={empresa} iniciales={iniciales(perfil?.nombre, user.email ?? '')}>
      {children}
    </Marco>
  );
}
