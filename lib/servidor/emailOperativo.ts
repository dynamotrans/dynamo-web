import 'server-only';
import { supabaseServicio } from '@/lib/supabase/servicio';
import { CONTACTO } from '@/lib/atencion';

// ---- Email operativo desde el servidor web (usuario, 2026-11-12) ---------------------
// El gemelo en TypeScript de enviar_emails_pendientes() de la base de datos: manda por
// la API de Postmark (POSTMARK_SERVER_TOKEN, pegada en Vercel) y deja constancia en el
// registro `emails_enviados`, con la MISMA clave única anti-duplicados. Aquí van los
// avisos DE EVENTO (orden de carga al asignar, firmas del CMR), que pueden llevar PDF
// adjunto; los de reloj (matrículas, víspera) los manda la base de datos con pg_cron.
// NUNCA lanza: un aviso jamás tumba la acción que lo dispara.

export type AdjuntoEmail = { nombre: string; base64: string; tipo: string };

// Devuelve cómo fue, para los envíos MANUALES que lo enseñan en pantalla (el diálogo de
// la orden); los avisos automáticos ignoran el resultado, como siempre.
export type ResultadoEmail = { estado: 'enviado' | 'error'; error?: string };

export async function enviarEmailOperativo(d: {
  clave: string; tipo: 'orden_carga' | 'firma_cmr' | 'cmr_completo';
  envioId?: string | null; para: string | null; asunto: string; html: string; adjuntos?: AdjuntoEmail[];
}): Promise<ResultadoEmail> {
  try {
    const sb = supabaseServicio();
    if (!sb) return { estado: 'error', error: 'Falta la clave de servicio en el servidor (Vercel).' };
    // El registro primero: si la clave ya existe, este aviso ya se mandó (o está en
    // ello) y NO se repite — el insert falla por la clave única y aquí se acaba.
    const { data: fila, error } = await sb.from('emails_enviados').insert({
      clave: d.clave, tipo: d.tipo, envio_id: d.envioId ?? null,
      destinatario: d.para || '—', asunto: d.asunto, cuerpo_html: d.html,
      estado: d.para ? 'pendiente' : 'error',
      error: d.para ? null : 'Sin destinatario con email: avisar a mano.',
    }).select('id').single();
    if (error) return { estado: 'error', error: 'Este aviso ya se mandó (clave repetida).' };
    if (!fila || !d.para) return { estado: 'error', error: 'Sin destinatario con email.' };
    const token = process.env.POSTMARK_SERVER_TOKEN;
    if (!token) {
      await sb.from('emails_enviados').update({ estado: 'error', error: 'Falta POSTMARK_SERVER_TOKEN en el servidor.' }).eq('id', fila.id);
      return { estado: 'error', error: 'Falta configurar el envío de email (claves de Postmark en Vercel): el email queda registrado pero SIN enviar.' };
    }
    const res = await fetch('https://api.postmarkapp.com/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-Postmark-Server-Token': token },
      body: JSON.stringify({
        From: `Dynamo <${CONTACTO.email}>`, To: d.para, Subject: d.asunto, HtmlBody: d.html, MessageStream: 'outbound',
        ...(d.adjuntos?.length ? { Attachments: d.adjuntos.map((a) => ({ Name: a.nombre, Content: a.base64, ContentType: a.tipo })) } : {}),
      }),
    });
    const cuerpo = await res.json().catch(() => null) as { MessageID?: string } | null;
    if (res.ok) {
      await sb.from('emails_enviados').update({ estado: 'enviado', enviado_en: new Date().toISOString(), postmark_id: cuerpo?.MessageID ?? 'ok' }).eq('id', fila.id);
      return { estado: 'enviado' };
    }
    await sb.from('emails_enviados').update({ estado: 'error', error: `Postmark ${res.status}: ${JSON.stringify(cuerpo ?? {}).slice(0, 400)}` }).eq('id', fila.id);
    return { estado: 'error', error: `El servidor de email ha devuelto un error (${res.status}).` };
  } catch { /* nada: el aviso no puede romper la acción que lo dispara */ }
  return { estado: 'error', error: 'No se ha podido enviar.' };
}

// Escape mínimo para incrustar textos de datos en el HTML del email.
export const escaparHtml = (t: string | null | undefined) =>
  (t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
