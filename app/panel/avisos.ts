'use server';

// Novedades de la campana (avisos que crea la base de datos). Con «Ver como» un cliente o
// un transportista, Dynamo ve los de esa empresa. Qué ve cada uno lo decide mis_avisos().
import { sesion } from '@/lib/sesion';
import { esDynamo } from '@/lib/roles';
import { vistaCruda } from '@/lib/vista';

export type Aviso = { id: string; tipo: string; nivel: 'info' | 'ok' | 'aviso' | 'urgente'; titulo: string; texto: string | null;
  enlace: string | null; creado_en: string; nuevo: boolean };

export async function misAvisos(): Promise<Aviso[]> {
  const s = await sesion();
  if (!s?.perfil || s.perfil.estado !== 'activa') return [];
  const v = esDynamo(s.perfil.rol) ? await vistaCruda() : { tipo: 'admin' as const };
  const { data } = await s.supabase.rpc('mis_avisos', {
    p_cliente: v.tipo === 'cliente' ? v.id : null,
    p_transportista: v.tipo === 'transportista' ? v.id : null,
  });
  return (data ?? []) as Aviso[];
}

export async function marcarAvisosVistos(): Promise<void> {
  const s = await sesion();
  if (!s?.perfil || s.perfil.estado !== 'activa') return;
  await s.supabase.rpc('marcar_avisos_vistos');
}
