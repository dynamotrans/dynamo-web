'use server';

import { normalizaTel } from '@/lib/paises';

import { mensajeError } from '@/lib/mensajeError';
import { claveValida } from '@/lib/clave';
import { sesion } from '@/lib/sesion';
import { validaDoc } from '@/lib/documentoIdentidad';
import { supabasePublico } from '@/lib/supabase/publico';
import { supabaseServicio } from '@/lib/supabase/servicio';
import { comprobarMiClave } from '@/lib/servidor/miClave';
import { movilesDe } from '@/lib/supabase/doblePaso';
import { origen } from '@/lib/origen';
import { soloTransportista } from '@/lib/guardia';
import { comprobarEntrada } from '@/lib/entradas/comprobar';
import { CONTACTO } from '@/lib/atencion';
import type { ContactoDatos } from '@/lib/contactos';
import { guardarContactos, validarContactos, sinVacios } from '@/lib/contactosServidor';

export type MisDatos = { nombre: string; telefono: string; documento: string; cargo: string; idioma: string };

// Cada usuario cambia SUS datos personales (también con la cuenta pendiente de activar o
// suspendida, a propósito: para completar o corregir sus datos y su contraseña). Rol, estado, empresa y límites no se los puede
// tocar nadie a sí mismo: lo impide la base de datos (migración permisos_por_rol).
export async function guardarMisDatos(d: MisDatos): Promise<{ ok: true } | { ok: false; error: string }> {
  comprobarEntrada("app/panel/(app)/mi-cuenta/acciones#guardarMisDatos", [d]);
  const s = await sesion();
  if (!s?.perfil) return { ok: false, error: 'Tu sesión ha caducado. Vuelve a entrar.' };
  if (!d.nombre.trim()) return { ok: false, error: 'Pon tu nombre y apellidos.' };
  const tel = normalizaTel(d.telefono);
  const { error } = await s.supabase.from('usuarios').update({
    nombre: d.nombre.trim(), telefono: tel || null, documento: d.documento.trim().toUpperCase() || null,
    cargo: d.cargo.trim() || null, idioma: d.idioma || 'es',
  }).eq('id', s.perfil.id);
  if (error) {
    if (/telefono/i.test(error.message)) return { ok: false, error: 'El teléfono no es válido: solo números, con el prefijo del país (p. ej. +34600111222).' };
    if (/idioma/i.test(error.message)) return { ok: false, error: 'Ese idioma no está disponible.' };
    return { ok: false, error: mensajeError(error.message) };
  }
  return { ok: true };
}

// Cambiar la contraseña desde Mi cuenta. Pide la ACTUAL: así, una sesión que alguien se
// dejó abierta en otro ordenador no basta para quedarse con la cuenta. La actual se
// comprueba con una conexión aparte, sin tocar la sesión de este navegador.
export async function cambiarMiClave(actual: string, nueva: string): Promise<{ ok: true } | { ok: false; error: string }> {
  comprobarEntrada("app/panel/(app)/mi-cuenta/acciones#cambiarMiClave", [actual, nueva]);
  const s = await sesion();
  if (!s?.perfil) return { ok: false, error: 'Tu sesión ha caducado. Vuelve a entrar.' };
  if (!actual) return { ok: false, error: 'Escribe tu contraseña actual.' };
  if (!claveValida(nueva)) return { ok: false, error: 'La contraseña nueva necesita 8 caracteres y al menos 3 de las reglas.' };
  if (nueva === actual) return { ok: false, error: 'La contraseña nueva tiene que ser distinta de la actual.' };
  const { data: { user } } = await s.supabase.auth.getUser();
  const pub = supabasePublico();
  if (!user?.email || !pub) return { ok: false, error: 'No se ha podido comprobar tu cuenta. Vuelve a entrar.' };
  const prueba = await pub.auth.signInWithPassword({ email: user.email, password: actual });
  if (prueba.error) return { ok: false, error: 'La contraseña actual no es correcta.' };
  await pub.auth.signOut({ scope: 'local' }).catch(() => {});   // solo esa sesión de prueba, no las tuyas
  const { error } = await s.supabase.auth.updateUser({ password: nueva });
  if (error) {
    if (/different from the old/i.test(error.message)) return { ok: false, error: 'La contraseña nueva tiene que ser distinta de la actual.' };
    if (/weak|pwned|leaked/i.test(error.message)) return { ok: false, error: 'Esa contraseña es demasiado fácil o ha aparecido en filtraciones. Elige otra.' };
    return { ok: false, error: mensajeError(error.message) };
  }
  return { ok: true };
}

