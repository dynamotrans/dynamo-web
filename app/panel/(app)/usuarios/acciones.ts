'use server';

import { sesion, esDynamo, type Rol } from '@/lib/sesion';
import { supabaseServicio } from '@/lib/supabase/servicio';
import { origen } from '@/lib/origen';

export type UsuarioDatos = {
  nombre: string; documento: string; telefono: string; cargo: string; idioma: string;
  estado: 'activa' | 'pendiente_verificacion' | 'suspendida';
  cliente_id: string; transportista_id: string;
  limite_consultas_precio_diario: number | null; limite_cargas_diario: number | null;
  anotaciones: string;
};
type Res = { ok: true } | { ok: false; error: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const vacio = (s: string) => (s ?? '').trim() || null;
function traducir(msg: string): string {
  if (/ck_usuarios_pertenencia/i.test(msg)) return 'Para activar la cuenta de un cliente o de un transportista, elige su empresa.';
  if (/unico admin activo/i.test(msg)) return 'No se puede: es el único administrador activo. Nombra antes a otro.';
  if (/usuarios_telefono_check/i.test(msg)) return 'El teléfono no es válido: solo números, con el prefijo del país.';
  if (/already been registered|already registered|already exists/i.test(msg)) return 'Ya existe un usuario con ese email (regla 10: un email, un usuario).';
  if (/rate limit|too many/i.test(msg)) return 'Se han enviado demasiados emails seguidos. Prueba dentro de unos minutos.';
  if (/permission denied|row-level security/i.test(msg)) return 'No tienes permiso para hacer esto.';
  return msg;   // los mensajes de las reglas de la base de datos ya vienen en castellano
}
async function soloDynamo() {
  const s = await sesion();
  if (!s?.perfil || s.perfil.estado !== 'activa' || !esDynamo(s.perfil.rol)) return null;
  return s;
}
// La empresa que corresponde a cada rol (y nada más).
function empresaDe(rol: Rol, cliente_id: string, transportista_id: string) {
  return {
    cliente_id: rol === 'cliente' ? cliente_id || null : null,
    transportista_id: rol === 'transportista' ? transportista_id || null : null,
  };
}

export async function guardarUsuario(id: string, rol: Rol, d: UsuarioDatos): Promise<Res> {
  const s = await soloDynamo();
  if (!s) return { ok: false, error: 'Solo el equipo de Dynamo gestiona usuarios.' };
  const tel = d.telefono.replace(/[^\d+]/g, '');
  const { error } = await s.supabase.from('usuarios').update({
    nombre: vacio(d.nombre), documento: vacio(d.documento)?.toUpperCase() ?? null,
    telefono: tel.replace('+', '').length >= 6 ? tel : null, cargo: vacio(d.cargo), idioma: d.idioma || 'es',
    estado: d.estado, ...empresaDe(rol, d.cliente_id, d.transportista_id),
    limite_consultas_precio_diario: d.limite_consultas_precio_diario, limite_cargas_diario: d.limite_cargas_diario,
    anotaciones: vacio(d.anotaciones),
  }).eq('id', id);
  return error ? { ok: false, error: traducir(error.message) } : { ok: true };
}

// Cambiar el rol: acción aparte, con el email del usuario tecleado como confirmación
// (mockup). Las reglas duras las vuelve a comprobar la base de datos.
export async function cambiarRol(id: string, rol: Rol, emailConfirmacion: string,
                                 cliente_id: string, transportista_id: string): Promise<Res> {
  const s = await soloDynamo();
  if (!s) return { ok: false, error: 'Solo el equipo de Dynamo gestiona usuarios.' };
  if (id === s.perfil!.id) return { ok: false, error: 'Nadie puede cambiar su propio rol.' };
  if (rol === 'admin' && s.perfil!.rol !== 'admin') return { ok: false, error: 'Solo un administrador puede conceder el rol de administrador.' };
  const { data: u } = await s.supabase.from('usuarios').select('email').eq('id', id).single();
  if (!u || emailConfirmacion.trim().toLowerCase() !== String(u.email).toLowerCase()) {
    return { ok: false, error: 'El email no coincide. Escríbelo exactamente para confirmar el cambio de rol.' };
  }
  const { error } = await s.supabase.from('usuarios')
    .update({ rol, ...empresaDe(rol, cliente_id, transportista_id) }).eq('id', id);
  return error ? { ok: false, error: traducir(error.message) } : { ok: true };
}

export type Invitacion = { email: string; nombre: string; rol: Rol; cliente_id: string; transportista_id: string; telefono: string; cargo: string };

// Alta de un usuario: Supabase le manda un email con el enlace para CREAR SU CONTRASEÑA
// (Dynamo nunca la ve ni la escribe). Luego se le pone rol y empresa con la sesión del admin.
export async function invitarUsuario(d: Invitacion): Promise<Res> {
  const s = await soloDynamo();
  if (!s) return { ok: false, error: 'Solo el equipo de Dynamo da de alta usuarios.' };
  const email = d.email.trim().toLowerCase();
  if (!EMAIL.test(email)) return { ok: false, error: 'El email no es válido.' };
  if (!d.nombre.trim()) return { ok: false, error: 'Pon el nombre y apellidos.' };
  if (d.rol === 'admin' && s.perfil!.rol !== 'admin') return { ok: false, error: 'Solo un administrador puede dar de alta a otro administrador.' };
  if (d.rol === 'cliente' && !d.cliente_id) return { ok: false, error: 'Elige de qué cliente es el usuario.' };
  if (d.rol === 'transportista' && !d.transportista_id) return { ok: false, error: 'Elige de qué transportista es el usuario.' };
  const { data: ya } = await s.supabase.from('usuarios').select('id').ilike('email', email).maybeSingle();
  if (ya) return { ok: false, error: 'Ya existe un usuario con ese email (regla 10: un email, un usuario).' };

  const servicio = supabaseServicio();
  if (!servicio) {
    return { ok: false, error: 'Falta conectar el envío de invitaciones: hay que poner la clave de servicio de Supabase en Vercel (SUPABASE_SERVICE_ROLE_KEY).' };
  }
  const { data, error } = await servicio.auth.admin.inviteUserByEmail(email, {
    data: { nombre: d.nombre.trim() }, redirectTo: `${await origen()}/panel/confirmar`,
  });
  if (error || !data.user) return { ok: false, error: traducir(error?.message ?? 'No se ha podido enviar la invitación.') };

  const tel = d.telefono.replace(/[^\d+]/g, '');
  const { error: e2 } = await s.supabase.from('usuarios').update({
    nombre: d.nombre.trim(), rol: d.rol, estado: 'activa', ...empresaDe(d.rol, d.cliente_id, d.transportista_id),
    telefono: tel.replace('+', '').length >= 6 ? tel : null, cargo: vacio(d.cargo),
  }).eq('id', data.user.id);
  if (e2) return { ok: false, error: `La invitación ha salido, pero no se ha podido guardar el rol: ${traducir(e2.message)}. Corrígelo en su ficha.` };
  return { ok: true };
}

// Reenviar la invitación a quien aún no ha creado su contraseña.
export async function reenviarInvitacion(id: string): Promise<Res> {
  const s = await soloDynamo();
  if (!s) return { ok: false, error: 'Solo el equipo de Dynamo gestiona usuarios.' };
  const { data: u } = await s.supabase.from('usuarios').select('email').eq('id', id).single();
  const servicio = supabaseServicio();
  if (!u || !servicio) return { ok: false, error: 'Falta conectar el envío de invitaciones (SUPABASE_SERVICE_ROLE_KEY en Vercel).' };
  const { error } = await servicio.auth.admin.inviteUserByEmail(u.email as string, { redirectTo: `${await origen()}/panel/confirmar` });
  return error ? { ok: false, error: traducir(error.message) } : { ok: true };
}

// Cambiar el email (el usuario de acceso) de una cuenta, cuando el cliente o el
// transportista lo pide. Con el email ACTUAL tecleado como confirmación, como el cambio
// de rol. El email de una cuenta interna solo lo cambia un administrador. Supabase no
// deja repetir email (regla 10) y el perfil se actualiza solo (trigger de la base de
// datos). Necesita la clave de servicio: con la pública no se puede.
export async function cambiarEmail(id: string, nuevo: string, emailConfirmacion: string): Promise<Res> {
  const s = await soloDynamo();
  if (!s) return { ok: false, error: 'Solo el equipo de Dynamo gestiona usuarios.' };
  const email = nuevo.trim().toLowerCase();
  if (!EMAIL.test(email)) return { ok: false, error: 'Escribe un email válido.' };
  const { data: u } = await s.supabase.from('usuarios').select('email, rol').eq('id', id).single();
  if (!u) return { ok: false, error: 'Ese usuario no existe.' };
  if (emailConfirmacion.trim().toLowerCase() !== String(u.email).toLowerCase()) {
    return { ok: false, error: 'El email actual no coincide. Escríbelo exactamente para confirmar el cambio.' };
  }
  if (email === String(u.email).toLowerCase()) return { ok: false, error: 'Es el mismo email que ya tiene.' };
  if (esDynamo(u.rol as Rol) && s.perfil!.rol !== 'admin') return { ok: false, error: 'El email de una cuenta de Dynamo solo lo cambia un administrador.' };
  const servicio = supabaseServicio();
  if (!servicio) return { ok: false, error: 'Falta conectar la clave de servicio de Supabase en Vercel (SUPABASE_SERVICE_ROLE_KEY).' };
  const { error } = await servicio.auth.admin.updateUserById(id, { email, email_confirm: true });
  return error ? { ok: false, error: traducir(error.message) } : { ok: true };
}
