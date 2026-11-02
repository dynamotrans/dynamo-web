'use server';

import { redirect } from 'next/navigation';
import { supabaseServidor } from '@/lib/supabase/server';

// Estado que devuelve el formulario de entrada.
export type EstadoEntrar = { error: string | null };

export async function entrar(_prev: EstadoEntrar, datos: FormData): Promise<EstadoEntrar> {
  const supabase = await supabaseServidor();
  if (!supabase) return { error: 'La plataforma no está conectada a la base de datos.' };

  const email = String(datos.get('email') || '').trim().toLowerCase();
  const password = String(datos.get('password') || '');
  if (!email || !password) return { error: 'Escribe tu email y tu contraseña.' };

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    // Sin conexión con Supabase (caído, o el proyecto de pruebas en pausa): decirlo, no
    // culpar a la contraseña.
    if (!error.status || error.status >= 500) {
      return { error: 'Ahora mismo no se puede conectar con la base de datos. Prueba en un momento.' };
    }
    // Mismo mensaje sea cual sea el fallo: no se dice si el email existe o no
    // (si no, cualquiera podría averiguar qué empresas tienen cuenta).
    return { error: 'Email o contraseña incorrectos.' };
  }
  redirect('/panel');
}

export async function salir() {
  const supabase = await supabaseServidor();
  if (supabase) await supabase.auth.signOut();
  redirect('/panel/entrar');
}
