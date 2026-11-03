'use server';

import { sesion } from '@/lib/sesion';

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