// CAMBIAR MI EMAIL de acceso (usuario, 2026-11-14: «¿y si su empresa cambia de dominio?»).
// Pide la contraseña actual (como cambiarla: una sesión olvidada no basta) y Supabase manda
// enlaces de confirmación al correo nuevo y al actual (cambio seguro): el email cambia al
// confirmarlos, y desde entonces se entra con el nuevo y los avisos llegan al nuevo. El
// perfil se sincroniza solo (tg_sincronizar_email_usuario). La lista de bloqueo de altas
// también aplica aquí: a un email o dominio vetado no se puede saltar cambiándose el correo.
export async function cambiarMiEmail(nuevo: string, clave: string): Promise<{ ok: true } | { ok: false; error: string }> {
  comprobarEntrada("app/panel/(app)/mi-cuenta/acciones#cambiarMiEmail", [nuevo, clave]);
  const s = await sesion();
  if (!s?.perfil) return { ok: false, error: 'Tu sesión ha caducado. Vuelve a entrar.' };
  // El Admin Master NO cambia su email desde aquí (usuario, 2026-11-16): es la llave de toda
  // la plataforma; si alguien entra en su sesión, con esto se quedaría la cuenta.
  if (s.perfil.rol === 'admin') return { ok: false, error: 'El email del Admin Master no se cambia desde la plataforma.' };
  const email = nuevo.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return { ok: false, error: 'El email nuevo no es válido.' };
  if (!clave) return { ok: false, error: 'Escribe tu contraseña para confirmar.' };
  const { data: { user } } = await s.supabase.auth.getUser();
  const pub = supabasePublico();
  if (!user?.email || !pub) return { ok: false, error: 'No se ha podido comprobar tu cuenta. Vuelve a entrar.' };
  if (email === user.email.toLowerCase()) return { ok: false, error: 'Ese ya es tu email actual.' };
  const prueba = await pub.auth.signInWithPassword({ email: user.email, password: clave });
  if (prueba.error) return { ok: false, error: 'La contraseña no es correcta.' };
  await pub.auth.signOut({ scope: 'local' }).catch(() => {});
  // Un usuario de cliente tampoco puede pasar al email de un transportista (usuario, 2026-11-22).
  const { data: vetado } = s.perfil.rol === 'cliente'
    ? await s.supabase.rpc('email_admitido_para_cliente', { p_email: email }).then((r) => ({ data: r.data === false }))
    : await s.supabase.rpc('alta_bloqueada', { p_email: email });
  if (vetado) return { ok: false, error: 'Ese email no se puede usar en la plataforma.' };
  const { error } = await s.supabase.auth.updateUser({ email }, { emailRedirectTo: `${await origen()}/panel` });
  if (error) {
    if (/already.*registered|already.*exists|duplicate/i.test(error.message)) return { ok: false, error: 'Ya existe una cuenta con ese email.' };
    if (/rate limit|too many|security purposes/i.test(error.message)) return { ok: false, error: 'Se han pedido varios cambios seguidos. Espera unos minutos y vuelve a probar.' };
    return { ok: false, error: mensajeError(error.message) };
  }
  return { ok: true };
}

