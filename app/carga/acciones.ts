'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { supabasePublico } from '@/lib/supabase/publico';
import { supabaseServicio } from '@/lib/supabase/servicio';
import { turnstileOk } from '@/lib/servidor/turnstile';
import { CONTACTO } from '@/lib/atencion';
import { comprobarEntrada } from '@/lib/entradas/comprobar';

// `motivo` dice a la pantalla cómo contarlo. La base de datos distingue las dos razones:
// «codigo_incorrecto» (ese código no es de ninguna carga: está mal escrito) y
// «no_disponible» (es de una carga que ya no se puede aceptar).
export type EstadoCodigo = { error: string | null; codigo?: string; motivo?: 'codigo_incorrecto' | 'no_disponible' | 'tope' | 'otro' };

const ERROR_CONEXION = 'No se puede conectar ahora mismo. Vuelve a intentarlo en un momento.';

// El código de la carga → la pantalla de esa carga. Si no abre, la base de datos dice la
// razón (código mal escrito o carga que ya no está disponible) y pone el tope de fallos
// por hora; aquí va además el captcha.
export async function buscarPorCodigo(_prev: EstadoCodigo, f: FormData): Promise<EstadoCodigo> {
  comprobarEntrada("app/carga/acciones#buscarPorCodigo", [_prev, f]);
  // Seis cifras; se quedan solo las cifras (da igual espacios o guiones).
  const codigo = String(f.get('codigo') ?? '').replace(/\D/g, '').slice(0, 12);
  if (codigo.length < 6) return { error: 'Escribe las 6 cifras del código que aparece en la carga.', codigo };
  if (!(await turnstileOk(f))) return { error: 'No hemos podido comprobar que no eres un robot. Recarga la página y vuelve a intentarlo.', codigo };
  const sb = supabasePublico();
  if (!sb) return { error: ERROR_CONEXION, codigo };
  const { data: mant } = await sb.rpc('mantenimiento_activo');
  if (mant) return { error: `La plataforma está en mantenimiento. Vuelve a intentarlo en un rato o llámanos al ${CONTACTO.telefono}.`, codigo };
  // La IP real la pone Vercel (x-real-ip / x-forwarded-for, que no se pueden falsear desde fuera).
  // La consulta del código va SOLO desde aquí, con la clave del servidor (auditoría, 2026-11-28):
  // así nadie se salta el captcha ni el tope de fallos llamando directamente a la base de datos.
  const h = await headers();
  const ip = (h.get('x-real-ip') ?? h.get('x-forwarded-for') ?? '').split(',')[0].trim() || null;
  const sv = supabaseServicio();
  if (!sv) return { error: ERROR_CONEXION, codigo };
  const { data, error } = await sv.rpc('carga_por_codigo', { p_codigo: codigo, p_ip: ip });
  if (error) return { error: ERROR_CONEXION, codigo };
  const r = data as { resultado?: string; token?: string } | null;
  if (r?.resultado === 'ok' && r.token && /^[0-9a-f-]{36}$/i.test(r.token)) redirect(`/carga/${r.token}`);
  if (r?.resultado === 'tope') return { error: `Has probado demasiados códigos seguidos. Espera una hora o llámanos al ${CONTACTO.telefono}.`, codigo, motivo: 'tope' };
  if (r?.resultado === 'no_disponible') return { error: 'Ya la ha aceptado otro transportista o se ha retirado. El código está bien escrito: no hace falta que lo vuelvas a probar.', codigo, motivo: 'no_disponible' };
  return { error: 'No hay ninguna carga con ese código. Revísalo tal como aparece en la oferta y vuelve a escribirlo.', codigo, motivo: 'codigo_incorrecto' };
}
