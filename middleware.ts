import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { COOKIE_RECORDAR, duracionSegunRecordar } from '@/lib/supabase/recordar';

// Refresca la sesión de Supabase en cada petición de la plataforma y protege /panel:
// sin sesión, a la página de entrada.
export async function middleware(request: NextRequest) {
  let respuesta = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const clave = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !clave) return respuesta;   // sin configurar: la página lo explica

  const mantener = request.cookies.get(COOKIE_RECORDAR)?.value !== '0';
  const supabase = createServerClient(url, clave, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(lista) {
        lista.forEach(({ name, value }) => request.cookies.set(name, value));
        respuesta = NextResponse.next({ request });
        lista.forEach(({ name, value, options }) => respuesta.cookies.set(name, value, duracionSegunRecordar(options, mantener)));
      },
    },
  });

  // getUser() valida el token contra Supabase (no se fía de la cookie a ciegas).
  const { data: { user } } = await supabase.auth.getUser();
  const ruta = request.nextUrl.pathname;
  const enLogin = ruta.startsWith('/panel/entrar');
  // Páginas a las que se llega SIN sesión: la entrada, el enlace de los emails
  // (invitación y cambio de contraseña), la de pedir ese enlace y el alta de cliente.
  const publica = enLogin || ruta.startsWith('/panel/confirmar') || ruta.startsWith('/panel/olvido')
    || ruta.startsWith('/panel/registro');
  if (!user && !publica) {
    const destino = request.nextUrl.clone();
    destino.pathname = '/panel/entrar';
    return NextResponse.redirect(destino);
  }
  if (user && enLogin) {
    const destino = request.nextUrl.clone();
    destino.pathname = '/panel';
    return NextResponse.redirect(destino);
  }
  return respuesta;
}

export const config = { matcher: ['/panel', '/panel/:path*'] };