// ---- LA EMPRESA DE MI ALTA (usuario, 2026-11-16) -----------------------------------------
// El registro solo pide los datos de la PERSONA. Quien entra con el alta pendiente dice
// primero de qué empresa es, escribiendo su CIF / NIF:
//   · si ya es cliente de Dynamo → no rellena nada más: Dynamo le asocia al verificar;
//   · si no → rellena el alta de la empresa (razón social, domicilio fiscal y contacto).
// La búsqueda solo contesta «está / no está» (nunca el nombre ni datos del cliente) y tiene
// tope diario: lo impone la base de datos (buscar_empresa_de_mi_alta). Lo que escribe se
// guarda en los datos del alta del propio usuario (los que lee «Altas» de Dynamo); no crea
// ni toca ningún cliente: eso lo hace Dynamo al verificar. Solo con el alta pendiente.
export type EmpresaAlta = {
  empresa: string; cif: string; pais: string; direccion: string; codigo_postal: string; poblacion: string; provincia: string;
  telefono: string; email: string;
};
export type PasoAlta = 'buscar' | 'existente' | 'nueva';
export type MiAlta = { paso: PasoAlta; guardada: boolean; miEmail: string; d: EmpresaAlta };
const EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const cifLimpio = (v: string) => (v ?? '').toUpperCase().replace(/[\s.\-/]/g, '');
const NO_ADMITIDO = `Esta empresa no se puede dar de alta como cliente. Si crees que es un error, llámanos al ${CONTACTO.telefono}.`;

export async function empresaDeMiAlta(): Promise<MiAlta | null> {
  comprobarEntrada("app/panel/(app)/mi-cuenta/acciones#empresaDeMiAlta", []);
  const s = await sesion();
  if (!s?.perfil) return null;
  const { data: { user } } = await s.supabase.auth.getUser();
  const m = (user?.user_metadata ?? {}) as Record<string, unknown>;
  const t = (k: string) => (typeof m[k] === 'string' ? (m[k] as string) : '');
  const d: EmpresaAlta = {
    empresa: t('empresa') || t('razon_social'), cif: t('cif'), pais: (t('pais') || 'ES').toUpperCase().slice(0, 2),
    direccion: t('direccion'), codigo_postal: t('codigo_postal'), poblacion: t('poblacion'), provincia: t('provincia'),
    telefono: t('empresa_telefono'), email: t('empresa_email'),
  };
  const paso: PasoAlta = !d.cif ? 'buscar' : t('alta_paso') === 'existente' ? 'existente' : 'nueva';
  return { paso, guardada: paso === 'nueva' && !!d.empresa && !!d.direccion, miEmail: user?.email ?? s.perfil.email ?? '', d };
}

// Paso 1: ¿ese CIF / NIF es ya de un cliente? Deja apuntado en el alta el CIF y el camino.
export async function buscarEmpresaDeMiAlta(cif: string, pais: string): Promise<{ ok: true; paso: 'existente' | 'nueva'; cif: string; pais: string } | { ok: false; error: string }> {
  comprobarEntrada("app/panel/(app)/mi-cuenta/acciones#buscarEmpresaDeMiAlta", [cif, pais]);
  const s = await sesion();
  if (!s?.perfil) return { ok: false, error: 'Tu sesión ha caducado. Vuelve a entrar.' };
  if (s.perfil.estado !== 'pendiente_verificacion') return { ok: false, error: 'Tu alta ya está verificada.' };
  const p = /^[A-Za-z]{2}$/.test(pais) ? pais.toUpperCase() : 'ES';
  if (!cifLimpio(cif)) return { ok: false, error: 'Escribe el CIF / NIF de tu empresa (o tu NIF si eres autónomo).' };
  const { validaIdFiscalPais } = await import('@/lib/idFiscal');
  const fiscal = validaIdFiscalPais(cif, p);
  if (!fiscal || !fiscal.ok) return { ok: false, error: `El CIF / NIF no es válido${fiscal?.msg ? ` (${fiscal.msg})` : ''}. Revísalo.` };
  const limpio = cifLimpio(cif);
  const { data, error } = await s.supabase.rpc('buscar_empresa_de_mi_alta', { p_cif: limpio });
  if (error) return { ok: false, error: mensajeError(error.message) };
  if (data === 'tope') return { ok: false, error: `Has hecho demasiadas búsquedas hoy. Escríbenos a ${CONTACTO.email} o llámanos al ${CONTACTO.telefono} y terminamos tu alta contigo.` };
  // CIF de un transportista: nunca puede ser cliente (usuario, 2026-11-22). Sin decir por qué.
  if (data === 'no_admitido') return { ok: false, error: NO_ADMITIDO };
  if (data !== 'encontrado' && data !== 'no_encontrado') return { ok: false, error: 'El CIF / NIF no es válido. Revísalo.' };
  const { data: { user } } = await s.supabase.auth.getUser();
  const mismo = cifLimpio(String((user?.user_metadata ?? {}).cif ?? '')) === limpio;
  // Empresa que ya es cliente, o CIF distinto del que tenía: lo que hubiera escrito de otra empresa ya no vale.
  const vaciar = data === 'encontrado' || !mismo
    ? { empresa: '', direccion: '', codigo_postal: '', poblacion: '', provincia: '', empresa_telefono: '', empresa_email: '' } : {};
  const paso = data === 'encontrado' ? 'existente' as const : 'nueva' as const;
  const g = await s.supabase.auth.updateUser({ data: { ...vaciar, cif: limpio, pais: p, alta_paso: paso } });
  if (g.error) return { ok: false, error: mensajeError(g.error.message) };
  return { ok: true, paso, cif: limpio, pais: p };
}

