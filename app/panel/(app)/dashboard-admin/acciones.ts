'use server';

import { sesion, esGestor } from '@/lib/sesion';
import type { Json } from '@/lib/supabase/tipos';
import { comprobarEntrada } from '@/lib/entradas/comprobar';

type Res = { ok: true } | { ok: false; error: string };

// La línea y el interruptor viven en `parametros` (la base de datos los usa al crear ofertas).
async function poner(clave: string, valor: unknown): Promise<Res> {
  const s = await sesion();
  if (!s?.perfil || s.perfil.estado !== 'activa' || !esGestor(s.perfil.rol)) return { ok: false, error: 'Solo el equipo de Dynamo cambia la línea de pronto pago.' };
  const { error, count } = await s.supabase.from('parametros').update({ valor: valor as Json }, { count: 'exact' }).eq('clave', clave);
  if (error) return { ok: false, error: /permission|row-level/i.test(error.message) ? 'No tienes permiso para hacer esto.' : error.message };
  if (!count) return { ok: false, error: 'No se ha encontrado el parámetro en la base de datos.' };
  return { ok: true };
}
export async function guardarLineaProntoPago(euros: number): Promise<Res> {
  comprobarEntrada("app/panel/(app)/dashboard-admin/acciones#guardarLineaProntoPago", [euros]);
  if (!Number.isFinite(euros) || euros < 0) return { ok: false, error: 'La línea tiene que ser un importe en euros, 0 o más.' };
  return poner('pronto_pago_linea_euros', Math.round(euros));
}
export async function encenderProntoPago(encendido: boolean): Promise<Res> {
  comprobarEntrada("app/panel/(app)/dashboard-admin/acciones#encenderProntoPago", [encendido]);
  return poner('pronto_pago_encendido', encendido);
}

// La lista de anticipos de la ventana de pronto pago, por páginas (10 por página): la
// pantalla la pide al abrir la ventana y al cambiar de página, en vez de recibirlos todos.
export type AnticipoPP = { cuando: string; envio: string; transportista: string | null; importe: number; descuento: number; anticipado: number };
export async function anticiposProntoPago(pagina: number): Promise<{ ok: true; filas: AnticipoPP[]; total: number } | { ok: false; error: string }> {
  comprobarEntrada("app/panel/(app)/dashboard-admin/acciones#anticiposProntoPago", [pagina]);
  const s = await sesion();
  if (!s?.perfil || s.perfil.estado !== 'activa' || !esGestor(s.perfil.rol)) return { ok: false, error: 'Solo el equipo de Dynamo ve los anticipos.' };
  const { data, error } = await s.supabase.rpc('pronto_pago_anticipos', { p_pagina: Math.max(1, Math.floor(pagina) || 1), p_por_pagina: 10 });
  if (error) return { ok: false, error: error.message };
  return {
    ok: true, total: Number(data?.[0]?.total ?? 0),
    filas: (data ?? []).map((f) => ({ cuando: f.cuando, envio: f.envio, transportista: f.transportista,
      importe: Number(f.importe), descuento: Number(f.descuento), anticipado: Number(f.anticipado) })),
  };
}
