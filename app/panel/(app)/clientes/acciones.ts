'use server';

import { sesion, esGestor } from '@/lib/sesion';
import type { ContactoDatos } from '@/lib/contactos';
import { guardarContactos, validarContactos, sinVacios } from '@/lib/contactosServidor';

export type ClienteDatos = {
  razon_social: string; nombre_comercial: string; cif: string;
  estado: 'activa' | 'pendiente_verificacion' | 'suspendida';
  direccion: string; codigo_postal: string; poblacion: string; provincia: string; pais_codigo_iso: string;
  plazo_pago_dias: number; iva_porcentaje: number; retencion_porcentaje: number;
  recargo_equivalencia_porcentaje: number; recargo_pago_tarde_porcentaje: number;
  riesgo_cesce_euros: number | null; riesgo_manual_euros: number | null;
  factor_tarifa_porcentaje: number; factor_fijado_a_mano: boolean; permite_contraoferta: boolean; discrecion_comercial: boolean;
  cuenta_contable: string; forma_pago_holded_id: string; anotaciones: string;
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
  return msg;
}
const vacio = (s: string) => (s ?? '').trim() || null;

export async function guardarCliente(id: string | null, d: ClienteDatos):
  Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const s = await sesion();
  if (!s?.perfil || s.perfil.estado !== 'activa' || !esGestor(s.perfil.rol)) {
    return { ok: false, error: 'Solo el equipo de Dynamo gestiona clientes.' };
  }
  if (!d.razon_social.trim() || !d.cif.trim()) return { ok: false, error: 'La razón social y el CIF/NIF son obligatorios.' };
  const contactos = sinVacios(d.contactos);
  const malContacto = validarContactos(contactos);
  if (malContacto) return { ok: false, error: malContacto };

  const fila = {
    razon_social: d.razon_social.trim(), nombre_comercial: vacio(d.nombre_comercial),
    cif: d.cif.trim().toUpperCase(), estado: d.estado,
    direccion: vacio(d.direccion), codigo_postal: vacio(d.codigo_postal), poblacion: vacio(d.poblacion),
    provincia: vacio(d.provincia), pais_codigo_iso: d.pais_codigo_iso || 'ES',
    plazo_pago_dias: d.plazo_pago_dias, iva_porcentaje: d.iva_porcentaje,
    retencion_porcentaje: d.retencion_porcentaje,
    recargo_equivalencia_porcentaje: d.recargo_equivalencia_porcentaje,
    recargo_pago_tarde_porcentaje: d.recargo_pago_tarde_porcentaje,
    riesgo_cesce_euros: d.riesgo_cesce_euros, riesgo_manual_euros: d.riesgo_manual_euros,
    factor_tarifa_porcentaje: d.factor_tarifa_porcentaje, factor_fijado_a_mano: d.factor_fijado_a_mano,
    permite_contraoferta: d.permite_contraoferta, discrecion_comercial: d.discrecion_comercial,
    cuenta_contable: vacio(d.cuenta_contable), forma_pago_holded_id: vacio(d.forma_pago_holded_id),
    anotaciones: vacio(d.anotaciones), alta_por: d.alta_por || null,
  };

  // En automático el factor lo lleva la regla de la base de datos: no se envía, para no
  // pisar un cambio automático hecho mientras la ficha estaba abierta.
  const filaUpd: Record<string, unknown> = { ...fila };
  if (!d.factor_fijado_a_mano) delete filaUpd.factor_tarifa_porcentaje;
  const q = id
    ? s.supabase.from('clientes').update(filaUpd).eq('id', id).select('id').single()
    : s.supabase.from('clientes').insert(fila).select('id').single();
  const { data, error } = await q;
  if (error) return { ok: false, error: traducir(error.message) };
  const clienteId = data.id as string;

  const e2 = await guardarContactos(s.supabase, { cliente_id: clienteId }, contactos);
  if (e2) return { ok: false, error: traducir(e2) };
  return { ok: true, id: clienteId };
}