// Paso 2 (solo empresa nueva): sus datos. Todo obligatorio (usuario, 2026-11-16).
export async function guardarEmpresaDeMiAlta(d: EmpresaAlta): Promise<{ ok: true; paso: 'existente' | 'nueva' } | { ok: false; error: string; campo?: keyof EmpresaAlta }> {
  comprobarEntrada("app/panel/(app)/mi-cuenta/acciones#guardarEmpresaDeMiAlta", [d]);
  const s = await sesion();
  if (!s?.perfil) return { ok: false, error: 'Tu sesión ha caducado. Vuelve a entrar.' };
  if (s.perfil.estado !== 'pendiente_verificacion') return { ok: false, error: 'Tu alta ya está verificada: los datos de la empresa los cambia Dynamo.' };
  const limpio = (v: string, max: number) => (v ?? '').trim().replace(/\s+/g, ' ').slice(0, max);
  const empresa = limpio(d.empresa, 200), pais = /^[A-Za-z]{2}$/.test(d.pais) ? d.pais.toUpperCase() : 'ES';
  if (empresa.length < 2) return { ok: false, campo: 'empresa', error: 'Escribe la razón social de la empresa (o tu nombre y apellidos si eres autónomo).' };
  const { validaIdFiscalPais } = await import('@/lib/idFiscal');
  const fiscal = validaIdFiscalPais(d.cif, pais);
  if (!fiscal || !fiscal.ok) return { ok: false, campo: 'cif', error: `El CIF / NIF no es válido${fiscal?.msg ? ` (${fiscal.msg})` : ''}. Revísalo.` };
  const direccion = limpio(d.direccion, 200), cp = limpio(d.codigo_postal, 12), poblacion = limpio(d.poblacion, 100), provincia = limpio(d.provincia, 100);
  if (direccion.length < 3) return { ok: false, campo: 'direccion', error: 'Escribe la dirección fiscal (calle y número).' };
  if (!/^[A-Za-z0-9 -]{3,12}$/.test(cp)) return { ok: false, campo: 'codigo_postal', error: 'Escribe el código postal.' };
  if (poblacion.length < 2) return { ok: false, campo: 'poblacion', error: 'Escribe la población.' };
  if (provincia.length < 2) return { ok: false, campo: 'provincia', error: 'Escribe la provincia.' };
  const tel = normalizaTel(d.telefono);
  if (!tel || !/^\+?[0-9]{6,15}$/.test(tel)) return { ok: false, campo: 'telefono', error: 'Escribe el teléfono de la empresa: solo números, con el prefijo del país.' };
  const email = limpio(d.email, 200).toLowerCase();
  if (!EMAIL_OK.test(email)) return { ok: false, campo: 'email', error: 'Escribe un email válido de la empresa.' };
  // Por si el CIF se ha dado de alta como cliente entretanto: entonces no hace falta nada de esto.
  const cif = cifLimpio(d.cif);
  const { data: hay } = await s.supabase.rpc('buscar_empresa_de_mi_alta', { p_cif: cif });
  if (hay === 'no_admitido') return { ok: false, campo: 'cif', error: NO_ADMITIDO };
  if (hay === 'encontrado') {
    const g = await s.supabase.auth.updateUser({ data: { cif, pais, alta_paso: 'existente', empresa: '', direccion: '', codigo_postal: '', poblacion: '', provincia: '', empresa_telefono: '', empresa_email: '' } });
    return g.error ? { ok: false, error: mensajeError(g.error.message) } : { ok: true, paso: 'existente' };
  }
  const { error } = await s.supabase.auth.updateUser({ data: {
    empresa, cif, pais, direccion, codigo_postal: cp, poblacion, provincia, empresa_telefono: tel, empresa_email: email, alta_paso: 'nueva',
  } });
  if (error) return { ok: false, error: mensajeError(error.message) };
  return { ok: true, paso: 'nueva' };
}

