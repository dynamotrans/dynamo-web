'use server';

import { sesion, esDynamo } from '@/lib/sesion';

type Res = { ok: true } | { ok: false; error: string };

// La línea y el interruptor viven en `parametros` (la base de datos los usa al crear ofertas).
async function poner(clave: string, valor: unknown): Promise<Res> {
  const s = await sesion();
  if (!s?.perfil || s.perfil.estado !== 'activa' || !esDynamo(s.perfil.rol)) return { ok: false, error: 'Solo el equipo de Dynamo cambia la línea de pronto pago.' };
  const { error, count } = await s.supabase.from('parametros').update({ valor }, { count: 'exact' }).eq('clave', clave);
  if (error) return { ok: false, error: /permission|row-level/i.test(error.message) ? 'No tienes permiso para hacer esto.' : error.message };
  if (!count) return { ok: false, error: 'No se ha encontrado el parámetro en la base de datos.' };
  return { ok: true };
}
export async function guardarLineaProntoPago(euros: number): Promise<Res> {
  if (!Number.isFinite(euros) || euros < 0) return { ok: false, error: 'La línea tiene que ser un importe en euros, 0 o más.' };
  return poner('pronto_pago_linea_euros', Math.round(euros));
}
export async function encenderProntoPago(encendido: boolean): Promise<Res> {
  return poner('pronto_pago_encendido', encendido);
}
