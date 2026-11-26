'use server';

import { mensajeError } from '@/lib/mensajeError';
import { sesion, esGestor } from '@/lib/sesion';
import { esDynamo } from '@/lib/roles';
import type { ContactoDatos } from '@/lib/contactos';
import { guardarContactos, validarContactos, sinVacios } from '@/lib/contactosServidor';
import type { TablaInsert, TablaUpdate } from '@/lib/supabase/tipos';
import { comprobarEntrada } from '@/lib/entradas/comprobar';

export type ClienteDatos = {
  sector?: string | null;   // de la lista de Parámetros (sectores_cliente); vacío = Sin definir
  razon_social: string; cif: string;
  estado: 'activa' | 'pendiente_verificacion' | 'suspendida';
  direccion: string; codigo_postal: string; poblacion: string; provincia: string; pais_codigo_iso: string;
  plazo_pago_dias: number; iva_pct: number; retencion_pct: number;
  recargo_equivalencia_pct: number; recargo_pago_tarde_pct: number;
  riesgo_cesce_euros: number | null; riesgo_manual_euros: number | null;
  factor_tarifa_pct: number; factor_fijado_a_mano: boolean; permite_contraoferta: boolean; discrecion_comercial: boolean; nima_por_defecto: boolean;
  exento_pago_previo_primer_envio: boolean;   // empresa conocida: su primer envío no se paga por adelantado (si tiene crédito)
  cuenta_contable: string; holded_forma_pago_ref: string; anotaciones: string;
  alta_por: string | null;   // empleado de Dynamo que captó al cliente (comisiones); null = alta online
  // Personas de contacto (tabla contactos, una o varias)
  contactos: ContactoDatos[];
};

function traducir(msg: string): string {
  if (/ux_clientes_cif|duplicate key/i.test(msg)) return 'Ya existe un cliente con ese CIF/NIF (regla 10: un CIF solo puede ser cliente una vez).';
  if (/contactos_telefono_check/i.test(msg)) return 'El teléfono no es válido: solo números, con el prefijo del país.';
  if (/contactos_email_check/i.test(msg)) return 'El email no es válido.';
  if (/factor_tarifa/i.test(msg)) return 'El factor de precio tiene que estar entre −30 % y +30 %.';
  if (/plazo_pago_dias/i.test(msg)) return 'El plazo de pago solo puede ser 0, 30, 60, 90 o 120 días.';
  if (/permission denied|42501|row-level security/i.test(msg)) return 'No tienes permiso para hacer esto.';
  return mensajeError(msg);   // los de las reglas de la base de datos ya vienen en castellano
}
const vacio = (s: string) => (s ?? '').trim() || null;

// Solo el crédito de un cliente, desde CESCE - Riesgos (usuario, 2026-11-16: «para no tener
// que ir al perfil del cliente con toda la info, se cambia aquí mismo»). null = vacío: en
// el de Dynamo, vacío significa «manda CESCE»; 0 significa «sin crédito».
export async function guardarCreditoCliente(id: string, cesce: number | null, manual: number | null):
  Promise<{ ok: true } | { ok: false; error: string }> {
  comprobarEntrada("app/panel/(app)/clientes/acciones#guardarCreditoCliente", [id, cesce, manual]);
  const s = await sesion();
  if (!s?.perfil || s.perfil.estado !== 'activa' || !esGestor(s.perfil.rol)) {
    return { ok: false, error: 'Solo el equipo de Dynamo cambia el crédito de un cliente.' };
  }
  const mal = (v: number | null) => v != null && (!Number.isFinite(v) || v < 0 || v > 100000000);
  if (mal(cesce) || mal(manual)) return { ok: false, error: 'El importe del crédito no es válido (ni negativo ni desorbitado).' };
  const { error } = await s.supabase.from('clientes').update({ riesgo_cesce_euros: cesce, riesgo_manual_euros: manual }).eq('id', id);
  if (error) return { ok: false, error: traducir(error.message) };
  return { ok: true };
}