// ---- El TRANSPORTISTA cambia lo operativo de su empresa y su flota -----------------------
// Lo fiscal (razón social, CIF, dirección), la bolsa y el plazo de pago solo los cambia
// Dynamo: lo impone la base de datos (funciones mi_* con lista cerrada de campos).
type Res = { ok: true } | { ok: false; error: string };
const limpiaError = (m: string) => mensajeError(m.replace(/^.*?ERROR:\s*/i, ''));

export async function guardarMiTransporte(d: { nima: string }): Promise<Res> {
  comprobarEntrada("app/panel/(app)/mi-cuenta/acciones#guardarMiTransporte", [d]);
  const s = await soloTransportista();
  if (!s) return { ok: false, error: 'Solo un transportista con la cuenta activa puede cambiar estos datos.' };
  const { error } = await s.supabase.rpc('guardar_mis_datos_transporte', { p_nima: d.nima });
  return error ? { ok: false, error: limpiaError(error.message) } : { ok: true };
}

export type MiVehiculo = { id: string | null; matricula: string; tipo: 'tractora' | 'remolque' | 'rigido'; adr: boolean; tiene_plataforma_elevadora: boolean };
export async function guardarMiVehiculo(v: MiVehiculo): Promise<Res> {
  comprobarEntrada("app/panel/(app)/mi-cuenta/acciones#guardarMiVehiculo", [v]);
  const s = await soloTransportista();
  if (!s) return { ok: false, error: 'Solo un transportista con la cuenta activa puede cambiar su flota.' };
  const mat = v.matricula.trim().toUpperCase();
  if (!v.id && mat.replace(/[^A-Z0-9]/g, '').length < 4) return { ok: false, error: 'Escribe la matrícula completa.' };
  if (!['tractora', 'remolque', 'rigido'].includes(v.tipo)) return { ok: false, error: 'Elige el tipo de vehículo.' };
  const { error } = await s.supabase.rpc('guardar_mi_vehiculo', {
    p_id: v.id, p_matricula: mat, p_tipo: v.tipo,
    p_adr: !!v.adr, p_plataforma_elevadora: v.tipo === 'rigido' && !!v.tiene_plataforma_elevadora,
  });
  return error ? { ok: false, error: limpiaError(error.message) } : { ok: true };
}

