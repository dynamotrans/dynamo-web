'use server';

import { mensajeError } from '@/lib/mensajeError';
import { sesion, esGestor } from '@/lib/sesion';
import type { ContactoDatos } from '@/lib/contactos';
import { guardarContactos, validarContactos, sinVacios } from '@/lib/contactosServidor';
import type { TablaInsert, TablaUpdate } from '@/lib/supabase/tipos';
import { comprobarEntrada } from '@/lib/entradas/comprobar';

export type TransportistaDatos = {
  razon_social: string; nombre_comercial: string; cif: string;
  estado_operativo: 'activo' | 'no_ofertar' | 'suspendido';
  bolsa: string; codigo_bolsa: string;
  direccion: string; codigo_postal: string; poblacion: string; provincia: string; pais_codigo_iso: string;
  plazo_pago_dias: number; pronto_pago: boolean; iva_pct: number; retencion_pct: number;
  nima: string; tiene_almacen: boolean; reparto_urbano: boolean;
  cuenta_contable: string; holded_forma_pago_ref: string; anotaciones: string; anotaciones_incidencias: string;
  // Personas de contacto (tabla contactos): tráfico, contabilidad, conductores…
  contactos: ContactoDatos[];
};

function traducir(msg: string): string {
  if (/ux_transportistas_cif|duplicate key/i.test(msg)) return 'Ya existe un transportista con ese CIF/NIF (regla 10: un CIF solo puede ser transportista una vez).';
  if (/ck_transportistas_codigo_con_bolsa/i.test(msg)) return 'Si pones código de bolsa, elige también la bolsa.';
  if (/plazo_pago_dias/i.test(msg)) return 'El plazo de pago solo puede ser 0, 30, 60 o 90 días.';
  if (/contactos_telefono_check/i.test(msg)) return 'El teléfono no es válido: solo números, con el prefijo del país.';
  if (/contactos_email_check/i.test(msg)) return 'Hay un email que no es válido.';
  if (/permission denied|42501|row-level security/i.test(msg)) return 'No tienes permiso para hacer esto.';
  return mensajeError(msg);   // los de las reglas de la base de datos ya vienen en castellano
}
const vacio = (s: string) => (s ?? '').trim() || null;

// La FLOTA al detalle para la ficha (usuario, 2026-11-13): los vehículos dados de alta
// (con sus vencimientos) y los chóferes conocidos de ese transportista. Solo Dynamo.
export type FlotaDetalle = {
  vehiculos: { matricula: string; tipo: string; itv_vence: string | null; seguro_vence: string | null; tarjeta_transporte_vence: string | null; adr: boolean; plataforma: boolean }[];
  conductores: { nombre: string; telefono: string | null; documento: string | null }[];
};
export async function flotaDetalle(p_transportista: string): Promise<FlotaDetalle> {
  comprobarEntrada("app/panel/(app)/transportistas/acciones#flotaDetalle", [p_transportista]);
  const s = await sesion();
  if (!s?.perfil || !esGestor(s.perfil.rol) || !/^[0-9a-f-]{36}$/i.test(p_transportista)) return { vehiculos: [], conductores: [] };
  const [veh, con] = await Promise.all([
    s.supabase.from('vehiculos').select('matricula, tipo, itv_vence, seguro_vence, tarjeta_transporte_vence, adr, tiene_plataforma_elevadora')
      .eq('transportista_id', p_transportista).eq('activo', true).order('matricula').limit(500),
    s.supabase.from('conductores').select('nombre, telefono, documento')
      .eq('transportista_id', p_transportista).eq('activo', true).order('nombre').limit(500),
  ]);
  return {
    vehiculos: (veh.data ?? []).map((v) => ({ matricula: v.matricula, tipo: v.tipo, itv_vence: v.itv_vence, seguro_vence: v.seguro_vence,
      tarjeta_transporte_vence: v.tarjeta_transporte_vence, adr: !!v.adr, plataforma: !!v.tiene_plataforma_elevadora })),
    conductores: con.data ?? [],
  };
}

export async function guardarTransportista(id: string | null, d: TransportistaDatos):
  Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  comprobarEntrada("app/panel/(app)/transportistas/acciones#guardarTransportista", [id, d]);
  const s = await sesion();
  if (!s?.perfil || s.perfil.estado !== 'activa' || !esGestor(s.perfil.rol)) {
    return { ok: false, error: 'Solo el equipo de Dynamo gestiona transportistas.' };
  }
  if (!d.razon_social.trim() || !d.cif.trim()) return { ok: false, error: 'La empresa y el CIF/NIF son obligatorios.' };
  if (d.codigo_bolsa.trim() && !d.bolsa) return { ok: false, error: 'Si pones código de bolsa, elige también la bolsa.' };
  const contactos = sinVacios(d.contactos);
  const malContacto = validarContactos(contactos);
  if (malContacto) return { ok: false, error: malContacto };

  const fila = {
    razon_social: d.razon_social.trim(), nombre_comercial: vacio(d.nombre_comercial),
    cif: d.cif.trim().toUpperCase(), estado_operativo: d.estado_operativo,
    bolsa: d.bolsa || null, codigo_bolsa: vacio(d.codigo_bolsa),
    direccion: vacio(d.direccion), codigo_postal: vacio(d.codigo_postal), poblacion: vacio(d.poblacion),
    provincia: vacio(d.provincia), pais_codigo_iso: d.pais_codigo_iso || 'ES',
    plazo_pago_dias: d.plazo_pago_dias, pronto_pago: d.pronto_pago,
    iva_pct: d.iva_pct, retencion_pct: d.retencion_pct,
    nima: vacio(d.nima), tiene_almacen: d.tiene_almacen, reparto_urbano: d.reparto_urbano,
    cuenta_contable: vacio(d.cuenta_contable), holded_forma_pago_ref: vacio(d.holded_forma_pago_ref),
    anotaciones: vacio(d.anotaciones), anotaciones_incidencias: vacio(d.anotaciones_incidencias),
  };
  const q = id
    ? s.supabase.from('transportistas').update(fila as TablaUpdate<'transportistas'>).eq('id', id).select('id').single()
    : s.supabase.from('transportistas').insert(fila as TablaInsert<'transportistas'>).select('id').single();
  const { data, error } = await q;
  if (error) return { ok: false, error: traducir(error.message) };
  const tid = data.id as string;

  const e2 = await guardarContactos(s.supabase, { transportista_id: tid }, contactos);
  if (e2) return { ok: false, error: traducir(e2) };
  return { ok: true, id: tid };
}

// ---- Borrar (lógico) — solo el Admin Master (usuario, 2026-11-12) --------------------
export async function borrarTransportista(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  comprobarEntrada("app/panel/(app)/transportistas/acciones#borrarTransportista", [id]);
  const s = await sesion();
  if (!s?.perfil || s.perfil.estado !== 'activa' || s.perfil.rol !== 'admin') {
    return { ok: false, error: 'Solo el Admin Master borra transportistas.' };
  }
  const { data, error } = await s.supabase.rpc('borrar_transportista', { p_id: id });
  if (error) return { ok: false, error: traducir(error.message) };
  const r = data as { resultado: string; envios?: number };
  if (r.resultado === 'ok' || r.resultado === 'ya_borrado') return { ok: true };
  if (r.resultado === 'con_envios_vivos') {
    return { ok: false, error: `No se puede borrar: tiene ${r.envios ?? 'varios'} envío(s) en marcha asignados. Reasígnalos o espera a que terminen.` };
  }
  return { ok: false, error: 'No se ha podido borrar el transportista.' };
}
