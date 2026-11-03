'use server';

import { sesion, esGestor } from '@/lib/sesion';

export type NuevaEmpresa = { razon_social: string; cif: string; direccion: string; codigo_postal: string; poblacion: string; provincia: string; pais_codigo_iso: string };
type Res = { ok: true; aviso?: string } | { ok: false; error: string };

async function dynamo() {
  const s = await sesion();
  if (!s?.perfil || s.perfil.estado !== 'activa' || !esGestor(s.perfil.rol)) return null;
  return s.supabase;
}
const vacio = (s: string) => (s ?? '').trim() || null;

// Confirmar el alta: se le asocia la empresa (una que ya existe o una nueva con sus datos)
// y la cuenta pasa a activa en el MISMO paso (la base de datos exige empresa para activar).
export async function confirmarAlta(usuario: string, cliente: { id: string } | { nuevo: NuevaEmpresa }): Promise<Res> {
  const sb = await dynamo();
  if (!sb) return { ok: false, error: 'Solo el equipo de Dynamo confirma altas.' };
  let clienteId: string;
  if ('id' in cliente) {
    if (!cliente.id) return { ok: false, error: 'Elige la empresa a la que pertenece.' };
    clienteId = cliente.id;
  } else {
    const n = cliente.nuevo;
    if (!n.razon_social.trim() || !n.cif.trim()) return { ok: false, error: 'Para crear la empresa hacen falta la razón social y el CIF.' };
    const { data, error } = await sb.from('clientes').insert({
      razon_social: n.razon_social.trim(), cif: n.cif.trim().toUpperCase(), direccion: vacio(n.direccion), codigo_postal: vacio(n.codigo_postal),
      poblacion: vacio(n.poblacion), provincia: vacio(n.provincia), pais_codigo_iso: n.pais_codigo_iso || 'ES', estado: 'activa',
    }).select('id').single();
    if (error) {
      if (/ux_clientes_cif|duplicate key/i.test(error.message)) return { ok: false, error: 'Ya hay un cliente con ese CIF: elige «Asociar a un cliente que ya existe» (regla 10).' };
      return { ok: false, error: error.message };
    }
    clienteId = data.id;
  }
  const { error } = await sb.from('usuarios').update({ cliente_id: clienteId, estado: 'activa' }).eq('id', usuario);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// Suspender: la cuenta queda bloqueada; ese email no puede volver a registrarse.
export async function suspenderAlta(usuario: string): Promise<Res> {
  const sb = await dynamo();
  if (!sb) return { ok: false, error: 'Solo el equipo de Dynamo gestiona altas.' };
  const { error } = await sb.from('usuarios').update({ estado: 'suspendida' }).eq('id', usuario);
  return error ? { ok: false, error: error.message } : { ok: true };
}