export type MiConductor = { id: string | null; nombre: string; documento: string; pais: string; telefono: string };
export async function guardarMiConductor(c: MiConductor): Promise<Res> {
  comprobarEntrada("app/panel/(app)/mi-cuenta/acciones#guardarMiConductor", [c]);
  const s = await soloTransportista();
  if (!s) return { ok: false, error: 'Solo un transportista con la cuenta activa puede cambiar su flota.' };
  if (!c.nombre.trim()) return { ok: false, error: 'Pon el nombre y apellidos del conductor.' };
  let doc = c.documento.trim();
  const pais = /^[A-Z]{2}$/.test(c.pais) ? c.pais : 'ES';
  if (doc) {
    const r = validaDoc(pais, doc);
    if (!r.ok) return { ok: false, error: r.msg ?? 'El documento no es válido.' };
    doc = r.norm;
  }
  const tel = normalizaTel(c.telefono);
  if (tel && !/^\+?[0-9]{6,15}$/.test(tel)) return { ok: false, error: 'El teléfono no es válido: solo números, con el prefijo del país.' };
  const { error } = await s.supabase.rpc('guardar_mi_conductor', {
    p_id: c.id, p_nombre: c.nombre.trim(), p_documento: doc, p_documento_pais: pais, p_telefono: tel,
  });
  return error ? { ok: false, error: limpiaError(error.message) } : { ok: true };
}

export async function darDeBajaFlota(tipo: 'vehiculo' | 'conductor', id: string): Promise<Res> {
  comprobarEntrada("app/panel/(app)/mi-cuenta/acciones#darDeBajaFlota", [tipo, id]);
  const s = await soloTransportista();
  if (!s) return { ok: false, error: 'Solo un transportista con la cuenta activa puede cambiar su flota.' };
  const { error } = await s.supabase.rpc('dar_baja_mi_flota', { p_tipo: tipo, p_id: id });
  return error ? { ok: false, error: limpiaError(error.message) } : { ok: true };
}

// ---- BAJA DE LA CUENTA (usuario, 2026-11-06) ----------------------------------------------
// El cliente o el transportista se da de baja él mismo. Se da de baja su ACCESO: no se borra
// nada (empresa, envíos, documentos y facturas se guardan por ley). Pide la contraseña, como
// cambiarla, para que una sesión olvidada abierta no baste. Después cierra sus sesiones en
// todos los dispositivos.
export async function darmeDeBaja(clave: string, motivo: string): Promise<Res> {
  comprobarEntrada("app/panel/(app)/mi-cuenta/acciones#darmeDeBaja", [clave, motivo]);
  const s = await sesion();
  if (!s?.perfil) return { ok: false, error: 'Tu sesión ha caducado. Vuelve a entrar.' };
  if (!['cliente', 'transportista'].includes(s.perfil.rol)) return { ok: false, error: 'Las cuentas del equipo de Dynamo se dan de baja desde Usuarios.' };
  if (!clave) return { ok: false, error: 'Escribe tu contraseña para confirmar.' };
  const { data: { user } } = await s.supabase.auth.getUser();
  const pub = supabasePublico();
  if (!user?.email || !pub) return { ok: false, error: 'No se ha podido comprobar tu cuenta. Vuelve a entrar.' };
  const prueba = await pub.auth.signInWithPassword({ email: user.email, password: clave });
  if (prueba.error) return { ok: false, error: 'La contraseña no es correcta.' };
  await pub.auth.signOut({ scope: 'local' }).catch(() => {});
  const { data, error } = await s.supabase.rpc('darme_de_baja', { p_motivo: motivo.trim() || null });
  if (error) return { ok: false, error: mensajeError(error.message) };
  const r = (data ?? {}) as { resultado?: string; envios?: number };
  if (r.resultado === 'envios_en_marcha') return { ok: false, error: `Eres el único usuario de tu empresa y hay ${r.envios} envío${r.envios === 1 ? '' : 's'} en marcha: llámanos al ${CONTACTO.telefono} y lo dejamos atado antes de la baja.` };
  if (r.resultado === 'ya_suspendida') return { ok: false, error: 'Tu cuenta ya está suspendida o dada de baja.' };
  if (r.resultado !== 'ok') return { ok: false, error: 'No se ha podido hacer la baja. Llámanos y la hacemos nosotros.' };
  await s.supabase.auth.signOut({ scope: 'global' }).catch(() => {});
  return { ok: true };
}

