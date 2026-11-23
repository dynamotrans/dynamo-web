'use server';

import { mensajeError } from '@/lib/mensajeError';
import { sesion, esDynamo } from '@/lib/sesion';
import { soloGestor } from '@/lib/guardia';
import { comprobarEntrada } from '@/lib/entradas/comprobar';

// PACKS DE GRUPAJE (usuario, 2026-11-23): Dynamo junta partidas que van por la misma ruta de
// provincias (o le pillan al paso), con un día de carga en común y sin pasar del tráiler.
// Todas las reglas las comprueba la base de datos (migración 20261123110000).

export type PartidaPack = {
  id: string; referencia_gx: string | null; cliente: string | null; origen: string | null; destino: string | null;
  metros_lineales: number | null; toneladas: number | null; desde: string | null; hasta: string | null;
  importe_transportista: number | null; transportista_id: string | null;
  tipo: 'misma_ruta' | 'al_paso' | null; cabe: boolean | null;
};
export type InfoPack = {
  pack: { id: string; codigo: string; estado: 'abierto' | 'asignado' | 'deshecho' } | null;
  motivo: string | null; ruta?: { origen: string | null; destino: string | null };
  partidas?: PartidaPack[]; metros_lineales?: number; toneladas?: number; desde?: string; hasta?: string;
  compatibles: PartidaPack[];
};
export type PackPosible = { origen: string | null; destino: string | null; metros_lineales: number; toneladas: number; desde: string; hasta: string; partidas: PartidaPack[] };

type Res = { ok: true; codigo?: string } | { ok: false; error: string };

export async function infoPack(envio: string): Promise<InfoPack | null> {
  comprobarEntrada("app/panel/(app)/packs/acciones#infoPack", [envio]);
  const s = await sesion();
  if (!s?.perfil || !esDynamo(s.perfil.rol)) return null;
  const { data, error } = await s.supabase.rpc('envio_pack_info', { p_envio: envio });
  return error ? null : (data as InfoPack | null);
}

export async function packsDeGrupaje(): Promise<{ creados: InfoPack[]; posibles: PackPosible[] } | null> {
  comprobarEntrada("app/panel/(app)/packs/acciones#packsDeGrupaje", []);
  const s = await sesion();
  if (!s?.perfil || !esDynamo(s.perfil.rol)) return null;
  const { data, error } = await s.supabase.rpc('packs_de_grupaje');
  return error ? null : (data as { creados: InfoPack[]; posibles: PackPosible[] });
}

export async function crearPack(envios: string[], pack: string | null): Promise<Res> {
  comprobarEntrada("app/panel/(app)/packs/acciones#crearPack", [envios, pack]);
  const s = await soloGestor();
  if (!s) return { ok: false, error: 'Solo el equipo de Dynamo agrupa envíos.' };
  const { data, error } = await s.supabase.rpc('crear_pack', pack ? { p_envios: envios, p_pack: pack } : { p_envios: envios });
  if (error) return { ok: false, error: mensajeError(error.message) };
  return { ok: true, codigo: (data as { codigo?: string } | null)?.codigo };
}

export async function quitarDePack(envio: string): Promise<Res> {
  comprobarEntrada("app/panel/(app)/packs/acciones#quitarDePack", [envio]);
  const s = await soloGestor();
  if (!s) return { ok: false, error: 'Solo el equipo de Dynamo agrupa envíos.' };
  const { error } = await s.supabase.rpc('quitar_de_pack', { p_envio: envio });
  return error ? { ok: false, error: mensajeError(error.message) } : { ok: true };
}

export async function deshacerPack(pack: string): Promise<Res> {
  comprobarEntrada("app/panel/(app)/packs/acciones#deshacerPack", [pack]);
  const s = await soloGestor();
  if (!s) return { ok: false, error: 'Solo el equipo de Dynamo agrupa envíos.' };
  const { error } = await s.supabase.rpc('deshacer_pack', { p_pack: pack });
  return error ? { ok: false, error: mensajeError(error.message) } : { ok: true };
}
