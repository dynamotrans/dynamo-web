'use server';

import { mensajeError } from '@/lib/mensajeError';
import { sesion, esGestor } from '@/lib/sesion';

export type OperadorDatos = {
  cliente_id: string | null; razon_social: string; cif: string; telefono: string; email: string;
  persona_contacto: string; web: string; anotaciones: string;
};
type Res = { ok: true; id: string } | { ok: false; error: string };

function traducir(msg: string): string {
  if (/ux_operadores_cliente_cif|duplicate key/i.test(msg)) return 'Ese CIF/NIF ya está en el catálogo de este cliente.';
  if (/telefono/i.test(msg)) return 'El teléfono no es válido: solo números, con el prefijo del país (p. ej. +34600111222).';
  if (/email/i.test(msg)) return 'El email no es válido.';
  if (/permission denied|42501|row-level security/i.test(msg)) return 'No tienes permiso para hacer esto.';
  return mensajeError(msg);   // los de las reglas de la base de datos ya vienen en castellano
}
const vacio = (s: string) => (s ?? '').trim() || null;

// Dynamo gestiona el de cualquier cliente; un cliente, el suyo (lo impone la base de datos).
async function quien() {
  const s = await sesion();
  if (!s?.perfil || s.perfil.estado !== 'activa' || !(esGestor(s.perfil.rol) || s.perfil.rol === 'cliente')) return null;
  return s;
}

export async function guardarOperador(id: string | null, d: OperadorDatos): Promise<Res> {
  const s = await quien();
  if (!s) return { ok: false, error: 'No tienes permiso para gestionar transportistas.' };
  if (!d.razon_social.trim() || !d.cif.trim()) return { ok: false, error: 'El nombre y el CIF/NIF son obligatorios.' };
  const dynamo = esGestor(s.perfil!.rol);
  if (dynamo && !id && !d.cliente_id) return { ok: false, error: 'Elige de qué cliente es este transportista.' };
  const tel = (d.telefono ?? '').replace(/[\s().-]/g, '');
  const fila: Record<string, unknown> = {
    razon_social: d.razon_social.trim(), cif: d.cif.trim().toUpperCase(), telefono: tel || null, email: vacio(d.email)?.toLowerCase() ?? null,
    persona_contacto: vacio(d.persona_contacto), web: vacio(d.web), anotaciones: vacio(d.anotaciones),
  };
  if (!id && dynamo) fila.cliente_id = d.cliente_id;   // un cliente: lo pone la base de datos
  const q = id ? s.supabase.from('operadores').update(fila).eq('id', id).select('id').single()
               : s.supabase.from('operadores').insert(fila).select('id').single();
  const { data, error } = await q;
  if (error) return { ok: false, error: traducir(error.message) };
  return { ok: true, id: data.id };
}

// Borrado suave: los envíos ya hechos con él no pierden a quién se dieron.
export async function borrarOperador(id: string): Promise<Res> {
  const s = await quien();
  if (!s) return { ok: false, error: 'No tienes permiso para gestionar transportistas.' };
  const { error } = await s.supabase.from('operadores').update({ borrado: true, borrado_en: new Date().toISOString() }).eq('id', id);
  if (error) return { ok: false, error: traducir(error.message) };
  return { ok: true, id };
}
