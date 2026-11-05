import { hoyMadrid } from '@/lib/formato';
import Link from 'next/link';
import { sesion, iniciales, esDynamo } from '@/lib/sesion';
import PantallaMantenimiento from '@/components/PantallaMantenimiento';
import SinConfigurar from '@/components/SinConfigurar';
import { RefrescoProvider } from '@/lib/useRefrescar';
import { vistaDe } from '@/lib/vista';
import Marco, { type Contadores, type Cobertura } from '@/components/panel/Marco';
import TirarParaRecargar from '@/components/panel/TirarParaRecargar';
import BotonArriba from '@/components/panel/BotonArriba';
import './dashboard.css';
import './ajustes.css';

export const dynamic = 'force-dynamic';

// Marco común del panel (menú lateral + barra superior), con el diseño de dashboard.html.
export default async function LayoutPanel({ children }: { children: React.ReactNode }) {
  const s = await sesion();
  if (!s) return <SinConfigurar />;
  const { supabase, user, perfil, empresa } = s;
  const nombre = perfil?.nombre || user.email || '';
  const dynamo = esDynamo(perfil?.rol);
  const activa = perfil?.estado === 'activa';
  // Todo lo que pide el marco, a la vez (antes en tres tandas seguidas): modo mantenimiento,
  // «Ver como», números del menú y de la campana, cobertura de crédito (cliente) y festivos
  // nacionales de las dos próximas semanas (para el «Vuelvo …» de Álvaro).
  const [mantR, vista, cont, cob, fes] = await Promise.all([
    supabase.rpc('mantenimiento_activo'),
    vistaDe(supabase, perfil?.rol),
    activa ? supabase.rpc('contadores_panel') : Promise.resolve({ data: null }),
    activa && perfil?.rol === 'cliente' ? supabase.rpc('mi_cobertura_credito') : Promise.resolve({ data: null }),
    supabase.rpc('festivos_entre', { p_desde: hoyMadrid(), p_hasta: hoyMadrid(15) }),
  ]);
  const mant = mantR.data;
  // Modo mantenimiento (lo enciende Dynamo): clientes y transportistas no entran.
  if (mant && !dynamo) return <PantallaMantenimiento />;
  const festivos = ((fes.data ?? []) as { fecha: string; region?: string | null }[]).filter((f) => !f.region).map((f) => f.fecha);
  return (
    <RefrescoProvider>
    <TirarParaRecargar />
    <BotonArriba />
    <Marco rol={perfil?.rol ?? 'cliente'} nombre={nombre} email={user.email ?? ''}
           empresa={empresa} iniciales={iniciales(perfil?.nombre, user.email ?? '')}
           contadores={(cont.data ?? {}) as Contadores} cobertura={(cob.data ?? null) as Cobertura} festivos={festivos}
           vista={vista} verComo={dynamo && activa}>
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