export type Companero = { email: string; nombre: string };

// AÑADIR UN COMPAÑERO de tu misma empresa (usuario, 2026-11-11: «puede añadirte en su
// cuenta añadiendo tu email y darte de alta él directamente, es instantáneo, sin
// esperas»). Solo cliente o transportista ACTIVO, y el compañero entra SIEMPRE en la
// misma empresa y con el mismo rol que quien lo añade (no se puede elegir otra): quien
// ya está dentro responde por él. Supabase le manda el email para crear su contraseña.
export async function anadirCompanero(d: Companero): Promise<{ ok: true } | { ok: false; error: string }> {
  comprobarEntrada("app/panel/(app)/mi-cuenta/acciones#anadirCompanero", [d]);
  const s = await sesion();
  if (!s?.perfil) return { ok: false, error: 'Tu sesión ha caducado. Vuelve a entrar.' };
  const p = s.perfil;
  const empresa = p.rol === 'cliente' ? { cliente_id: p.cliente_id } : p.rol === 'transportista' ? { transportista_id: p.transportista_id } : null;
  if (p.estado !== 'activa' || !empresa || !(empresa.cliente_id ?? empresa.transportista_id)) {
    return { ok: false, error: 'Solo una cuenta activa de cliente o transportista puede añadir compañeros de su empresa.' };
  }
  const email = d.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return { ok: false, error: 'El email no es válido.' };
  if (d.nombre.trim().length < 3) return { ok: false, error: 'Pon su nombre y apellidos.' };
  const servicio = supabaseServicio();
  if (!servicio) return { ok: false, error: `Falta conectar el envío de invitaciones: llámanos al ${CONTACTO.telefono} y lo damos de alta nosotros.` };
  const { data: ya } = await servicio.from('usuarios').select('id').ilike('email', email).maybeSingle();
  if (ya) return { ok: false, error: 'Ya existe una cuenta con ese email.' };
  const { data, error } = await servicio.auth.admin.inviteUserByEmail(email, {
    data: { nombre: d.nombre.trim(), anadido_por: p.id }, redirectTo: `${await origen()}/panel/confirmar`,
  });
  if (error || !data.user) return { ok: false, error: mensajeError(error?.message ?? 'No se ha podido enviar la invitación.') };
  // Misma empresa y mismo rol que quien añade, ACTIVA al instante (sin pasar por Altas).
  // Con la clave de servicio: el RLS no deja a un cliente escribir en usuarios.
  const { error: e2 } = await servicio.from('usuarios')
    .update({ nombre: d.nombre.trim(), rol: p.rol, estado: 'activa', ...empresa }).eq('id', data.user.id);
  if (e2) return { ok: false, error: `La invitación ha salido, pero no se ha podido activar: ${mensajeError(e2.message)}. Llámanos y lo rematamos.` };
  return { ok: true };
}

// LAS PERSONAS DE CONTACTO DE MI EMPRESA (usuario, 2026-11-17): cualquier usuario ACTIVO de
// un cliente las cambia él mismo desde «Editar empresa». Solo eso: la razón social, el CIF,
// el sector y el domicilio fiscal los cambia Dynamo. La base de datos ya solo le deja tocar
// los contactos de SU empresa; aquí se comprueba además que la cuenta no esté en solo lectura.
export async function guardarContactosDeMiEmpresa(lista: ContactoDatos[]): Promise<Res> {
  comprobarEntrada("app/panel/(app)/mi-cuenta/acciones#guardarContactosDeMiEmpresa", [lista]);
  const s = await sesion();
  if (!s?.perfil) return { ok: false, error: 'Tu sesión ha caducado. Vuelve a entrar.' };
  const p = s.perfil;
  if (p.rol !== 'cliente' || !p.cliente_id) return { ok: false, error: 'Solo los usuarios de un cliente cambian los contactos de su empresa.' };
  if (p.estado !== 'activa') return { ok: false, error: 'Tu cuenta está en solo lectura: no puedes cambiar los contactos de tu empresa.' };
  if (!Array.isArray(lista) || lista.length > 20) return { ok: false, error: 'Como mucho 20 personas de contacto.' };
  // Solo los dos roles de un cliente; cualquier otro valor entra como Logística.
  const limpia = sinVacios(lista).map((c) => ({ ...c, funcion: c.funcion === 'contabilidad' ? 'contabilidad' as const : 'trafico' as const }));
  const mal = validarContactos(limpia);
  if (mal) return { ok: false, error: mal };
  const e = await guardarContactos(s.supabase, { cliente_id: p.cliente_id }, limpia);
  return e ? { ok: false, error: 'No se han podido guardar los contactos. Vuelve a intentarlo.' } : { ok: true };
}

