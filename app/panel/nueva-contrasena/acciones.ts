'use server';

import { redirect } from 'next/navigation';
import { supabaseServidor } from '@/lib/supabase/server';

export type EstadoClave = { error: string | null };

export async function guardarClave(_prev: EstadoClave, datos: FormData): Promise<EstadoClave> {
  const supabase = await supabaseServidor();
  if (!supabase) return { error: 'La plataforma no está conectada a la base de datos.' };
  const clave = String(datos.get('password') || '');
  if (clave.length < 8) return { error: 'La contraseña tiene que tener al menos 8 caracteres.' };
  const { error } = await supabase.auth.updateUser({ password: clave });
  if (error) {
    if (/different from the old/i.test(error.message)) return { error: 'La contraseña nueva tiene que ser distinta de la anterior.' };
    if (/weak|pwned|leaked/i.test(error.message)) return { error: 'Esa contraseña es demasiado fácil o ha aparecido en filtraciones. Elige otra.' };
    if (/session|jwt|not authenticated/i.test(error.message)) return { error: 'El enlace ha caducado. Pide otro desde «¿Olvidaste tu contraseña?».' };
    return { error: error.message };
  }
  redirect('/panel');
}