export async function guardarCliente(id: string | null, d: ClienteDatos):
  Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  comprobarEntrada("app/panel/(app)/clientes/acciones#guardarCliente", [id, d]);
  const s = await sesion();
  if (!s?.perfil || s.perfil.estado !== 'activa' || !esGestor(s.perfil.rol)) {
    return { ok: false, error: 'Solo el equipo de Dynamo gestiona clientes.' };
  }
  if (!d.razon_social.trim() || !d.cif.trim()) return { ok: false, error: 'La razón social y el CIF/NIF son obligatorios.' };
  const contactos = sinVacios(d.contactos);
  const malContacto = validarContactos(contactos);
  if (malContacto) return { ok: false, error: malContacto };

  const fila = {
    razon_social: d.razon_social.trim(), sector: vacio(d.sector ?? ''),
    cif: d.cif.trim().toUpperCase(), estado: d.estado,
    direccion: vacio(d.direccion), codigo_postal: vacio(d.codigo_postal), poblacion: vacio(d.poblacion),
    provincia: vacio(d.provincia), pais_codigo_iso: d.pais_codigo_iso || 'ES',
    plazo_pago_dias: d.plazo_pago_dias, iva_pct: d.iva_pct,
    retencion_pct: d.retencion_pct,
    recargo_equivalencia_pct: d.recargo_equivalencia_pct,
    recargo_pago_tarde_pct: d.recargo_pago_tarde_pct,
    riesgo_cesce_euros: d.riesgo_cesce_euros, riesgo_manual_euros: d.riesgo_manual_euros,
    factor_tarifa_pct: d.factor_tarifa_pct, factor_fijado_a_mano: d.factor_fijado_a_mano,
    permite_contraoferta: d.permite_contraoferta, discrecion_comercial: d.discrecion_comercial, nima_por_defecto: d.nima_por_defecto,
    exento_pago_previo_primer_envio: !!d.exento_pago_previo_primer_envio,
    cuenta_contable: vacio(d.cuenta_contable), holded_forma_pago_ref: vacio(d.holded_forma_pago_ref),
    anotaciones: vacio(d.anotaciones), alta_por: d.alta_por || null,
  };

  // En automático el factor lo lleva la regla de la base de datos: no se envía, para no
  // pisar un cambio automático hecho mientras la ficha estaba abierta.
  const filaUpd: Record<string, unknown> = { ...fila };
  if (!d.factor_fijado_a_mano) delete filaUpd.factor_tarifa_pct;
  const q = id
    ? s.supabase.from('clientes').update(filaUpd as TablaUpdate<'clientes'>).eq('id', id).select('id').single()
    : s.supabase.from('clientes').insert(fila as TablaInsert<'clientes'>).select('id').single();
  const { data, error } = await q;
  if (error) return { ok: false, error: traducir(error.message) };
  const clienteId = data.id as string;

  const e2 = await guardarContactos(s.supabase, { cliente_id: clienteId }, contactos);
  if (e2) return { ok: false, error: traducir(e2) };
  return { ok: true, id: clienteId };
}

// LOS USUARIOS DE UN CLIENTE (usuario, 2026-11-17): quién puede entrar hoy en la plataforma
// por esa empresa, para verlo en su ficha sin ir usuario por usuario. Solo lectura y solo
// para Dynamo; darles de alta, quitarles el acceso o cambiarlos de empresa se hace en Usuarios.
export type UsuarioDeCliente = { id: string; nombre: string; email: string; estado: string; cargo: string };
export async function usuariosDeCliente(cliente: string): Promise<UsuarioDeCliente[]> {
  comprobarEntrada("app/panel/(app)/clientes/acciones#usuariosDeCliente", [cliente]);
  const s = await sesion();
  if (!s?.perfil || !esDynamo(s.perfil.rol) || !/^[0-9a-f-]{36}$/i.test(cliente)) return [];
  const { data } = await s.supabase.from('usuarios').select('id, nombre, email, estado, cargo')
    .eq('cliente_id', cliente).order('nombre', { ascending: true }).limit(100);
  return (data ?? []).map((u) => ({ id: u.id, nombre: u.nombre ?? '', email: u.email, estado: u.estado, cargo: u.cargo ?? '' }));
}

// ---- PAGOS TARDÍOS Y BLOQUEO DEL CRÉDITO (usuario, 2026-11-17) ---------------------------
// Solo el Admin Master: la base de datos no deja ni leerlo a nadie más. Las facturas las
// traerá Holded por su conexión; aquí no se apuntan a mano (usuario, 2026-11-17).
export type EstadoPagos = {
  dias_max: number; toleradas: number; miradas: number; desde_vencimiento: boolean; tardias: number; vencidas_sin_cobrar: number;
  regla_propia: boolean; bloqueado_en: string | null; bloqueado_motivo: string | null;
};
export type PagosCliente = { activo: boolean; estado: EstadoPagos; regla: { dias_max: number | null; facturas_toleradas: number | null } };
type ResPagos = { ok: true } | { ok: false; error: string };
const ID = /^[0-9a-f-]{36}$/i;

async function soloAdmin() {
  const s = await sesion();
  return s?.perfil && s.perfil.rol === 'admin' && s.perfil.estado === 'activa' ? s : null;
}

