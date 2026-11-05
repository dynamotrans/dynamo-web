'use server';

import { mensajeError } from '@/lib/mensajeError';
import { sesion, esGestor } from '@/lib/sesion';
import type { ContactoDatos } from '@/lib/contactos';
import { guardarContactos, validarContactos, sinVacios } from '@/lib/contactosServidor';

export type TransportistaDatos = {
  razon_social: string; nombre_comercial: string; cif: string;
  estado_operativo: 'activo' | 'no_ofertar' | 'suspendido';
  bolsa: string; codigo_bolsa: string;
  direccion: string; codigo_postal: string; poblacion: string; provincia: string; pais_codigo_iso: string;
  plazo_pago_dias: number; pronto_pago: boolean; iva_pct: number; retencion_pct: number;
  nima: string; tiene_almacen: boolean; tipo_camion_defecto: string;
  seguro_cmr_compania: string; seguro_cmr_poliza: string; seguro_cmr_vence: string;
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

export async function guardarTransportista(id: string | null, d: TransportistaDatos):
  Promise<{ ok: true; id: string } | { ok: false; error: string }> {
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
    nima: vacio(d.nima), tiene_almacen: d.tiene_almacen, tipo_camion_defecto: d.tipo_camion_defecto || null,
    seguro_cmr_compania: vacio(d.seguro_cmr_compania), seguro_cmr_poliza: vacio(d.seguro_cmr_poliza),
    seguro_cmr_vence: d.seguro_cmr_vence || null,
    cuenta_contable: vacio(d.cuenta_contable), holded_forma_pago_ref: vacio(d.holded_forma_pago_ref),
    anotaciones: vacio(d.anotaciones), anotaciones_incidencias: vacio(d.anotaciones_incidencias),
  };
  const q = id
    ? s.supabase.from('transportistas').update(fila).eq('id', id).select('id').single()
    : s.supabase.from('transportistas').insert(fila).select('id').single();
  const { data, error } = await q;
  if (error) return { ok: false, error: traducir(error.message) };
  const tid = data.id as string;

  const e2 = await guardarContactos(s.supabase, { transportista_id: tid }, contactos);
  if (e2) return { ok: false, error: traducir(e2) };
  return { ok: true, id: tid };
}
