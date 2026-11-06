'use server';

import { sesion } from '@/lib/sesion';
import type { Json } from '@/lib/supabase/tipos';

// Cambiar un parámetro de la plataforma (tabla `parametros`). Solo el rol ADMIN: cambian
// cómo funciona todo (precios, plazos, PIN, mantenimiento…). Queda en la auditoría.
export async function guardarParametro(clave: string, valor: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
  const s = await sesion();
  if (!s?.perfil || s.perfil.estado !== 'activa' || s.perfil.rol !== 'admin') return { ok: false, error: 'Solo un administrador cambia los parámetros.' };
  if (valor === undefined) return { ok: false, error: 'Falta el valor.' };
  // Países en los que trabajamos: «ES, PT, FR» (o la lista tal cual) → ["ES","PT","FR"].
  if (clave === 'cobertura_paises') {
    const lista = [...new Set(String(Array.isArray(valor) ? valor.join(',') : valor).toUpperCase().replace(/[\[\]"\s]/g, '').split(',').filter(Boolean))];
    if (!lista.length || lista.some((x) => !/^[A-Z]{2}$/.test(x))) return { ok: false, error: 'Escribe los códigos de país de 2 letras separados por comas: ES, PT, FR…' };
    valor = lista;
  }
  // Fechas del verano de los almacenes: mes-día (MM-DD), p. ej. 05-25.
  if (clave.startsWith('verano_sitios_') && (typeof valor !== 'string' || !/^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/.test(valor))) {
    return { ok: false, error: 'Pon la fecha como mes-día con dos cifras: por ejemplo 05-25 (25 de mayo).' };
  }
  const { error, count } = await s.supabase.from('parametros').update({ valor: valor as Json }, { count: 'exact' }).eq('clave', clave);
  if (error) return { ok: false, error: /permission|row-level/i.test(error.message) ? 'No tienes permiso para hacer esto.' : error.message };
  if (!count) return { ok: false, error: 'No existe ese parámetro.' };
  return { ok: true };
}

// Lanzar ya la suspensión automática (el proceso diario lo hace solo). Solo el Admin Master.
export async function lanzarAutosuspension(): Promise<{ ok: true; n: number } | { ok: false; error: string }> {
  const s = await sesion();
  if (!s?.perfil || s.perfil.estado !== 'activa' || s.perfil.rol !== 'admin') return { ok: false, error: 'Solo el Admin Master lanza la suspensión automática.' };
  const { data, error } = await s.supabase.rpc('autosuspender_cuentas');
  if (error) return { ok: false, error: /permission|42501/i.test(error.message) ? 'No tienes permiso para hacer esto.' : error.message };
  return { ok: true, n: Number(data ?? 0) };
}
