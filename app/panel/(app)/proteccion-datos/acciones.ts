'use server';

// Protección de datos (RGPD): buscar a una persona en toda la plataforma y anonimizar
// sus fichas. Solo el Admin Master (lo impone también la base de datos).
import { anonimizarUsuario } from '../usuarios/acciones';
import { soloAdminMaster } from '@/lib/guardia';
import { comprobarEntrada } from '@/lib/entradas/comprobar';

export type Persona = { tipo: 'usuario' | 'contacto' | 'conductor'; id: string; nombre: string | null; email: string | null;
  telefono: string | null; documento: string | null; empresa: string | null; estado: string | null };

const soloMaster = soloAdminMaster;

export async function buscarPersona(q: string): Promise<{ ok: true; filas: Persona[] } | { ok: false; error: string }> {
  comprobarEntrada("app/panel/(app)/proteccion-datos/acciones#buscarPersona", [q]);
  const s = await soloMaster();
  if (!s) return { ok: false, error: 'Solo el administrador.' };
  if (q.trim().length < 3) return { ok: false, error: 'Escribe al menos 3 letras o números.' };
  const { data, error } = await s.supabase.rpc('buscar_persona', { p_texto: q.trim().slice(0, 120) });
  if (error) return { ok: false, error: 'No se ha podido buscar.' };
  return { ok: true, filas: (data ?? []) as Persona[] };
}

// Usuario: con su email como confirmación (la misma acción que en Usuarios). Contacto y
// conductor: escribiendo ANONIMIZAR.
export async function anonimizarPersona(tipo: Persona['tipo'], id: string, confirmacion: string, bloquearEmail = false, bloquearDominio = false): Promise<{ ok: true; aviso: string } | { ok: false; error: string }> {
  comprobarEntrada("app/panel/(app)/proteccion-datos/acciones#anonimizarPersona", [tipo, id, confirmacion, bloquearEmail, bloquearDominio]);
  const s = await soloMaster();
  if (!s) return { ok: false, error: 'Solo el administrador.' };
  if (tipo === 'usuario') {
    const r = await anonimizarUsuario(id, confirmacion, bloquearEmail, bloquearDominio);
    return r.ok ? { ok: true, aviso: r.aviso ?? 'Datos borrados.' } : { ok: false, error: r.error };
  }
  if (confirmacion.trim().toUpperCase() !== 'ANONIMIZAR') return { ok: false, error: 'Escribe ANONIMIZAR para confirmar.' };
  const { data, error } = await s.supabase.rpc(tipo === 'contacto' ? 'anonimizar_contacto' : 'anonimizar_conductor', tipo === 'contacto' ? { p_contacto: id } : { p_conductor: id });
  if (error) return { ok: false, error: 'No se ha podido anonimizar.' };
  if ((data as { resultado: string }).resultado !== 'ok') return { ok: false, error: 'Ya no existe.' };
  return { ok: true, aviso: tipo === 'contacto' ? 'Contacto borrado.' : 'Datos del conductor borrados (el nombre se queda en los CMR ya firmados, como prueba).' };
}

// ---- Lista de bloqueo de altas (bloqueos_alta) ---------------------------------------
// Emails o dominios que no pueden volver a darse de alta. Solo el Admin Master (RLS).
export type Bloqueo = { id: string; tipo: 'email' | 'dominio'; valor: string; motivo: string | null; creado_en: string };

export async function listaBloqueos(): Promise<{ ok: true; filas: Bloqueo[] } | { ok: false; error: string }> {
  comprobarEntrada("app/panel/(app)/proteccion-datos/acciones#listaBloqueos", []);
  const s = await soloMaster();
  if (!s) return { ok: false, error: 'Solo el administrador.' };
  const { data, error } = await s.supabase.from('bloqueos_alta').select('id, tipo, valor, motivo, creado_en').order('creado_en', { ascending: false }).limit(500);
  if (error) return { ok: false, error: 'No se ha podido leer la lista.' };
  return { ok: true, filas: (data ?? []) as Bloqueo[] };
}

export async function bloquearAlta(tipo: 'email' | 'dominio', valor: string, motivo: string): Promise<{ ok: true } | { ok: false; error: string }> {
  comprobarEntrada("app/panel/(app)/proteccion-datos/acciones#bloquearAlta", [tipo, valor, motivo]);
  const s = await soloMaster();
  if (!s) return { ok: false, error: 'Solo el administrador.' };
  const v = valor.trim().toLowerCase().replace(/^@/, '');
  if (tipo === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) return { ok: false, error: 'Escribe la dirección completa, p. ej. persona@empresa.com.' };
  if (tipo === 'dominio' && !/^[^\s@]+\.[^\s@]{2,}$/.test(v)) return { ok: false, error: 'Escribe solo el dominio, sin @, p. ej. empresa.com.' };
  const { error } = await s.supabase.from('bloqueos_alta').insert({ tipo, valor: v, motivo: motivo.trim().slice(0, 300) || null });
  if (error) {
    if (/ux_bloqueos_alta|duplicate key/i.test(error.message)) return { ok: false, error: 'Ya está en la lista.' };
    return { ok: false, error: 'No se ha podido bloquear.' };
  }
  return { ok: true };
}

export async function quitarBloqueo(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  comprobarEntrada("app/panel/(app)/proteccion-datos/acciones#quitarBloqueo", [id]);
  const s = await soloMaster();
  if (!s) return { ok: false, error: 'Solo el administrador.' };
  const { error } = await s.supabase.from('bloqueos_alta').delete().eq('id', id);
  if (error) return { ok: false, error: 'No se ha podido quitar.' };
  return { ok: true };
}
