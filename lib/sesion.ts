import { cache } from 'react';
import { redirect } from 'next/navigation';
import { supabaseServidor } from '@/lib/supabase/server';

export type { Rol } from './roles';
import type { Rol } from './roles';
export { esDynamo, esGestor, esSoloLectura, AVISO_SOLO_LECTURA } from './roles';
export type Perfil = {
  id: string; email: string; nombre: string | null; rol: Rol;
  estado: 'activa' | 'pendiente_verificacion' | 'suspendida' | 'suspendida_total';
  suspension_motivo?: string | null; suspendida_en?: string | null;   // para la pantalla de cuenta suspendida
  cliente_id?: string | null; transportista_id?: string | null;        // canales de la plataforma en vivo
};

// Sesión del usuario para el panel: una sola lectura por petición (cache), la usan el
// marco (barra y menú) y la pantalla. Sin sesión → a la entrada.
export const sesion = cache(async () => {
  const supabase = await supabaseServidor();
  if (!supabase) return null;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/panel/entrar');

  const { data: perfil } = await supabase
    .from('usuarios').select('id, email, nombre, rol, estado, suspension_motivo, suspendida_en, cliente_id, transportista_id').eq('id', user.id).maybeSingle();

  // Suspensión TOTAL (usuario, 2026-11-14): ni dentro — se cierra la sesión en el acto
  // (el «siguiente clic» de quien la tuviera abierta) y la entrada enseña el porqué.
  if ((perfil as Perfil | null)?.estado === 'suspendida_total') {
    await supabase.auth.signOut().catch(() => {});
    redirect('/panel/entrar?sesion=suspendida_total');
  }

  // Nombre de la empresa para el pie del menú lateral.
  let empresa = 'Dynamo Operador Logístico, S.L.';
  if (perfil?.rol === 'cliente') {
    const { data } = await supabase.rpc('mi_empresa').maybeSingle<{ nombre_comercial: string | null; razon_social: string }>();
    empresa = data?.nombre_comercial || data?.razon_social || '';
  } else if (perfil?.rol === 'transportista') {
    const { data } = await supabase.rpc('mi_empresa_transportista').maybeSingle<{ nombre_comercial: string | null; razon_social: string }>();
    empresa = data?.nombre_comercial || data?.razon_social || '';
  }
  return { supabase, user, perfil: (perfil as Perfil | null), empresa };
});


// Iniciales para el avatar: nombre + PRIMER apellido ("Juan García Pérez" → "JG",
// "Alvaro Blanco Admin" → "AB"). Antes se cogía la última palabra y un nombre con
// coletilla ("… ADMIN") daba iniciales raras. Sin nombre, del email.
export function iniciales(nombre: string | null | undefined, email: string): string {
  const base = (nombre || '').trim();
  if (base) {
    const p = base.split(/\s+/);
    return ((p[0]?.[0] || '') + (p.length > 1 ? p[1][0] : '')).toUpperCase();
  }
  return email.slice(0, 2).toUpperCase();
}

// Suspensión en dos niveles (usuario, 2026-11-14): «suspendida» = SOLO LECTURA para
// cliente y transportista — entran y lo consultan todo; crear o cambiar lo corta la
// base de datos (cerrojo central). La «suspendida_total» ni entra (sesion la expulsa),
// y el equipo de Dynamo suspendido no ve nada.
export const soloMirar = (p: Perfil | null | undefined) =>
  !!p && p.estado === 'suspendida' && (p.rol === 'cliente' || p.rol === 'transportista');
// Guardia de tipos: si NO hay bloqueo, el perfil existe seguro (las páginas lo usan después).
export function sinAcceso(p: Perfil | null | undefined): p is null | undefined {
  return !p || (p.estado !== 'activa' && !soloMirar(p));
}
