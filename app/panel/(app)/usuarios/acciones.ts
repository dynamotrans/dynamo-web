'use server';

import { normalizaTel } from '@/lib/paises';

import { mensajeError } from '@/lib/mensajeError';
import { sesion, esGestor, type Rol } from '@/lib/sesion';
import { supabaseServicio } from '@/lib/supabase/servicio';
import { origen } from '@/lib/origen';

export type UsuarioDatos = {
  nombre: string; documento: string; telefono: string; cargo: string; idioma: string;
  estado: 'activa' | 'pendiente_verificacion' | 'suspendida';
  cliente_id: string; transportista_id: string;
  limite_consultas_precio_diario: number | null; limite_envios_diario: number | null;
  anotaciones: string;
  copias: string;                 // «Enviar copia a»: emails separados por comas (máx. 10)
  exento_autosuspension: boolean;    // «No suspender nunca automáticamente»
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
  return mensajeError(msg);   // los de las reglas de la base de datos ya vienen en castellano
}
const ROLES_VALIDOS: Rol[] = ['admin', 'empleado', 'admin_lectura', 'empleado_lectura', 'cliente', 'transportista'];

async function soloDynamo() {
  const s = await sesion();
  if (!s?.perfil || s.perfil.estado !== 'activa' || !esGestor(s.perfil.rol)) return null;
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
  const tel = normalizaTel(d.telefono);
  const copias = d.copias.split(/[,;\s]+/).map((x) => x.trim().toLowerCase()).filter(Boolean);
  if (copias.length > 10) return { ok: false, error: `Máximo 10 emails de copia (has puesto ${copias.length}).` };
  const malo = copias.find((x) => !EMAIL.test(x));
  if (malo) return { ok: false, error: `«${malo}» no es un email válido.` };
  const { error } = await s.supabase.from('usuarios').update({
    nombre: vacio(d.nombre), documento: vacio(d.documento)?.toUpperCase() ?? null,
    telefono: tel.replace('+', '').length >= 6 ? tel : null, cargo: vacio(d.cargo), idioma: d.idioma || 'es',
    estado: d.estado, ...empresaDe(rol, d.cliente_id, d.transportista_id),
    limite_consultas_precio_diario: d.limite_consultas_precio_diario, limite_envios_diario: d.limite_envios_diario,
    anotaciones: vacio(d.anotaciones), emails_copia_avisos: [...new Set(copias)], exento_autosuspension: !!d.exento_autosuspension,
  }).eq('id', id);
  return error ? { ok: false, error: traducir(error.message) } : { ok: true };
}

// Cambiar el rol: acción aparte; hay que escribir «Confirmo». Las reglas duras las
// vuelve a comprobar la base de datos. El Admin Master no se da desde la web (Supabase).
const confirmado = (t: string) => t.trim().toLowerCase() === 'confirmo';
const SOLO_SUPABASE = 'El Admin Master solo se nombra desde Supabase (Table Editor → usuarios), nunca desde la web.';
export async function cambiarRol(id: string, rol: Rol, confirmacion: string,
                                 cliente_id: string, transportista_id: string): Promise<Res> {
  const s = await soloDynamo();
  if (!s) return { ok: false, error: 'Solo el equipo de Dynamo gestiona usuarios.' };
  if (id === s.perfil!.id) return { ok: false, error: 'Nadie puede cambiar su propio rol.' };
  if (!ROLES_VALIDOS.includes(rol)) return { ok: false, error: 'Ese tipo de usuario no existe.' };
  if (rol === 'admin') return { ok: false, error: SOLO_SUPABASE };
  if (rol === 'admin_lectura' && s.perfil!.rol !== 'admin') return { ok: false, error: 'Solo el Admin Master puede conceder el rol Admin lectura.' };
  if (!confirmado(confirmacion)) return { ok: false, error: 'Escribe «Confirmo» para cambiar el rol.' };
  const { error } = await s.supabase.from('usuarios')
    .update({ rol, ...empresaDe(rol, cliente_id, transportista_id) }).eq('id', id);
  return error ? { ok: false, error: traducir(error.message) } : { ok: true };
}

export type Invitacion = { email: string; nombre: string; rol: Rol; cliente_id: string; transportista_id: string; telefono: string; cargo: string; confirmacion?: string };

