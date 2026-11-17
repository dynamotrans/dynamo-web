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
  clave: string; tipo: 'orden_carga' | 'firma_cmr' | 'cmr_completo' | 'deca' | 'proforma_calculo';
  envioId?: string | null; para: string | null; asunto: string; html: string; adjuntos?: AdjuntoEmail[];
  // Para los emails que un CLIENTE manda a SU transportista (orden de su envío propio):
  // el nombre del remitente es su empresa, las respuestas le llegan a él (no a Dynamo) y
  // recibe copia. `texto` es la versión en texto llano del mismo cuerpo.
  deNombre?: string; responderA?: string; copia?: string; texto?: string;
  // Sin la copia a Dynamo: solo para la orden que un cliente manda a SU transportista
  // (usuario, 2026-11-17: Dynamo no interviene en ese envío, no pinta nada en copia).
  sinCopiaDynamo?: boolean;
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
    if (error) {
      // Clave repetida (23505): ese aviso ya se mandó, y no se repite. Cualquier OTRO error
      // es un fallo de verdad (antes salía también como «clave repetida» y tapaba la causa):
      // se dice tal cual y queda en el registro del servidor.
      if (error.code === '23505') return { estado: 'error', error: 'Este aviso ya se mandó (clave repetida).' };
      console.error('[email operativo] no se ha podido registrar', d.tipo, error.code, error.message);
      // La clave de servicio de Supabase que hay en Vercel no vale para este proyecto
      // (mal pegada, de otro proyecto o retirada): no se puede registrar ni enviar nada.
      if (/invalid api key|jwt|unauthorized/i.test(error.message ?? '')) {
        return { estado: 'error', error: 'El envío de emails de la plataforma no está bien configurado (la clave de servicio de Supabase en Vercel no es válida). No se ha enviado: avisa a Dynamo.' };
      }
      return { estado: 'error', error: error.code === '23514'
        ? 'La base de datos todavía no admite este tipo de email (falta aplicar la última actualización). Vuelve a intentarlo en unos minutos.'
        : 'No se ha podido registrar el email en la base de datos: no se ha enviado.' };
    }
    if (!fila || !d.para) return { estado: 'error', error: 'Sin destinatario con email.' };
    // Direcciones de prueba (dominio .invalid, que no existe): no se mandan a Postmark —
    // serían rebotes que gastan emails y dañan la reputación del dominio. Quedan omitidas.
    if (/\.invalid(\s|>|,|;|$)/i.test(d.para)) {
      await sb.from('emails_enviados').update({ estado: 'omitido', error: 'Dirección de prueba (.invalid): no se envía.' }).eq('id', fila.id);
      return { estado: 'error', error: 'Es una dirección de prueba (.invalid): no se envía.' };
    }
    const token = process.env.POSTMARK_SERVER_TOKEN;
    if (!token) {
      await sb.from('emails_enviados').update({ estado: 'error', error: 'Falta POSTMARK_SERVER_TOKEN en el servidor.' }).eq('id', fila.id);
      return { estado: 'error', error: 'Falta configurar el envío de email (claves de Postmark en Vercel): el email queda registrado pero SIN enviar.' };
    }
    const res = await fetch('https://api.postmarkapp.com/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-Postmark-Server-Token': token },
      body: JSON.stringify({
        From: `${(d.deNombre ?? '').replace(/[<>"\r\n,;]/g, ' ').trim().slice(0, 80) || 'Dynamotrans.com'} <${CONTACTO.email}>`,
        To: d.para, Subject: d.asunto, HtmlBody: d.html, MessageStream: 'outbound',
        ...(d.texto ? { TextBody: d.texto } : {}),
        ...(d.responderA ? { ReplyTo: d.responderA } : {}),
        // Copia a Dynamo en todos los emails del sistema (usuario, 2026-11-15), salvo
        // cuando el destinatario ya es Dynamo. (Las ofertas de la difusión, la única
        // excepción a la copia, no pasan por aquí: van por la cola de la base de datos.)
        ...(() => {
          const cc = [d.copia, d.sinCopiaDynamo ? null : CONTACTO.email].filter((x): x is string => !!x && !d.para!.toLowerCase().includes(x.toLowerCase()));
          return cc.length ? { Cc: [...new Set(cc.map((x) => x.toLowerCase()))].join(', ') } : {};
        })(),
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
