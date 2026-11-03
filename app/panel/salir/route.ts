import { NextResponse, type NextRequest } from 'next/server';
import { supabaseServidor } from '@/lib/supabase/server';

// Cerrar sesión con un formulario normal (no por JavaScript): así el navegador recarga
// la pantalla de entrada desde cero, sin arrastrar los estilos del panel.
export async function POST(request: NextRequest) {
  const supabase = await supabaseServidor();
  if (supabase) await supabase.auth.signOut();
  return NextResponse.redirect(new URL('/panel/entrar', request.url), 303);
}