// Alta de un usuario: Supabase le manda un email con el enlace para CREAR SU CONTRASEÑA
// (Dynamo nunca la ve ni la escribe). Luego se le pone rol y empresa con la sesión del admin.
export async function invitarUsuario(d: Invitacion): Promise<Res> {
  const s = await soloDynamo();
  if (!s) return { ok: false, error: 'Solo el equipo de Dynamo da de alta usuarios.' };
  const email = d.email.trim().toLowerCase();
  if (!EMAIL.test(email)) return { ok: false, error: 'El email no es válido.' };
  if (!d.nombre.trim()) return { ok: false, error: 'Pon el nombre y apellidos.' };
  if (!ROLES_VALIDOS.includes(d.rol)) return { ok: false, error: 'Ese tipo de usuario no existe.' };
  if (d.rol === 'admin') return { ok: false, error: SOLO_SUPABASE };
  if (d.rol === 'admin_lectura' && s.perfil!.rol !== 'admin') return { ok: false, error: 'Solo el Admin Master puede dar de alta un Admin lectura.' };
  if (!confirmado(d.confirmacion ?? '')) return { ok: false, error: 'Escribe «Confirmo» para dar de alta este tipo de usuario.' };
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

  const tel = normalizaTel(d.telefono);
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
  // Solo el Admin Master (decisión 2026-11-04): cambiar el email es la puerta para quedarse con una cuenta.
  if (s.perfil!.rol !== 'admin') return { ok: false, error: 'El email de una cuenta solo lo cambia el administrador.' };
  const servicio = supabaseServicio();
  if (!servicio) return { ok: false, error: 'Falta conectar la clave de servicio de Supabase en Vercel (SUPABASE_SERVICE_ROLE_KEY).' };
  const { error } = await servicio.auth.admin.updateUserById(id, { email, email_confirm: true });
  if (error) return { ok: false, error: traducir(error.message) };
  // Queda en la auditoría quién lo hizo (el cambio lo hace la clave de servicio, que no tiene autor).
  const { error: eReg } = await s.supabase.rpc('registrar_cambio_email', { p_usuario: id, p_antes: String(u.email), p_despues: email });
  if (eReg) return { ok: false, error: `El email ya está cambiado, pero no se ha podido apuntar en la auditoría: ${eReg.message}` };
  return { ok: true };
}

// RGPD — derecho de supresión: borra los datos personales de un cliente o transportista
// (ficha, contactos con su email, notas internas) y suspende la cuenta; la auditoría apunta
// qué se borró, sin los valores. Lo que es prueba (firmas del CMR, envíos) se conserva.
// Solo el Admin Master, tecleando el email actual. Con la clave de servicio, además se
// cambia el email de acceso en Supabase Auth y se bloquea la entrada.
export async function anonimizarUsuario(id: string, emailConfirmacion: string): Promise<Res & { aviso?: string }> {
  const s = await soloDynamo();
  if (!s || s.perfil!.rol !== 'admin') return { ok: false, error: 'Solo el administrador anonimiza cuentas.' };
  const { data: u } = await s.supabase.from('usuarios').select('email, rol').eq('id', id).single();
  if (!u) return { ok: false, error: 'Ese usuario no existe.' };
  if (emailConfirmacion.trim().toLowerCase() !== String(u.email).toLowerCase()) {
    return { ok: false, error: 'El email no coincide. Escríbelo exactamente para confirmar.' };
  }
  const { data, error } = await s.supabase.rpc('anonimizar_usuario', { p_usuario: id });
  if (error) return { ok: false, error: traducir(error.message) };
  const r = data as { resultado: string; email_anonimo?: string };
  if (r.resultado === 'solo_clientes_y_transportistas') return { ok: false, error: 'Solo se anonimizan cuentas de clientes y transportistas.' };
  if (r.resultado !== 'ok') return { ok: false, error: 'No se ha podido anonimizar.' };
  const servicio = supabaseServicio();
  if (!servicio) return { ok: true, aviso: 'Datos borrados de la plataforma. Falta la clave de servicio: borra también el usuario en Supabase → Authentication.' };
  const { error: ea } = await servicio.auth.admin.updateUserById(id, { email: r.email_anonimo, email_confirm: true, ban_duration: '876000h',
    // Los datos del registro también viven en el acceso: se vacían uno a uno (por si se mezclan en vez de sustituirse).
    user_metadata: { nombre: null, dni: null, telefono: null, empresa: null, cif: null, direccion: null, codigo_postal: null, poblacion: null, provincia: null, pais: null } });
  if (ea) return { ok: true, aviso: `Datos borrados de la plataforma, pero no del acceso (${ea.message}): bórralo en Supabase → Authentication.` };
  return { ok: true, aviso: 'Datos borrados y acceso bloqueado.' };
}
