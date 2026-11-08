'use server';

import { mensajeError } from '@/lib/mensajeError';
import { soloGestor } from '@/lib/guardia';
import { comprobarEntrada } from '@/lib/entradas/comprobar';

export type NuevaEmpresa = { razon_social: string; cif: string; direccion: string; codigo_postal: string; poblacion: string; provincia: string; pais_codigo_iso: string };
type Res = { ok: true; aviso?: string } | { ok: false; error: string };

const dynamo = async () => (await soloGestor())?.supabase ?? null;
const vacio = (s: string) => (s ?? '').trim() || null;

// Confirmar el alta: se le asocia la empresa (una que ya existe o una nueva con sus datos)
// y la cuenta pasa a activa en el MISMO paso (la base de datos exige empresa para activar).
export async function confirmarAlta(usuario: string, cliente: { id: string } | { nuevo: NuevaEmpresa }): Promise<Res> {
  comprobarEntrada("app/panel/(app)/altas/acciones#confirmarAlta", [usuario, cliente]);
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
      return { ok: false, error: mensajeError(error.message) };
    }
    clienteId = data.id;
  }
  const { error } = await sb.from('usuarios').update({ cliente_id: clienteId, estado: 'activa' }).eq('id', usuario);
  if (error) return { ok: false, error: mensajeError(error.message) };
  return { ok: true };
}

// Crear una empresa (cliente) nueva con sus datos y devolverla, para elegirla en el selector
// del alta. El alta se confirma después con esa empresa ya existente.
export async function crearEmpresaDesdeAlta(n: NuevaEmpresa): Promise<{ ok: true; cliente: { id: string; nombre_visible: string; cif: string } } | { ok: false; error: string }> {
  comprobarEntrada("app/panel/(app)/altas/acciones#crearEmpresaDesdeAlta", [n]);
  const sb = await dynamo();
  if (!sb) return { ok: false, error: 'Solo el equipo de Dynamo crea empresas.' };
  if (!n.razon_social.trim() || !n.cif.trim()) return { ok: false, error: 'Para crear la empresa hacen falta la razón social y el CIF.' };
  const { data, error } = await sb.from('clientes').insert({
    razon_social: n.razon_social.trim(), cif: n.cif.trim().toUpperCase(), direccion: vacio(n.direccion), codigo_postal: vacio(n.codigo_postal),
    poblacion: vacio(n.poblacion), provincia: vacio(n.provincia), pais_codigo_iso: n.pais_codigo_iso || 'ES', estado: 'activa',
  }).select('id, nombre_visible, cif').single();
  if (error) {
    if (/ux_clientes_cif|duplicate key/i.test(error.message)) return { ok: false, error: 'Ya hay un cliente con ese CIF: búscalo en el selector y asócialo (un CIF solo puede ser cliente una vez).' };
    return { ok: false, error: mensajeError(error.message) };
  }
  return { ok: true, cliente: { id: data.id as string, nombre_visible: data.nombre_visible as string, cif: data.cif as string } };
}

// Suspender: la cuenta queda bloqueada; ese email no puede volver a registrarse.
export async function suspenderAlta(usuario: string): Promise<Res> {
  comprobarEntrada("app/panel/(app)/altas/acciones#suspenderAlta", [usuario]);
  const sb = await dynamo();
  if (!sb) return { ok: false, error: 'Solo el equipo de Dynamo gestiona altas.' };
  const { error } = await sb.from('usuarios').update({ estado: 'suspendida' }).eq('id', usuario);
  return error ? { ok: false, error: mensajeError(error.message) } : { ok: true };
}
