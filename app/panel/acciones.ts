'use server';

import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { supabaseServidor, COOKIE_RECORDAR } from '@/lib/supabase/server';

// Estado que devuelve el formulario de entrada.
export type EstadoEntrar = { error: string | null; email?: string };

export async function entrar(_prev: EstadoEntrar, datos: FormData): Promise<EstadoEntrar> {
  const recordar = datos.get('recordar') === 'on';
  const supabase = await supabaseServidor(recordar);
  const email = String(datos.get('email') || '').trim().toLowerCase();
  if (!supabase) return { error: 'La plataforma no está conectada a la base de datos.', email };

  const password = String(datos.get('password') || '');
  if (!email || !password) return { error: 'Escribe tu email y tu contraseña.', email };

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    // Sin conexión con Supabase (caído, o el proyecto de pruebas en pausa): decirlo, no
    // culpar a la contraseña.
    if (!error.status || error.status >= 500) {
      return { error: 'Ahora mismo no se puede conectar con la base de datos. Prueba en un momento.', email };
    }
    // Mismo mensaje sea cual sea el fallo: no se dice si el email existe o no
    // (si no, cualquiera podría averiguar qué empresas tienen cuenta).
    return { error: 'Email o contraseña incorrectos.', email };
  }
  const almacen = await cookies();
  almacen.set(COOKIE_RECORDAR, recordar ? '1' : '0', {
    path: '/', httpOnly: true, sameSite: 'lax', secure: true,
    ...(recordar ? { maxAge: 60 * 60 * 24 * 400 } : {}),
  });
  redirect('/panel');
}

export async function salir() {
  const supabase = await supabaseServidor();
  if (supabase) await supabase.auth.signOut();
  redirect('/panel/entrar');
}
