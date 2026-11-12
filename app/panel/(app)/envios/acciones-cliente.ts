'use server';

import { mensajeError } from '@/lib/mensajeError';
import { fecha } from '@/lib/formato';
import { CONTACTO } from '@/lib/atencion';
import { soloCliente } from '@/lib/guardia';
import { comprobarEntrada } from '@/lib/entradas/comprobar';

// Lo que el CLIENTE puede hacer con un envío suyo. Todo pasa por funciones de la base de
// datos que comprueban que el envío es suyo (no hay escritura directa en `envios`).
type Res = { ok: true; aviso?: string } | { ok: false; error: string };
const limpio = (m: string) => mensajeError(m);


export async function cancelarMiEnvio(envio: string, motivo: string): Promise<Res> {
  comprobarEntrada("app/panel/(app)/envios/acciones-cliente#cancelarMiEnvio", [envio, motivo]);
  const s = await soloCliente();
  if (!s) return { ok: false, error: 'Solo el cliente cancela su envío.' };
  const { data, error } = await s.supabase.rpc('cancelar_mi_envio', { p_envio: envio, p_motivo: motivo.trim() || null });
  if (error) return { ok: false, error: limpio(error.message) };
  const r = data as { penalizacion?: boolean; importe?: number | null };
  return { ok: true, aviso: r?.penalizacion
    ? 'Envío cancelado. Como se ha cancelado fuera de plazo con el camión ya asignado, se aplica el coste de cancelación (lo verás en Penalizaciones).'
    : 'Envío cancelado, sin ningún coste.' };
}

// Puntuar al transportista de un envío entregado (1 a 5 estrellas y comentario). Lo
// comprueba todo la base de datos (valorar_mi_envio): su envío, de Dynamo, entregado.
export async function valorarMiEnvio(envio: string, nota: number, comentario: string): Promise<Res> {
  comprobarEntrada("app/panel/(app)/envios/acciones-cliente#valorarMiEnvio", [envio, nota, comentario]);
  const s = await soloCliente();
  if (!s) return { ok: false, error: 'Solo el cliente valora su envío.' };
  const { error } = await s.supabase.rpc('valorar_mi_envio', { p_envio: envio, p_nota: Math.round(nota), p_comentario: comentario.slice(0, 500) });
  if (error) return { ok: false, error: limpio(error.message) };
  return { ok: true, aviso: '¡Gracias por tu valoración! Nos ayuda a trabajar con los mejores transportistas.' };
}

// Envíos MANUALES (con su propio operador): el cliente lleva el estado.
export async function marcarMiEnvioManual(envio: string, estado: string): Promise<Res> {
  comprobarEntrada("app/panel/(app)/envios/acciones-cliente#marcarMiEnvioManual", [envio, estado]);
  const s = await soloCliente();
  if (!s) return { ok: false, error: 'Solo el cliente lleva sus envíos manuales.' };
  const { error } = await s.supabase.rpc('marcar_mi_envio_manual', { p_envio: envio, p_estado: estado });
  return error ? { ok: false, error: limpio(error.message) } : { ok: true, aviso: 'Estado actualizado.' };
}

// El cliente pide un cambio en su envío confirmado. Sin camión y solo fechas: al momento.
// Sin camión y algo más (ruta, mercancía…): pendiente para Dynamo. Con camión: no, a llamar.
export async function pedirCambio(envio: string, desde: string, hasta: string, detalle: string): Promise<Res> {
  comprobarEntrada("app/panel/(app)/envios/acciones-cliente#pedirCambio", [envio, desde, hasta, detalle]);
  const s = await soloCliente();
  if (!s) return { ok: false, error: 'Solo el cliente pide cambios en su envío.' };
  const { data, error } = await s.supabase.rpc('pedir_cambio_envio', { p_envio: envio, p_desde: desde || null, p_hasta: hasta || null, p_detalle: detalle.trim() || null });
  if (error) return { ok: false, error: limpio(error.message) };
  const x = data as { resultado: string; primera_fecha?: string; dias?: number };
  const r = x.resultado;
  const ERR: Record<string, string> = {
    envio_manual: 'Es un envío con tu propio transportista: cámbialo tú directamente.',
    no_modificable: `El envío ya está en marcha: para cambiar algo, llámanos al ${CONTACTO.telefono}.`,
    con_camion: `Tu envío ya tiene camión o lo estamos asignando: no se puede modificar desde aquí. Llámanos URGENTE al ${CONTACTO.telefono}.`,
    fuera_de_plazo: `Falta muy poco para la carga: para cambiar algo, llámanos URGENTE al ${CONTACTO.telefono}.`,
    ya_pendiente: 'Ya tienes un cambio pendiente en este envío: espera a que te contestemos.',
    fechas_no_validas: 'Revisa la fecha: como mucho a 6 meses vista.',
    dia_no_habil: 'Ese día no se carga: elige un día de lunes a viernes que no sea festivo.',
    antes_de_lo_posible: `Tan pronto no llegamos: el primer día posible es el ${fecha(x.primera_fecha)}.`,
    ventana_distinta: `Se mantiene el tipo de fecha que elegiste (${x.dias === 1 ? 'fecha fija' : `ventana de ${x.dias} días hábiles`}): elige solo el primer día.`,
    sin_cambios: 'No has cambiado nada.', detalle_largo: 'El texto es demasiado largo (máximo 1.000 caracteres).',
  };
  if (r === 'aplicado') return { ok: true, aviso: 'Fechas cambiadas. Como aún no tiene camión, el cambio es inmediato y sin coste.' };
  if (r === 'pendiente') return { ok: true, aviso: 'Hemos recibido tu cambio. Lo revisamos y te contestamos aquí.' };
  return { ok: false, error: ERR[r] ?? r };
}
