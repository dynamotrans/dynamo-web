import { sesion, esDynamo } from '@/lib/sesion';
import { vistaDe } from '@/lib/vista';
import UsoDynamo from '@/components/panel/UsoDynamo';
import type { MiAutosusp } from '@/components/panel/nuevoEnvio/comun';

export const dynamic = 'force-dynamic';

// «Uso de Dynamo» (usuario, 2026-11-11): lo que el cliente lleva contra los límites de
// uso de la plataforma, con los valores vivos de Parámetros (mi_autosuspension). El
// equipo de Dynamo la ve con «Ver como» un cliente: los contadores de ESE cliente.
export default async function PaginaUso() {
  const s = await sesion();
  if (!s?.perfil) return null;
  const esEquipo = esDynamo(s.perfil.rol);
  const vista = esEquipo ? await vistaDe(s.supabase, s.perfil.rol) : null;
  const comoCliente = vista?.tipo === 'cliente' ? vista : null;
  const { data } = await s.supabase.rpc('mi_autosuspension', comoCliente ? { p_cliente: comoCliente.id } : {});
  return <UsoDynamo datos={(data as MiAutosusp | null) ?? null} empresa={comoCliente?.nombre ?? null} equipoSinVista={esEquipo && !comoCliente} />;
}
