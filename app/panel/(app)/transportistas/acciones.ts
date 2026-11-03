'use server';

import { sesion, esDynamo } from '@/lib/sesion';

export type TransportistaDatos = {
  razon_social: string; nombre_comercial: string; cif: string;
  estado_operativo: 'activo' | 'no_ofertar' | 'suspendido';
  bolsa: string; codigo_bolsa: string;
  direccion: string; codigo_postal: string; poblacion: string; provincia: string; pais_codigo_iso: string;
  plazo_pago_dias: number; pronto_pago: boolean; iva_porcentaje: number; retencion_porcentaje: number;
  nima: string; almacen_logistico: boolean; tipo_camion_defecto: string;
  seguro_cmr_compania: string; seguro_cmr_poliza: string; seguro_cmr_vence: string;
  cuenta_contable: string; forma_pago_holded_id: string; anotaciones: string; incidencias_notas: string;
  // Contactos (tabla contactos): tráfico (persona, teléfono, email) y contabilidad (email).
  contacto_nombre: string; contacto_telefono: string; email_trafico: string; email_contabilidad: string;
};

function traducir(msg: string): string {
  if (/ux_transportistas_cif|duplicate key/i.test(msg)) return 'Ya existe un transportista con ese CIF/NIF (regla 10: un CIF solo puede ser transportista una vez).';
  if (/ck_transportistas_codigo_con_bolsa/i.test(msg)) return 'Si pones código de bolsa, elige también la bolsa.';
  if (/plazo_pago_dias/i.test(msg)) return 'El plazo de pago solo puede ser 0, 30, 60 o 90 días.';
  if (/contactos_telefono_check/i.test(msg)) return 'El teléfono no es válido: solo números, con el prefijo del país.';
  if (/contactos_email_check/i.test(msg)) return 'Hay un email que no es válido.';
  if (/permission denied|42501|row-level security/i.test(msg)) return 'No tienes permiso para hacer esto.';
  return msg;
}
const vacio = (s: string) => (s ?? '').trim() || null;

export async function guardarTransportista(id: string | null, d: TransportistaDatos):
  Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const s = await sesion();
  if (!s?.perfil || s.perfil.estado !== 'activa' || !esDynamo(s.perfil.rol)) {
    return { ok: false, error: 'Solo el equipo de Dynamo gestiona transportistas.' };
  }
  if (!d.razon_social.trim() || !d.cif.trim()) return { ok: false, error: 'La empresa y el CIF/NIF son obligatorios.' };
  if (d.codigo_bolsa.trim() && !d.bolsa) return { ok: false, error: 'Si pones código de bolsa, elige también la bolsa.' };

  const fila = {
    razon_social: d.razon_social.trim(), nombre_comercial: vacio(d.nombre_comercial),
    cif: d.cif.trim().toUpperCase(), estado_operativo: d.estado_operativo,
    bolsa: d.bolsa || null, codigo_bolsa: vacio(d.codigo_bolsa),
    direccion: vacio(d.direccion), codigo_postal: vacio(d.codigo_postal), poblacion: vacio(d.poblacion),
    provincia: vacio(d.provincia), pais_codigo_iso: d.pais_codigo_iso || 'ES',
    plazo_pago_dias: d.plazo_pago_dias, pronto_pago: d.pronto_pago,
    iva_porcentaje: d.iva_porcentaje, retencion_porcentaje: d.retencion_porcentaje,
    nima: vacio(d.nima), almacen_logistico: d.almacen_logistico, tipo_camion_defecto: d.tipo_camion_defecto || null,
    seguro_cmr_compania: vacio(d.seguro_cmr_compania), seguro_cmr_poliza: vacio(d.seguro_cmr_poliza),
    seguro_cmr_vence: d.seguro_cmr_vence || null,
    cuenta_contable: vacio(d.cuenta_contable), forma_pago_holded_id: vacio(d.forma_pago_holded_id),
    anotaciones: vacio(d.anotaciones), incidencias_notas: vacio(d.incidencias_notas),
  };
  const q = id
    ? s.supabase.from('transportistas').update(fila).eq('id', id).select('id').single()
    : s.supabase.from('transportistas').insert(fila).select('id').single();
  const { data, error } = await q;
  if (error) return { ok: false, error: traducir(error.message) };
  const tid = data.id as string;

  // Un contacto principal por función. Si se vacía, se quita.
  async function contacto(funcion: 'trafico' | 'contabilidad', c: { nombre: string | null; telefono: string | null; email: string | null }) {
    const { data: actual } = await s!.supabase.from('contactos').select('id')
      .eq('transportista_id', tid).eq('funcion', funcion).eq('es_principal', true).maybeSingle();
    if (c.telefono || c.email) {
      const v = { transportista_id: tid, funcion, es_principal: true, recibe_avisos: funcion === 'trafico', ...c,
                  nombre: c.nombre ?? (funcion === 'trafico' ? 'Tráfico' : 'Contabilidad') };
      const r = actual ? await s!.supabase.from('contactos').update(v).eq('id', actual.id) : await s!.supabase.from('contactos').insert(v);
      return r.error ? traducir(r.error.message) : null;
    }
    if (actual) await s!.supabase.from('contactos').delete().eq('id', actual.id);
    return null;
  }
  const tel = d.contacto_telefono.replace(/[^\d+]/g, '');
  const e1 = await contacto('trafico', { nombre: vacio(d.contacto_nombre), telefono: tel.replace('+', '').length >= 6 ? tel : null, email: vacio(d.email_trafico) });
  if (e1) return { ok: false, error: e1 };
  const e2 = await contacto('contabilidad', { nombre: null, telefono: null, email: vacio(d.email_contabilidad) });
  if (e2) return { ok: false, error: e2 };
  return { ok: true, id: tid };
}
