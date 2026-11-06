'use server';

import { redirect } from 'next/navigation';
import { supabaseServidor } from '@/lib/supabase/server';
import { claveValida } from '@/lib/clave';
import { vieneDeEnlace } from '@/lib/vieneDeEnlace';
import { comprobarEntrada } from '@/lib/entradas/comprobar';

export type EstadoClave = { error: string | null };

export async function guardarClave(_prev: EstadoClave, datos: FormData): Promise<EstadoClave> {
  comprobarEntrada("app/panel/nueva-contrasena/acciones#guardarClave", [_prev, datos]);
  const supabase = await supabaseServidor();
  if (!supabase) return { error: 'La plataforma no está conectada a la base de datos.' };
  if (!(await vieneDeEnlace(supabase))) return { error: 'Para cambiar tu contraseña ve a «Mi cuenta» (te pedirá la actual), o pide un enlace desde «¿Olvidaste tu contraseña?».' };
  const clave = String(datos.get('password') || '');
  if (!claveValida(clave)) return { error: 'La contraseña necesita al menos 8 caracteres y 3 de las reglas.' };
  const { error } = await supabase.auth.updateUser({ password: clave });
  if (error) {
    if (/different from the old/i.test(error.message)) return { error: 'La contraseña nueva tiene que ser distinta de la anterior.' };
    if (/weak|pwned|leaked/i.test(error.message)) return { error: 'Esa contraseña es demasiado fácil o ha aparecido en filtraciones. Elige otra.' };
    if (/session|jwt|not authenticated/i.test(error.message)) return { error: 'El enlace ha caducado. Pide otro desde «¿Olvidaste tu contraseña?».' };
    return { error: 'No se ha podido guardar la contraseña. Vuelve a intentarlo o pide otro enlace.' };
  }
  redirect('/panel');
}
