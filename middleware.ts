import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { COOKIE_RECORDAR, duracionSegunRecordar } from '@/lib/supabase/recordar';
import { CABECERA_CSP, INFORME_CSP, cspPlataforma, nuevoNonce } from '@/lib/csp';

// Refresca la sesión de Supabase en cada petición de la plataforma y protege /panel:
// sin sesión, a la página de entrada. Y en TODA la plataforma (/panel, /carga, /cmr) pone
// la política de seguridad de contenido con una llave de un solo uso (lib/csp.ts).
export async function middleware(request: NextRequest) {
  const nonce = nuevoNonce();
  const csp = cspPlataforma(nonce, process.env.NODE_ENV === 'development');
  // Next.js lee la llave de la cabecera de la PETICIÓN y se la pone a sus propios scripts.
  const seguir = () => {
    const h = new Headers(request.headers);
    h.set('x-nonce', nonce);
    h.set(CABECERA_CSP.toLowerCase(), csp);
    return NextResponse.next({ request: { headers: h } });
  };
  const conCsp = (r: NextResponse) => {
    r.headers.set(CABECERA_CSP, csp);
    r.headers.set('Reporting-Endpoints', `csp="${INFORME_CSP}"`);
    return r;
  };
  // Páginas públicas del transportista: solo la política, sin sesión.
  if (!request.nextUrl.pathname.startsWith('/panel')) return conCsp(seguir());

  let respuesta = seguir();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const clave = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !clave) return conCsp(respuesta);   // sin configurar: la página lo explica

  const mantener = request.cookies.get(COOKIE_RECORDAR)?.value !== '0';
  const supabase = createServerClient(url, clave, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(lista) {
        lista.forEach(({ name, value }) => request.cookies.set(name, value));
        respuesta = seguir();
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
  return conCsp(respuesta);
}

export const config = { matcher: ['/panel', '/panel/:path*', '/carga/:path*', '/cmr/:path*'] };
