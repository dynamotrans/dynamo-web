'use server';

import { sesion, esDynamo } from '@/lib/sesion';
import { enviosLigerosPorId, misEnviosLigerosPorId, type EnvioLigero } from '@/lib/enviosLigeros';
import { comprobarEntrada } from '@/lib/entradas/comprobar';
import type { SB } from '@/lib/supabase/cliente';

// Buscador «Envío referenciado» de Incidencias y Penalizaciones: busca en la base de datos
// (buscar_envios_pagina, con índice). Dynamo en todos; el cliente y el transportista, en lo
// suyo (la base de datos ya lo limita) y sin datos de la otra parte.
const puede = (rol: string) => esDynamo(rol) || rol === 'cliente' || rol === 'transportista';
const deEllos = (s: { supabase: SB; perfil: { rol: string } }, ids: string[]) => esDynamo(s.perfil.rol)
  ? enviosLigerosPorId(s.supabase, ids) : misEnviosLigerosPorId(s.supabase, ids, s.perfil.rol === 'transportista');
export async function buscarEnviosLigeros(q: string): Promise<EnvioLigero[]> {
  comprobarEntrada("lib/enviosLigerosAcciones#buscarEnviosLigeros", [q]);
  const s = await sesion();
  if (!s?.perfil || s.perfil.estado !== 'activa' || !puede(s.perfil.rol)) return [];
  const texto = String(q ?? '').replace(/^#/, '').trim().slice(0, 120);
  if (!texto) return [];
  // Con el índice de búsqueda (todos los años).
  const { data } = await s.supabase.rpc('buscar_envios_pagina', { p_q: texto, p_pagina: 1, p_por_pagina: 8 });
  return deEllos({ supabase: s.supabase, perfil: s.perfil }, ((data ?? []) as { id: string }[]).map((x) => x.id));
}

// Un envío ya elegido que no está entre los recientes (al abrir una ficha antigua).
export async function envioLigero(id: string): Promise<EnvioLigero | null> {
  comprobarEntrada("lib/enviosLigerosAcciones#envioLigero", [id]);
  const s = await sesion();
  if (!s?.perfil || s.perfil.estado !== 'activa' || !puede(s.perfil.rol) || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  return (await deEllos({ supabase: s.supabase, perfil: s.perfil }, [id]))[0] ?? null;
}