// DOBLE PASO: quitar el móvil dado de alta (para cambiarlo por otro). Pide la contraseña:
// con una sesión que alguien se dejó abierta no se puede poner otro móvil a la cuenta.
// Supabase solo deja quitarlo con el segundo paso ya hecho en esta sesión.
export async function quitarMiDoblePaso(clave: string): Promise<{ ok: true } | { ok: false; error: string }> {
  comprobarEntrada("app/panel/(app)/mi-cuenta/acciones#quitarMiDoblePaso", [clave]);
  const s = await sesion();
  if (!s?.perfil) return { ok: false, error: 'Tu sesión ha caducado. Vuelve a entrar.' };
  const eClave = await comprobarMiClave(s.supabase, clave);
  if (eClave) return { ok: false, error: eClave };
  const { data: { user } } = await s.supabase.auth.getUser();
  for (const f of movilesDe(user)) {
    const { error } = await s.supabase.auth.mfa.unenroll({ factorId: f.id });
    if (error) return { ok: false, error: 'No se ha podido quitar el doble paso. Sal, vuelve a entrar con tu código e inténtalo de nuevo.' };
  }
  await s.supabase.auth.refreshSession().catch(() => {});   // la sesión deja de llevar el segundo paso
  return { ok: true };
}

// AVISOS POR WHATSAPP (usuario, 2026-11-25): cada usuario da o quita su permiso. Hace falta un
// móvil en sus datos; la base de datos apunta la fecha como prueba (mi_avisos_whatsapp).
export async function cambiarAvisosWhatsApp(activo: boolean): Promise<{ ok: true; telefono: string | null } | { ok: false; error: string; sinMovil?: boolean }> {
  comprobarEntrada("app/panel/(app)/mi-cuenta/acciones#cambiarAvisosWhatsApp", [activo]);
  const s = await sesion();
  if (!s?.perfil) return { ok: false, error: 'Tu sesión ha caducado. Vuelve a entrar.' };
  const { data, error } = await s.supabase.rpc('mi_avisos_whatsapp', { p_activo: activo });
  if (error) return { ok: false, error: mensajeError(error.message) };
  const r = data as { resultado: string; telefono?: string | null };
  if (r.resultado === 'sin_movil') return { ok: false, sinMovil: true, error: 'Pon antes tu móvil en «Editar datos» (con el prefijo del país).' };
  return { ok: true, telefono: r.telefono ?? null };
}

// «Ahora no» a la pregunta única de los avisos por WhatsApp: no se vuelve a preguntar.
export async function noPreguntarAvisosWhatsApp(): Promise<{ ok: true } | { ok: false; error: string }> {
  comprobarEntrada("app/panel/(app)/mi-cuenta/acciones#noPreguntarAvisosWhatsApp", []);
  const s = await sesion();
  if (!s?.perfil) return { ok: false, error: 'Tu sesión ha caducado. Vuelve a entrar.' };
  const { error } = await s.supabase.rpc('mi_avisos_whatsapp_no_preguntar');
  if (error) return { ok: false, error: mensajeError(error.message) };
  return { ok: true };
}
