import 'server-only';
import { createHash, randomInt } from 'node:crypto';
import { supabaseServicio } from '@/lib/supabase/servicio';
import { sinDireccionesDePrueba } from '@/lib/emailBoton';
import { CONTACTO } from '@/lib/atencion';

// Código de 6 cifras al email de quien va a firmar el CMR digital (usuario, 2026-11-22).
// Es un código de SEGURIDAD, así que va distinto de los demás emails del sistema:
//  - sale AL MOMENTO (sin los 30 s de espera: quien firma está esperándolo en el muelle);
//  - SIN copia a Dynamo (una copia del código lo haría inútil como prueba);
//  - el código no se guarda en ningún sitio: la base de datos solo tiene su huella, y el
//    registro de emails guarda el cuerpo con el código tapado.

export const huellaCodigo = (token: string, codigo: string) =>
  createHash('sha256').update(`${token}:${codigo}`).digest('hex');

export const codigoNuevo = () => String(randomInt(0, 1_000_000)).padStart(6, '0');

const cuerpo = (codigo: string, ref: string | null) =>
  `<p>Tu código para firmar el <strong>CMR digital</strong>${ref ? ` del envío <strong>#${ref}</strong>` : ''} es:</p>`
  + `<p style="font-size:30px;font-weight:800;letter-spacing:6px;margin:14px 0;font-family:monospace">${codigo}</p>`
  + '<p>Escríbelo en la ventana de firma. Caduca en <strong>15 minutos</strong>.</p>'
  + '<p style="color:#6b7280;font-size:13px">Si no estás firmando un CMR de Dynamo, no hagas nada: sin el código no pasa nada. No se lo des a nadie por teléfono.</p>';

// Manda el email y deja constancia. Nunca lanza.
export async function mandarCodigoFirma(d: { codigoId: string; envioId: string; para: string; codigo: string; referencia: string | null }): Promise<boolean> {
  const sb = supabaseServicio();
  const token = process.env.POSTMARK_SERVER_TOKEN;
  if (!sb) return false;
  const asunto = `Tu código para firmar el CMR${d.referencia ? ` · envío #${d.referencia}` : ''}`;
  const registro = (estado: 'enviado' | 'error' | 'omitido', error: string | null, postmark: string | null) =>
    sb.from('emails_enviados').insert({
      clave: `codigo_firma:${d.codigoId}`, tipo: 'codigo_firma', envio_id: d.envioId, destinatario: d.para, asunto,
      cuerpo_html: cuerpo('••••••', d.referencia), estado, error, via: 'web', postmark_id: postmark,
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
        TextBody: `Tu código para firmar el CMR digital${d.referencia ? ` del envío #${d.referencia}` : ''}: ${d.codigo}. Caduca en 15 minutos.`,
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
