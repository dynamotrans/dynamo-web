'use server';

import { sesion } from '@/lib/sesion';
import { validaDoc } from '@/lib/documentoIdentidad';

export type MisDatos = { nombre: string; telefono: string; documento: string; cargo: string; idioma: string };

// Cada usuario cambia SUS datos personales. Rol, estado, empresa y límites no se los puede
// tocar nadie a sí mismo: lo impide la base de datos (migración permisos_por_rol).
export async function guardarMisDatos(d: MisDatos): Promise<{ ok: true } | { ok: false; error: string }> {
  const s = await sesion();
  if (!s?.perfil) return { ok: false, error: 'Tu sesión ha caducado. Vuelve a entrar.' };
  if (!d.nombre.trim()) return { ok: false, error: 'Pon tu nombre y apellidos.' };
  const tel = d.telefono.replace(/[\s().-]/g, '');
  const { error } = await s.supabase.from('usuarios').update({
    nombre: d.nombre.trim(), telefono: tel || null, documento: d.documento.trim().toUpperCase() || null,
    cargo: d.cargo.trim() || null, idioma: d.idioma || 'es',
  }).eq('id', s.perfil.id);
  if (error) {
    if (/telefono/i.test(error.message)) return { ok: false, error: 'El teléfono no es válido: solo números, con el prefijo del país (p. ej. +34600111222).' };
    if (/idioma/i.test(error.message)) return { ok: false, error: 'Ese idioma no está disponible.' };
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

// ---- El TRANSPORTISTA cambia lo operativo de su empresa y su flota -----------------------
// Lo fiscal (razón social, CIF, dirección), la bolsa y el plazo de pago solo los cambia
// Dynamo: lo impone la base de datos (funciones mi_* con lista cerrada de campos).
type Res = { ok: true } | { ok: false; error: string };
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const fechaOnull = (f: string) => (FECHA.test(f) ? f : null);
async function soloTransportista() {
  const s = await sesion();
  if (!s?.perfil) return null;
  if (s.perfil.rol !== 'transportista' || s.perfil.estado !== 'activa') return null;
  return s;
}
const limpiaError = (m: string) => m.replace(/^.*?ERROR:\s*/i, '');

export async function guardarMiTransporte(d: { nima: string; compania: string; poliza: string; vence: string }): Promise<Res> {
  const s = await soloTransportista();
  if (!s) return { ok: false, error: 'Solo un transportista con la cuenta activa puede cambiar estos datos.' };
  const { error } = await s.supabase.rpc('mi_transporte_guardar', {
    p_nima: d.nima, p_seguro_compania: d.compania, p_seguro_poliza: d.poliza, p_seguro_vence: fechaOnull(d.vence),
  });
  return error ? { ok: false, error: limpiaError(error.message) } : { ok: true };
}

export type MiVehiculo = { id: string | null; matricula: string; tipo: 'tractora' | 'remolque' | 'rigido'; itv: string; seguro: string; tarjeta: string; adr: boolean; trampilla: boolean };
export async function guardarMiVehiculo(v: MiVehiculo): Promise<Res> {
  const s = await soloTransportista();
  if (!s) return { ok: false, error: 'Solo un transportista con la cuenta activa puede cambiar su flota.' };
  const mat = v.matricula.trim().toUpperCase();
  if (!v.id && mat.replace(/[^A-Z0-9]/g, '').length < 4) return { ok: false, error: 'Escribe la matrícula completa.' };
  if (!['tractora', 'remolque', 'rigido'].includes(v.tipo)) return { ok: false, error: 'Elige el tipo de vehículo.' };
  const { error } = await s.supabase.rpc('mi_vehiculo_guardar', {
    p_id: v.id, p_matricula: mat, p_tipo: v.tipo, p_itv: fechaOnull(v.itv), p_seguro: fechaOnull(v.seguro), p_tarjeta: fechaOnull(v.tarjeta),
    p_adr: !!v.adr, p_trampilla: v.tipo === 'rigido' && !!v.trampilla,
  });
  return error ? { ok: false, error: limpiaError(error.message) } : { ok: true };
}

export type MiConductor = { id: string | null; nombre: string; documento: string; pais: string; telefono: string };
export async function guardarMiConductor(c: MiConductor): Promise<Res> {
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
  const tel = c.telefono.replace(/[\s().-]/g, '');
  if (tel && !/^\+?[0-9]{6,15}$/.test(tel)) return { ok: false, error: 'El teléfono no es válido: solo números, con el prefijo del país.' };
  const { error } = await s.supabase.rpc('mi_conductor_guardar', {
    p_id: c.id, p_nombre: c.nombre.trim(), p_documento: doc, p_documento_pais: pais, p_telefono: tel,
  });
  return error ? { ok: false, error: limpiaError(error.message) } : { ok: true };
}

export async function darDeBajaFlota(tipo: 'vehiculo' | 'conductor', id: string): Promise<Res> {
  const s = await soloTransportista();
  if (!s) return { ok: false, error: 'Solo un transportista con la cuenta activa puede cambiar su flota.' };
  const { error } = await s.supabase.rpc('mi_flota_baja', { p_tipo: tipo, p_id: id });
  return error ? { ok: false, error: limpiaError(error.message) } : { ok: true };
}
