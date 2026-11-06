'use server';

import { sesion, esGestor } from '@/lib/sesion';
import type { Fichero } from '@/lib/exportaciones';
import { comprobarEntrada } from '@/lib/entradas/comprobar';

// Marcar (o desmarcar) envíos como ya pasados a Holded / publicados en la bolsa.
export async function marcarExportados(fichero: Fichero, refs: string[], quitar = false): Promise<{ ok: true; n: number } | { ok: false; error: string }> {
  comprobarEntrada("app/panel/(app)/exportaciones/acciones#marcarExportados", [fichero, refs, quitar]);
  const s = await sesion();
  if (!s?.perfil || s.perfil.estado !== 'activa' || !esGestor(s.perfil.rol)) return { ok: false, error: 'Solo el equipo de Dynamo.' };
  if (!['venta', 'compra', 'bolsa'].includes(fichero)) return { ok: false, error: 'Fichero no válido.' };
  const lista = [...new Set(refs.filter((r) => /^GX\d+$/.test(r)))];
  if (!lista.length) return { ok: false, error: 'No hay ningún envío que marcar.' };
  const { data, error } = await s.supabase.rpc('marcar_exportados', { p_fichero: fichero, p_refs: lista, p_valor: !quitar });
  return error ? { ok: false, error: /42501|permission/i.test(error.message) ? 'No tienes permiso para hacer esto.' : error.message } : { ok: true, n: Number(data) };
}

// Marcar (o desmarcar) como facturados: venta = ya facturado al cliente; compra = ya llegó
// la factura del transportista (columna FACTURADO? de los ficheros de Holded).
export async function marcarFacturados(lado: 'venta' | 'compra', refs: string[], valor: boolean): Promise<{ ok: true; n: number } | { ok: false; error: string }> {
  comprobarEntrada("app/panel/(app)/exportaciones/acciones#marcarFacturados", [lado, refs, valor]);
  const s = await sesion();
  if (!s?.perfil || s.perfil.estado !== 'activa' || !esGestor(s.perfil.rol)) return { ok: false, error: 'Solo el equipo de Dynamo.' };
  const lista = [...new Set(refs.filter((r) => /^GX\d+$/.test(r)))];
  if (!lista.length) return { ok: false, error: 'No hay ningún envío que marcar.' };
  const { data, error } = await s.supabase.rpc('marcar_facturados', { p_lado: lado, p_refs: lista, p_valor: valor });
  return error ? { ok: false, error: /42501|permission/i.test(error.message) ? 'No tienes permiso para hacer esto.' : error.message } : { ok: true, n: Number(data) };
}
