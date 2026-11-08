'use server';

import { mensajeError } from '@/lib/mensajeError';
import { sesion, esGestor } from '@/lib/sesion';
import type { ContactoDatos } from '@/lib/contactos';
import { guardarContactos, validarContactos, sinVacios } from '@/lib/contactosServidor';
import type { TablaInsert, TablaUpdate } from '@/lib/supabase/tipos';
import { comprobarEntrada } from '@/lib/entradas/comprobar';

export type ClienteDatos = {
  sector?: string | null;   // de la lista de Parámetros (sectores_cliente); vacío = Sin definir
  razon_social: string; nombre_comercial: string; cif: string;
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
    razon_social: d.razon_social.trim(), nombre_comercial: vacio(d.nombre_comercial), sector: vacio(d.sector ?? ''),
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
