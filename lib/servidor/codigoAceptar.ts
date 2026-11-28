import 'server-only';
import { randomInt } from 'node:crypto';
import { supabaseServicio } from '@/lib/supabase/servicio';
import { sinDireccionesDePrueba } from '@/lib/emailBoton';
import { CONTACTO } from '@/lib/atencion';
import { mandarCodigo, whatsappConectado } from '@/lib/servidor/whatsapp';

// CÓDIGO DE 4 CIFRAS PARA ACEPTAR UNA CARGA (usuario, 2026-11-28): «se le manda tanto por email
// como por WhatsApp el mismo código a los dos sitios, para que no tenga duda de que le llega».
// Como el del CMR, es un código de SEGURIDAD: sale al momento, sin copia a Dynamo, y en el
// registro de emails va tapado. La base de datos solo guarda su huella.

export const codigoAceptarNuevo = () => String(randomInt(0, 10_000)).padStart(4, '0');

const cuerpo = (codigo: string, ref: string | null) =>
  `<p>Tu código para <strong>aceptar la carga</strong>${ref ? ` <strong>#${ref}</strong>` : ''} de Dynamo es:</p>`
  + `<p style="font-size:34px;font-weight:800;letter-spacing:10px;margin:14px 0;font-family:monospace">${codigo}</p>`
  + '<p>Escríbelo en la página de la carga. Caduca en <strong>15 minutos</strong>.</p>'
  + '<p style="color:#6b7280;font-size:13px">Si no estás aceptando una carga de Dynamo, no hagas nada: sin el código nadie puede aceptarla en tu nombre. No se lo des a nadie por teléfono.</p>';

async function porEmail(d: { reserva: string; envioId: string; para: string; codigo: string; referencia: string | null }): Promise<boolean> {
  const sb = supabaseServicio();
  const token = process.env.POSTMARK_SERVER_TOKEN;
  if (!sb) return false;
  const asunto = `Tu código para aceptar la carga${d.referencia ? ` #${d.referencia}` : ''}`;
  const registro = (estado: 'enviado' | 'error' | 'omitido', error: string | null, postmark: string | null) =>
    sb.from('emails_enviados').insert({
      clave: `codigo_aceptar:${d.reserva}:${Date.now()}`, tipo: 'codigo_aceptar_carga', envio_id: d.envioId, destinatario: d.para, asunto,
      cuerpo_html: cuerpo('••••', d.referencia), estado, error, via: 'web', postmark_id: postmark,
      enviado_en: estado === 'enviado' ? new Date().toISOString() : null,
    });
  try {
    if (!sinDireccionesDePrueba(d.para)) { await registro('omitido', 'Dirección de prueba (.invalid): no se envía.', null); return false; }
    if (!token) { await registro('error', 'Falta POSTMARK_SERVER_TOKEN en el servidor.', null); return false; }
    const { data: envuelto } = await sb.rpc('email_con_diseno', { p_html: cuerpo(d.codigo, d.referencia), p_remitente: null });
    const res = await fetch('https://api.postmarkapp.com/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-Postmark-Server-Token': token },
      body: JSON.stringify({
        From: `Dynamotrans.com <${CONTACTO.email}>`, To: d.para, Subject: asunto, MessageStream: 'outbound',
        HtmlBody: (envuelto as string | null) || cuerpo(d.codigo, d.referencia),
        TextBody: `Tu código para aceptar la carga${d.referencia ? ` #${d.referencia}` : ''} de Dynamo: ${d.codigo}. Caduca en 15 minutos.`,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const j = await res.json().catch(() => null) as { MessageID?: string } | null;
    if (!res.ok) { await registro('error', `Postmark ${res.status}: ${JSON.stringify(j ?? {}).slice(0, 400)}`, null); return false; }
    await registro('enviado', null, j?.MessageID ?? 'ok');
    return true;
  } catch {
    await registro('error', 'No se ha podido contactar con Postmark.', null).then(() => {}, () => {});
    return false;
  }
}

async function porWhatsapp(telefono: string, codigo: string): Promise<boolean> {
  const sb = supabaseServicio();
  if (!sb || !whatsappConectado()) return false;
  // La misma plantilla de «Autenticación» de Meta que el código del móvil (admite 4 cifras).
  const { data: p } = await sb.from('parametros').select('valor').eq('clave', 'whatsapp_plantilla_codigo').maybeSingle();
  const plantilla = String(p?.valor ?? '').replace(/"/g, '').trim();
  if (!plantilla) return false;
  const r = await mandarCodigo(telefono, plantilla, codigo).catch(() => ({ ok: false as const, error: 'fallo' }));
  if (!r.ok) console.error('[WhatsApp] código para aceptar la carga', r.error);
  return r.ok;
}

/** Manda el MISMO código por email y por WhatsApp. Devuelve por dónde ha salido. Nunca lanza. */
export async function mandarCodigoAceptar(d: { reserva: string; envioId: string; referencia: string | null; email: string | null; telefono: string | null; codigo: string }): Promise<{ email: boolean; whatsapp: boolean }> {
  const [email, whatsapp] = await Promise.all([
    d.email ? porEmail({ reserva: d.reserva, envioId: d.envioId, para: d.email, codigo: d.codigo, referencia: d.referencia }) : Promise.resolve(false),
    d.telefono ? porWhatsapp(d.telefono, d.codigo) : Promise.resolve(false),
  ]);
  return { email, whatsapp };
}
