'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { supabasePublico } from '@/lib/supabase/publico';
import { turnstileOk } from '@/lib/servidor/turnstile';
import { CONTACTO } from '@/lib/atencion';
import { comprobarEntrada } from '@/lib/entradas/comprobar';

export type EstadoCodigo = { error: string | null; codigo?: string };

const ERROR_CONEXION = 'No se puede conectar ahora mismo. Vuelve a intentarlo en un momento.';

// El código de aceptación de la bolsa → la pantalla de esa carga. La base de datos responde
// lo mismo a un código inventado que a una carga ya tomada (no deja averiguar qué códigos
// existen) y pone el tope de fallos por hora; aquí va además el captcha.
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
  const ip = ((await headers()).get('x-forwarded-for') ?? '').split(',')[0].trim() || null;
  const { data, error } = await sb.rpc('carga_por_codigo', { p_codigo: codigo, p_ip: ip });
  if (error) return { error: ERROR_CONEXION, codigo };
  const r = data as { resultado?: string; token?: string } | null;
  if (r?.resultado === 'ok' && r.token && /^[0-9a-f-]{36}$/i.test(r.token)) redirect(`/carga/${r.token}`);
  if (r?.resultado === 'tope') return { error: `Has probado demasiados códigos seguidos. Espera una hora o llámanos al ${CONTACTO.telefono}.`, codigo };
  return { error: 'Esta carga ya no está disponible, o el código no es correcto. Revísalo tal como aparece en la bolsa.', codigo };
}
