'use server';

// MÓVIL VERIFICADO POR WHATSAPP (usuario, 2026-11-25): «más seguro un número móvil, un titular
// real; un mail se lo puede crear cualquiera». El usuario pide un código de 6 cifras que le llega
// por WhatsApp y lo escribe. Las reglas (solo móviles, un móvil por cuenta, uno por minuto y 5
// por hora, caduca a los 10 minutos, 5 intentos) las impone la base de datos; el código solo lo
// ve el servidor, que lo manda con la plantilla de «Autenticación» de Meta.
import { mensajeError } from '@/lib/mensajeError';
import { sesion } from '@/lib/sesion';
import { comprobarEntrada } from '@/lib/entradas/comprobar';
import { supabaseServicio } from '@/lib/supabase/servicio';
import { mandarCodigo, whatsappConectado } from '@/lib/servidor/whatsapp';
import { CONTACTO } from '@/lib/atencion';

type Res = { ok: true; telefono?: string } | { ok: false; error: string };

export async function pedirCodigoMovil(telefono: string): Promise<Res> {
  comprobarEntrada("app/panel/(app)/movil/acciones#pedirCodigoMovil", [telefono]);
  const s = await sesion();
  if (!s?.perfil) return { ok: false, error: 'Tu sesión ha caducado. Vuelve a entrar.' };
  const sv = supabaseServicio();
  if (!sv || !whatsappConectado()) return { ok: false, error: `Ahora mismo no se puede mandar el código. Llámanos al ${CONTACTO.telefono}.` };
  const { data: p } = await sv.from('parametros').select('valor').eq('clave', 'whatsapp_plantilla_codigo').maybeSingle();
  const plantilla = String(p?.valor ?? '').replace(/"/g, '').trim();
  if (!plantilla) return { ok: false, error: `Ahora mismo no se puede mandar el código. Llámanos al ${CONTACTO.telefono}.` };

  const { data, error } = await sv.rpc('movil_preparar_codigo', { p_usuario: s.perfil.id, p_telefono: telefono });
  if (error) return { ok: false, error: mensajeError(error.message) };
  const r = data as { resultado: string; codigo?: string; telefono?: string; segundos?: number };
  if (r.resultado === 'no_movil') return { ok: false, error: 'Tiene que ser un móvil: en España, 9 cifras que empiezan por 6 o 7; si es de otro país, con su prefijo.' };
  if (r.resultado === 'ocupado') return { ok: false, error: `Ese móvil ya está verificado en otra cuenta. Si es tuyo, llámanos al ${CONTACTO.telefono}.` };
  if (r.resultado === 'espera') return { ok: false, error: `Espera ${r.segundos ?? 60} segundos antes de pedir otro código.` };
  if (r.resultado === 'demasiados') return { ok: false, error: `Has pedido demasiados códigos. Prueba dentro de una hora o llámanos al ${CONTACTO.telefono}.` };
  if (r.resultado !== 'ok' || !r.codigo || !r.telefono) return { ok: false, error: 'No se ha podido preparar el código. Inténtalo de nuevo.' };

  const envio = await mandarCodigo(r.telefono, plantilla, r.codigo);
  if (!envio.ok) {
    await sv.rpc('movil_codigo_no_enviado', { p_usuario: s.perfil.id });
    console.error('[WhatsApp] código del móvil', envio.error);
    const noWa = /no tiene WhatsApp/i.test(envio.error);
    return { ok: false, error: noWa
      ? `A ese número no le llega WhatsApp. Revisa que esté bien escrito; si no tienes WhatsApp, llámanos al ${CONTACTO.telefono} y lo comprobamos por teléfono.`
      : `No se ha podido mandar el código por WhatsApp. Inténtalo en un momento o llámanos al ${CONTACTO.telefono}.` };
  }
  return { ok: true, telefono: r.telefono };
}

export async function comprobarCodigoMovil(codigo: string, avisos: boolean): Promise<Res> {
  comprobarEntrada("app/panel/(app)/movil/acciones#comprobarCodigoMovil", [codigo, avisos]);
  const s = await sesion();
  if (!s?.perfil) return { ok: false, error: 'Tu sesión ha caducado. Vuelve a entrar.' };
  const { data, error } = await s.supabase.rpc('movil_comprobar_codigo', { p_codigo: codigo, p_avisos: avisos });
  if (error) return { ok: false, error: mensajeError(error.message) };
  const r = data as { resultado: string; quedan?: number; telefono?: string };
  if (r.resultado === 'ok') return { ok: true, telefono: r.telefono };
  const msg: Record<string, string> = {
    formato: 'Escribe las 6 cifras del código.',
    mal: `El código no es correcto.${r.quedan != null ? ` Te quedan ${r.quedan} intentos.` : ''}`,
    caducado: 'El código ha caducado (dura 10 minutos). Pide otro.',
    intentos: 'Has fallado demasiadas veces. Pide otro código.',
    sin_codigo: 'Pide primero el código.',
    ocupado: `Ese móvil ya está verificado en otra cuenta. Si es tuyo, llámanos al ${CONTACTO.telefono}.`,
  };
  return { ok: false, error: msg[r.resultado] ?? 'No se ha podido comprobar el código.' };
}

/** El equipo de Dynamo valida el móvil de un usuario (lo conoce, o lo ha comprobado por teléfono). */
export async function validarMovilDynamo(usuario: string): Promise<Res> {
  comprobarEntrada("app/panel/(app)/movil/acciones#validarMovilDynamo", [usuario]);
  const s = await sesion();
  if (!s?.perfil) return { ok: false, error: 'Tu sesión ha caducado. Vuelve a entrar.' };
  const { data, error } = await s.supabase.rpc('movil_validar_por_dynamo', { p_usuario: usuario });
  if (error) return { ok: false, error: /42501|equipo/i.test(`${error.code} ${error.message}`) ? 'Solo el equipo de Dynamo (y no los usuarios de solo lectura).' : mensajeError(error.message) };
  const r = (data as { resultado: string }).resultado;
  if (r === 'sin_movil') return { ok: false, error: 'Ese usuario no tiene un móvil válido puesto: ponlo antes en su ficha.' };
  if (r === 'ocupado') return { ok: false, error: 'Ese móvil ya está verificado en otra cuenta.' };
  if (r !== 'ok') return { ok: false, error: 'No se ha podido marcar.' };
  return { ok: true };
}
