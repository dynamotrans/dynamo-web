'use server';

import { sesion, esDynamo } from '@/lib/sesion';
import { enviosLigerosPorId, type EnvioLigero } from '@/lib/enviosLigeros';

// Buscador «Envío referenciado» de Incidencias y Penalizaciones (Dynamo): busca en la base
// de datos (buscar_envios: nº, pedido, cliente, CIF, ruta, matrícula, transportista…).
export async function buscarEnviosLigeros(q: string): Promise<EnvioLigero[]> {
  const s = await sesion();
  if (!s?.perfil || s.perfil.estado !== 'activa' || !esDynamo(s.perfil.rol)) return [];
  const texto = String(q ?? '').replace(/^#/, '').trim().slice(0, 120);
  if (!texto) return [];
  const { data: ids } = await s.supabase.rpc('buscar_envios', { p_q: texto, p_limite: 8 });
  return enviosLigerosPorId(s.supabase, (ids ?? []) as string[]);
}

// Un envío ya elegido que no está entre los recientes (al abrir una ficha antigua).
export async function envioLigero(id: string): Promise<EnvioLigero | null> {
  const s = await sesion();
  if (!s?.perfil || s.perfil.estado !== 'activa' || !esDynamo(s.perfil.rol) || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  return (await enviosLigerosPorId(s.supabase, [id]))[0] ?? null;
}
