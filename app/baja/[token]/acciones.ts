'use server';

import { redirect } from 'next/navigation';
import { supabasePublico } from '@/lib/supabase/publico';
import { comprobarEntrada } from '@/lib/entradas/comprobar';

// Confirma la baja del resumen mensual con la llave del enlace y vuelve a la misma página,
// que ya enseña «Baja hecha».
export async function darseDeBaja(f: FormData): Promise<void> {
  comprobarEntrada("app/baja/[token]/acciones#darseDeBaja", [f]);
  const token = String(f.get('token') ?? '');
  if (!/^[0-9a-f-]{36}$/i.test(token)) redirect('/');
  const sb = supabasePublico();
  if (sb) await sb.rpc('baja_resumen_sitio', { p_token: token, p_confirmar: true });
  redirect(`/baja/${token}`);
}
