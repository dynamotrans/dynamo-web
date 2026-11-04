import Link from 'next/link';
import { sesion, iniciales, esDynamo } from '@/lib/sesion';
import PantallaMantenimiento from '@/components/PantallaMantenimiento';
import SinConfigurar from '@/components/SinConfigurar';
import { RefrescoProvider } from '@/lib/useRefrescar';
import Marco, { type Contadores, type Cobertura } from '@/components/panel/Marco';
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

  // Números del menú lateral y de la campana, cobertura de crédito (cliente) y festivos
  // nacionales de las dos próximas semanas (para el «Vuelvo …» de Álvaro). Una llamada cada uno.
  const hoy = new Date().toISOString().slice(0, 10);
  const enDosSemanas = new Date(Date.now() + 15 * 86400000).toISOString().slice(0, 10);
  const activa = perfil?.estado === 'activa';
  const [cont, cob, fes] = await Promise.all([
    activa ? supabase.rpc('contadores_panel') : Promise.resolve({ data: null }),
    activa && perfil?.rol === 'cliente' ? supabase.rpc('mi_cobertura_credito') : Promise.resolve({ data: null }),
    supabase.rpc('festivos_entre', { p_desde: hoy, p_hasta: enDosSemanas }),
  ]);
  const festivos = ((fes.data ?? []) as { fecha: string; region?: string | null }[]).filter((f) => !f.region).map((f) => f.fecha);
  return (
    <RefrescoProvider>
    <Marco rol={perfil?.rol ?? 'cliente'} nombre={nombre} email={user.email ?? ''}
           empresa={empresa} iniciales={iniciales(perfil?.nombre, user.email ?? '')}
           contadores={(cont.data ?? {}) as Contadores} cobertura={(cob.data ?? null) as Cobertura} festivos={festivos}>
      {mant && (
        <div className="pt-aviso error" style={{ marginBottom: '0.9rem' }}>
          <div><strong>Modo mantenimiento ACTIVADO:</strong> clientes y transportistas no pueden entrar ni aceptar cargas. <Link href="/panel/mantenimiento" style={{ color: 'inherit', fontWeight: 800 }}>Desactivarlo →</Link></div>
        </div>
      )}
      {children}
    </Marco>
    </RefrescoProvider>
  );
}