export async function pagosDeCliente(cliente: string): Promise<PagosCliente | null> {
  comprobarEntrada("app/panel/(app)/clientes/acciones#pagosDeCliente", [cliente]);
  const s = await soloAdmin();
  if (!s || !ID.test(cliente)) return null;
  const [est, regla, act] = await Promise.all([
    s.supabase.rpc('credito_pagos_estado', { p_cliente: cliente }),
    s.supabase.from('clientes_pagos').select('dias_max, facturas_toleradas').eq('cliente_id', cliente).maybeSingle(),
    s.supabase.from('parametros').select('valor').eq('clave', 'pago_tarde_activo').maybeSingle(),
  ]);
  if (est.error || !est.data) return null;
  return {
    activo: act.data?.valor === true, estado: est.data as unknown as EstadoPagos,
    regla: { dias_max: regla.data?.dias_max ?? null, facturas_toleradas: regla.data?.facturas_toleradas ?? null },
  };
}

// La regla propia del cliente: vacío = manda la general de Parámetros.
export async function guardarReglaPagos(cliente: string, dias: number | null, toleradas: number | null): Promise<ResPagos> {
  comprobarEntrada("app/panel/(app)/clientes/acciones#guardarReglaPagos", [cliente, dias, toleradas]);
  const s = await soloAdmin();
  if (!s) return { ok: false, error: 'Solo el Admin Master cambia la regla de pagos de un cliente.' };
  if (!ID.test(cliente)) return { ok: false, error: 'Petición no válida.' };
  if (dias != null && (!Number.isInteger(dias) || dias < 1 || dias > 365)) return { ok: false, error: 'Los días tienen que ser un número entre 1 y 365 (o vacío).' };
  if (toleradas != null && (!Number.isInteger(toleradas) || toleradas < 0 || toleradas > 50)) return { ok: false, error: 'Las facturas toleradas tienen que ser un número entre 0 y 50 (o vacío).' };
  const { error } = await s.supabase.from('clientes_pagos')
    .upsert({ cliente_id: cliente, dias_max: dias, facturas_toleradas: toleradas, modificado_en: new Date().toISOString() }, { onConflict: 'cliente_id' });
  return error ? { ok: false, error: mensajeError(error.message) } : { ok: true };
}

// Devolver el crédito a un cliente bloqueado: vuelve el crédito manual que tenía.
export async function devolverCredito(cliente: string): Promise<{ ok: true; credito_manual: number | null } | { ok: false; error: string }> {
  comprobarEntrada("app/panel/(app)/clientes/acciones#devolverCredito", [cliente]);
  const s = await soloAdmin();
  if (!s) return { ok: false, error: 'Solo el Admin Master devuelve un crédito bloqueado.' };
  if (!ID.test(cliente)) return { ok: false, error: 'Petición no válida.' };
  const { data, error } = await s.supabase.rpc('credito_desbloquear', { p_cliente: cliente });
  if (error) return { ok: false, error: mensajeError(error.message) };
  const r = data as { resultado?: string; credito_manual?: number | null } | null;
  if (r?.resultado !== 'ok') return { ok: false, error: 'Este cliente no tiene el crédito bloqueado.' };
  return { ok: true, credito_manual: r.credito_manual == null ? null : Number(r.credito_manual) };
}


// ---- LA DEUDA DEL CLIENTE EN SU FICHA (usuario, 2026-11-26) -----------------------------
// Solo el equipo de Dynamo (la base de datos tampoco deja a nadie más).
export type DeudaFicha = {
  debe: number; facturas: number; pasado: number; facturas_pasadas: number; dias_mas_antigua: number | null; abonos: number;
  lista_pasadas: { numero: string | null; emision: string; pendiente: number; dias: number }[];
  dias_plazo: number; sin_facturar: number; envios_sin_facturar: number; pedidos: number; n_pedidos: number;
  usado: number; limite: number | null; disponible: number | null; credito_real: boolean; al_dia_en: string | null;
};
export async function deudaDeCliente(cliente: string): Promise<DeudaFicha | null> {
  comprobarEntrada("app/panel/(app)/clientes/acciones#deudaDeCliente", [cliente]);
  const s = await sesion();
  if (!s?.perfil || s.perfil.estado !== 'activa' || !esDynamo(s.perfil.rol) || !/^[0-9a-f-]{36}$/i.test(cliente)) return null;
  const { data, error } = await s.supabase.rpc('deuda_cliente_ficha', { p_cliente: cliente });
  return error || !data ? null : (data as unknown as DeudaFicha);
}
