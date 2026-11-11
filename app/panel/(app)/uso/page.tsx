import { sesion } from '@/lib/sesion';
import UsoDynamo from '@/components/panel/UsoDynamo';
import type { MiAutosusp } from '@/components/panel/nuevoEnvio/comun';

export const dynamic = 'force-dynamic';

// «Uso de Dynamo» (usuario, 2026-11-11): lo que el cliente lleva contra los límites de
// uso de la plataforma, con los valores vivos de Parámetros (mi_autosuspension).
export default async function PaginaUso() {
  const s = await sesion();
  if (!s?.perfil) return null;
  const { data } = await s.supabase.rpc('mi_autosuspension');
  return <UsoDynamo datos={(data as MiAutosusp | null) ?? null} />;
}
