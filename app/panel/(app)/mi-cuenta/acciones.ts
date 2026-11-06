'use server';

import { normalizaTel } from '@/lib/paises';

import { mensajeError } from '@/lib/mensajeError';
import { claveValida } from '@/lib/clave';
import { sesion } from '@/lib/sesion';
import { validaDoc } from '@/lib/documentoIdentidad';
import { supabasePublico } from '@/lib/supabase/publico';
import { soloTransportista } from '@/lib/guardia';
import { comprobarEntrada } from '@/lib/entradas/comprobar';
import { CONTACTO } from '@/lib/atencion';

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

// ---- El TRANSPORTISTA cambia lo operativo de su empresa y su flota -----------------------
// Lo fiscal (razón social, CIF, dirección), la bolsa y el plazo de pago solo los cambia
// Dynamo: lo impone la base de datos (funciones mi_* con lista cerrada de campos).
type Res = { ok: true } | { ok: false; error: string };
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const fechaOnull = (f: string) => (FECHA.test(f) ? f : null);
const limpiaError = (m: string) => mensajeError(m.replace(/^.*?ERROR:\s*/i, ''));

export async function guardarMiTransporte(d: { nima: string; compania: string; poliza: string; vence: string }): Promise<Res> {
  comprobarEntrada("app/panel/(app)/mi-cuenta/acciones#guardarMiTransporte", [d]);
  const s = await soloTransportista();
  if (!s) return { ok: false, error: 'Solo un transportista con la cuenta activa puede cambiar estos datos.' };
  const { error } = await s.supabase.rpc('guardar_mis_datos_transporte', {
    p_nima: d.nima, p_seguro_compania: d.compania, p_seguro_poliza: d.poliza, p_seguro_vence: fechaOnull(d.vence),
  });
  return error ? { ok: false, error: limpiaError(error.message) } : { ok: true };
}

export type MiVehiculo = { id: string | null; matricula: string; tipo: 'tractora' | 'remolque' | 'rigido'; itv: string; seguro: string; tarjeta: string; adr: boolean; tiene_plataforma_elevadora: boolean };
export async function guardarMiVehiculo(v: MiVehiculo): Promise<Res> {
  comprobarEntrada("app/panel/(app)/mi-cuenta/acciones#guardarMiVehiculo", [v]);
  const s = await soloTransportista();
  if (!s) return { ok: false, error: 'Solo un transportista con la cuenta activa puede cambiar su flota.' };
  const mat = v.matricula.trim().toUpperCase();
  if (!v.id && mat.replace(/[^A-Z0-9]/g, '').length < 4) return { ok: false, error: 'Escribe la matrícula completa.' };
  if (!['tractora', 'remolque', 'rigido'].includes(v.tipo)) return { ok: false, error: 'Elige el tipo de vehículo.' };
  const { error } = await s.supabase.rpc('guardar_mi_vehiculo', {
    p_id: v.id, p_matricula: mat, p_tipo: v.tipo, p_itv_vence: fechaOnull(v.itv), p_seguro_vence: fechaOnull(v.seguro), p_tarjeta_transporte_vence: fechaOnull(v.tarjeta),
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
