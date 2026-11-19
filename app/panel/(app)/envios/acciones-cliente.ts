'use server';

import { mensajeError } from '@/lib/mensajeError';
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

// «He hecho la transferencia» (usuario, 2026-11-19): el cliente avisa de que ya ha pagado por
// transferencia. El plazo para pagar deja de correr y el envío no se anula solo: Dynamo lo
// comprueba en el banco y lo valida o lo rechaza. Lo exige todo la base de datos.
export async function avisarPagoTransferencia(envio: string): Promise<Res> {
  comprobarEntrada("app/panel/(app)/envios/acciones-cliente#avisarPagoTransferencia", [envio]);
  const s = await soloCliente();
  if (!s) return { ok: false, error: 'Solo el cliente avisa del pago de su envío.' };
  const { data, error } = await s.supabase.rpc('avisar_pago_transferencia', { p_envio: envio });
  if (error) return { ok: false, error: limpio(error.message) };
  const r = (data as { resultado?: string } | null)?.resultado;
  if (r === 'ok' || r === 'ya_avisado') return { ok: true, aviso: 'Aviso recibido: el plazo queda parado mientras validamos tu transferencia. Te avisamos en cuanto esté.' };
  return { ok: false, error: ({
    no_pendiente: 'Este envío ya no está pendiente de pago.',
    precio_provisional: 'El precio de este envío aún es provisional: el pago se pide cuando lo revisemos.',
    no_existe: 'Ese envío no existe.',
  } as Record<string, string>)[r ?? ''] ?? 'No se ha podido registrar el aviso. Vuelve a intentarlo.' };
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
// El precio acordado con SU transportista, desde la ficha (null = sin anotar).
export async function guardarPrecioEnvioManual(envio: string, precio: number | null): Promise<Res> {
  comprobarEntrada("app/panel/(app)/envios/acciones-cliente#guardarPrecioEnvioManual", [envio, precio]);
  const s = await soloCliente();
  if (!s) return { ok: false, error: 'Solo el cliente cambia el precio de su envío.' };
  if (precio != null && (!Number.isFinite(precio) || precio < 0)) return { ok: false, error: 'El precio no es válido.' };
  const { error } = await s.supabase.rpc('mi_envio_manual_precio', { p_envio: envio, p_precio: precio });
  return error ? { ok: false, error: limpio(error.message) } : { ok: true };
}

// LA ORDEN DE CARGA A SU TRANSPORTISTA, POR EMAIL (usuario, 2026-11-17): el PDF adjunto y
// todo el detalle también en el cuerpo, en texto llano. Es un envío del cliente con SU
// transportista: el remitente lleva el nombre de su empresa, las respuestas le llegan a
// él y recibe copia. Tope de 10 por hora y usuario, para que nadie use esto de buzón.
// `guardar`: deja ese email en la ficha del transportista, para que la próxima vez salga ya
// puesto (usuario, 2026-11-17). La pantalla lo marca sola cuando la ficha no tiene email.
export async function enviarOrdenEnvioManual(envio: string, para: string, guardar: boolean): Promise<Res> {
  comprobarEntrada("app/panel/(app)/envios/acciones-cliente#enviarOrdenEnvioManual", [envio, para, guardar]);
  const s = await soloCliente();
  const perfil = s?.perfil;
  if (!s || !perfil) return { ok: false, error: 'Solo el cliente envía la orden de su envío.' };
  if (!/^[0-9a-f-]{36}$/i.test(envio)) return { ok: false, error: 'Petición no válida.' };
  const email = para.trim().toLowerCase();
  if (email.length > 200 || !/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]{2,}$/.test(email)) return { ok: false, error: 'Escribe un email válido.' };
  const [{ pdfOrdenPropia, bloquesOrdenPropia }, { enviarEmailOperativo, escaparHtml }, { supabaseServicio }, { randomUUID }] = await Promise.all([
    import('@/lib/servidor/ordenPropia'), import('@/lib/servidor/emailOperativo'), import('@/lib/supabase/servicio'), import('node:crypto')]);
  const svc = supabaseServicio();
  if (svc) {
    const { count } = await svc.from('emails_enviados').select('id', { count: 'exact', head: true })
      .eq('tipo', 'orden_carga').like('clave', `orden_propia:${perfil.id}:%`).gte('creado_en', new Date(Date.now() - 3600_000).toISOString());
    if ((count ?? 0) >= 10) return { ok: false, error: 'Has enviado muchas órdenes seguidas: espera un rato y vuelve a intentarlo.' };
  }
  const r = await pdfOrdenPropia(s.supabase, envio);
  if ('error' in r) return { ok: false, error: limpio(r.error) };
  if (r.datos.envio.estado === 'cancelado') return { ok: false, error: 'El envío está cancelado: no se envía su orden de carga.' };
  const ref = r.datos.envio.referencia_gx ?? '';
  const empresa = r.datos.cliente?.razon_social ?? '';
  const bloques = bloquesOrdenPropia(r.datos);
  const entrada = ['Buenos días,', `Te enviamos el pedido de transporte ${ref}. Va adjunta la orden de carga en PDF; debajo tienes el mismo detalle.`];
  const cierre = [`Para cualquier duda, responde a este email: le llega a ${empresa || 'quien te lo envía'}.`, `Un saludo,\n${empresa}`];
  const texto = [...entrada, ...bloques.map((b) => b.join('\n')), ...cierre].join('\n\n');
  const html = entrada.map((x) => `<p>${escaparHtml(x)}</p>`).join('')
    + bloques.map(([t, ...ls]) => `<p style="margin:14px 0"><strong>${escaparHtml(t)}</strong>${ls.map((x) => `<br>${escaparHtml(x)}`).join('')}</p>`).join('')
    + cierre.map((x) => `<p>${escaparHtml(x).replace(/\n/g, '<br>')}</p>`).join('');
  // Las cuentas de prueba (.invalid) no reciben copia ni respuestas: serían rebotes.
  const mio = /\.invalid$/i.test(perfil.email) ? undefined : perfil.email;
  const res = await enviarEmailOperativo({
    clave: `orden_propia:${perfil.id}:${envio}:${randomUUID()}`, tipo: 'orden_carga', envioId: envio, para: email,
    asunto: `Pedido de transporte ${ref} - ${empresa}`.slice(0, 180), html, texto,
    deNombre: empresa ? `${empresa} (vía Dynamotrans.com)` : undefined, responderA: mio, copia: mio, sinCopiaDynamo: true,
    adjuntos: [{ nombre: r.nombre, base64: Buffer.from(r.bytes).toString('base64'), tipo: 'application/pdf' }],
  });
  // El email en su ficha: también si el envío del email ha fallado (lo ha escrito para eso).
  let guardado = false;
  if (guardar && r.operadorId && r.datos.porteador?.email?.trim().toLowerCase() !== email) {
    const { error: eg } = await s.supabase.from('operadores').update({ email }).eq('id', r.operadorId);
    guardado = !eg;
  }
  return res.estado === 'enviado'
    ? { ok: true, aviso: `Orden de carga enviada a ${email}.${guardado ? ' El email queda guardado en la ficha del transportista.' : ''}` }
    : { ok: false, error: res.error ?? 'No se ha podido enviar el email.' };
}

export async function marcarMiEnvioManual(envio: string, estado: string): Promise<Res> {
  comprobarEntrada("app/panel/(app)/envios/acciones-cliente#marcarMiEnvioManual", [envio, estado]);
  const s = await soloCliente();
  if (!s) return { ok: false, error: 'Solo el cliente lleva sus envíos manuales.' };
  const { error } = await s.supabase.rpc('marcar_mi_envio_manual', { p_envio: envio, p_estado: estado });
  return error ? { ok: false, error: limpio(error.message) } : { ok: true, aviso: 'Estado actualizado.' };
}

