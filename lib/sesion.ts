import { cache } from 'react';
import { redirect } from 'next/navigation';
import { supabaseServidor } from '@/lib/supabase/server';

export type { Rol } from './roles';
import type { Rol } from './roles';
export { esDynamo, esGestor, esSoloLectura, AVISO_SOLO_LECTURA } from './roles';
export type Perfil = {
  id: string; email: string; nombre: string | null; rol: Rol;
  estado: 'activa' | 'pendiente_verificacion' | 'suspendida';
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


// Iniciales para el avatar ("Juan García" → "JG"; sin nombre, del email).
export function iniciales(nombre: string | null | undefined, email: string): string {
  const base = (nombre || '').trim();
  if (base) {
    const p = base.split(/\s+/);
    return ((p[0]?.[0] || '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
  }
  return email.slice(0, 2).toUpperCase();
}
