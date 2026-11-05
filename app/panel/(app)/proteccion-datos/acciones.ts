'use server';

// Protección de datos (RGPD): buscar a una persona en toda la plataforma y anonimizar
// sus fichas. Solo el Admin Master (lo impone también la base de datos).
import { sesion } from '@/lib/sesion';
import { anonimizarUsuario } from '../usuarios/acciones';

export type Persona = { tipo: 'usuario' | 'contacto' | 'conductor'; id: string; nombre: string | null; email: string | null;
  telefono: string | null; documento: string | null; empresa: string | null; estado: string | null };

async function soloMaster() {
  const s = await sesion();
  return s?.perfil && s.perfil.estado === 'activa' && s.perfil.rol === 'admin' ? s : null;
}

export async function buscarPersona(q: string): Promise<{ ok: true; filas: Persona[] } | { ok: false; error: string }> {
  const s = await soloMaster();
  if (!s) return { ok: false, error: 'Solo el administrador.' };
  if (q.trim().length < 3) return { ok: false, error: 'Escribe al menos 3 letras o números.' };
  const { data, error } = await s.supabase.rpc('buscar_persona', { p_texto: q.trim().slice(0, 120) });
  if (error) return { ok: false, error: 'No se ha podido buscar.' };
  return { ok: true, filas: (data ?? []) as Persona[] };
}

// Usuario: con su email como confirmación (la misma acción que en Usuarios). Contacto y
// conductor: escribiendo ANONIMIZAR.
export async function anonimizarPersona(tipo: Persona['tipo'], id: string, confirmacion: string): Promise<{ ok: true; aviso: string } | { ok: false; error: string }> {
  const s = await soloMaster();
  if (!s) return { ok: false, error: 'Solo el administrador.' };
  if (tipo === 'usuario') {
    const r = await anonimizarUsuario(id, confirmacion);
    return r.ok ? { ok: true, aviso: r.aviso ?? 'Datos borrados.' } : { ok: false, error: r.error };
  }
  if (confirmacion.trim().toUpperCase() !== 'ANONIMIZAR') return { ok: false, error: 'Escribe ANONIMIZAR para confirmar.' };
  const { data, error } = await s.supabase.rpc(tipo === 'contacto' ? 'anonimizar_contacto' : 'anonimizar_conductor', tipo === 'contacto' ? { p_contacto: id } : { p_conductor: id });
  if (error) return { ok: false, error: 'No se ha podido anonimizar.' };
  if ((data as { resultado: string }).resultado !== 'ok') return { ok: false, error: 'Ya no existe.' };
  return { ok: true, aviso: tipo === 'contacto' ? 'Contacto borrado.' : 'Datos del conductor borrados (el nombre se queda en los CMR ya firmados, como prueba).' };
}
