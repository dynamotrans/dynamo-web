'use server';

import { sesion, esDynamo } from '@/lib/sesion';
import type { Fichero } from '@/lib/exportaciones';

// Marcar (o desmarcar) envíos como ya pasados a Holded / publicados en la bolsa.
export async function marcarExportados(fichero: Fichero, refs: string[], quitar = false): Promise<{ ok: true; n: number } | { ok: false; error: string }> {
  const s = await sesion();
  if (!s?.perfil || s.perfil.estado !== 'activa' || !esDynamo(s.perfil.rol)) return { ok: false, error: 'Solo el equipo de Dynamo.' };
  if (!['venta', 'compra', 'bolsa'].includes(fichero)) return { ok: false, error: 'Fichero no válido.' };
  const lista = [...new Set(refs.filter((r) => /^GX\d+$/.test(r)))];
  if (!lista.length) return { ok: false, error: 'No hay ningún envío que marcar.' };
  const { data, error } = await s.supabase.rpc('marcar_exportados', { p_fichero: fichero, p_refs: lista, p_quitar: quitar });
  return error ? { ok: false, error: /42501|permission/i.test(error.message) ? 'No tienes permiso para hacer esto.' : error.message } : { ok: true, n: Number(data) };
}
