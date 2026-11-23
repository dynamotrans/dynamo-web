'use server';

import { soloAdminMaster } from '@/lib/guardia';
import { comprobarMiClave } from '@/lib/servidor/miClave';
import { comprobarEntrada } from '@/lib/entradas/comprobar';
import { mensajeError } from '@/lib/mensajeError';
import { pagoStripe, devolverStripe } from '@/lib/stripe';
import { cuentasDevolucion, type CuentasDevolucion } from '@/lib/devolucion';

// DEVOLVER EL IMPORTE DE UN PAGO CON TARJETA (usuario, 2026-11-23). Solo el Admin Master, con su
// contraseña y la palabra «CONFIRMAR» escrita a mano. La devolución se hace en Stripe por su
// API; las reglas y el registro, en la base de datos (migración 20261123140000).

const SOLO_MASTER = 'Solo el Admin Master puede devolver un pago.';

export type DatosDevolucion = { referencia: string; estadoEnvio: string; cobrado: number; yaDevuelto: number; disponible: number; ivaPct: number;
  conCamion: boolean };

/** Lo que se puede devolver de un envío pagado con tarjeta (lo dice Stripe). */
export async function datosDevolucion(envio: string): Promise<{ ok: true; datos: DatosDevolucion } | { ok: false; error: string }> {
  comprobarEntrada("app/panel/(app)/envios/acciones-devolucion#datosDevolucion", [envio]);
  const s = await soloAdminMaster();
  if (!s) return { ok: false, error: SOLO_MASTER };
  const { data: e } = await s.supabase.from('envios')
    .select('referencia_gx, estado, estado_pago_previo, pago_metodo, stripe_pago_ref, transportista_id, estado_asignacion, publicado_en_bolsa_en')
    .eq('id', envio).maybeSingle();
  if (!e) return { ok: false, error: 'Ese envío no existe.' };
  if (e.estado_pago_previo !== 'pagado' || e.pago_metodo !== 'stripe' || !e.stripe_pago_ref) return { ok: false, error: 'Este envío no está pagado con tarjeta.' };
  const { data: imp } = await s.supabase.rpc('pagos_envio', { p_envio: envio }).maybeSingle();
  const p = await pagoStripe(e.stripe_pago_ref);
  if (!p.ok) return { ok: false, error: p.error };
  const disponible = Math.max(p.cobrado - p.devuelto, 0) / 100;
  if (!(disponible > 0)) return { ok: false, error: 'Este pago ya está devuelto entero en Stripe.' };
  return { ok: true, datos: { referencia: e.referencia_gx ?? '', estadoEnvio: e.estado, cobrado: p.cobrado / 100, yaDevuelto: p.devuelto / 100, disponible,
    ivaPct: Number(imp?.iva ?? 21),
    conCamion: !!e.transportista_id || (e.estado_asignacion ?? 'sin_asignar') !== 'sin_asignar' || !!e.publicado_en_bolsa_en } };
}

export type ResultadoDevolucion = CuentasDevolucion & { estadoEnvio: string; estadoPago: string; penalizacion: string | null };

/** Devuelve `importe` (euros, con IVA) del pago con tarjeta del envío. */
export async function devolverPago(envio: string, importe: number, clave: string, confirmacion: string, motivo: string):
  Promise<{ ok: true; resultado: ResultadoDevolucion } | { ok: false; error: string }> {
  comprobarEntrada("app/panel/(app)/envios/acciones-devolucion#devolverPago", [envio, importe, clave, confirmacion, motivo]);
  const s = await soloAdminMaster();
  if (!s) return { ok: false, error: SOLO_MASTER };
  if (confirmacion.trim() !== 'CONFIRMAR') return { ok: false, error: 'Escribe la palabra CONFIRMAR, en mayúsculas, para devolver el importe.' };
  const eClave = await comprobarMiClave(s.supabase, clave);
  if (eClave) return { ok: false, error: eClave };

  const { data: e } = await s.supabase.from('envios').select('stripe_pago_ref, estado_pago_previo, pago_metodo').eq('id', envio).maybeSingle();
  if (!e || e.estado_pago_previo !== 'pagado' || e.pago_metodo !== 'stripe' || !e.stripe_pago_ref) return { ok: false, error: 'Este envío no está pagado con tarjeta.' };
  const p = await pagoStripe(e.stripe_pago_ref);
  if (!p.ok) return { ok: false, error: p.error };
  const disponible = Math.max(p.cobrado - p.devuelto, 0);          // céntimos
  const centimos = Math.round(importe * 100);
  if (!(centimos > 0)) return { ok: false, error: 'Escribe el importe que se devuelve.' };
  if (centimos > disponible) return { ok: false, error: `No se puede devolver más de lo cobrado (${(disponible / 100).toFixed(2).replace('.', ',')} €).` };

  // 1 · Se reserva en la base de datos (su id es la clave que evita repetirla en Stripe).
  const ab = await s.supabase.rpc('devolucion_pago_abrir', { p_envio: envio, p_importe: centimos / 100, p_cobrado: disponible / 100, p_motivo: motivo.trim() || undefined });
  if (ab.error) return { ok: false, error: mensajeError(ab.error.message) };
  const a = ab.data as { resultado: string; id?: string; pago_ref?: string };
  if (a.resultado !== 'ok' || !a.id || !a.pago_ref) {
    return { ok: false, error: a.resultado === 'en_curso' ? 'Hay otra devolución de este envío a medias, por otro importe. Espera un minuto y vuelve a intentarlo.'
      : a.resultado === 'importe_excesivo' ? 'No se puede devolver más de lo cobrado.'
      : a.resultado === 'no_pagado_con_tarjeta' ? 'Este envío ya no está pagado con tarjeta.' : 'No se ha podido preparar la devolución.' };
  }
  // 2 · Stripe.
  const d = await devolverStripe({ ref: a.pago_ref, centimos, clave: a.id, envioId: envio });
  if (!d.ok && d.dudoso) {
    // No se sabe si Stripe la hizo: se deja reservada. Repetir con el MISMO importe la retoma
    // con la misma clave, así que no se puede duplicar.
    return { ok: false, error: `${d.error} No sabemos si la devolución ha llegado a hacerse: vuelve a pulsar «Devolver» con el mismo importe (no se duplica) o míralo en Stripe.` };
  }
  // 3 · Se apunta.
  const ci = await s.supabase.rpc('devolucion_pago_cerrar', { p_id: a.id, p_ok: d.ok, p_ref: d.ok ? d.id : undefined, p_error: d.ok ? undefined : d.error });
  if (!d.ok) return { ok: false, error: `Stripe no ha hecho la devolución: ${d.error}` };
  if (ci.error) {
    console.error('[devolución] hecha en Stripe y sin apuntar', envio, a.id, ci.error.message);
    return { ok: false, error: `La devolución SÍ se ha hecho en Stripe (${d.id}), pero no se ha podido apuntar en la plataforma. No la repitas: avisa para apuntarla a mano.` };
  }
  const r = ci.data as { resultado: string; estado_envio?: string; estado_pago?: string; penalizacion?: string | null; iva_pct?: number };
  return { ok: true, resultado: { ...cuentasDevolucion(disponible / 100, centimos / 100, Number(r.iva_pct ?? 21)),
    estadoEnvio: r.estado_envio ?? '', estadoPago: r.estado_pago ?? '', penalizacion: r.penalizacion ?? null } };
}
