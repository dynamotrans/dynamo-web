import 'server-only';
import { sinDireccionesDePrueba } from '@/lib/emailBoton';
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
// estado «enviado» = aceptado para salir: desde el 2026-11-20 TODOS los emails esperan su
// plazo (Parámetros → emails_espera_segundos, 60 s desde el 2026-11-25) por si el cambio que los provoca se
// anula; `saleEn` dice cuándo sale.
export type ResultadoEmail = { estado: 'enviado' | 'error'; error?: string; saleEn?: string };

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
  // Quién lo pide (para que pueda anularlo mientras espera). Sin él, solo Dynamo.
  autorId?: string | null;
}): Promise<ResultadoEmail> {
  try {
    const sb = supabaseServicio();
    if (!sb) return { estado: 'error', error: 'Falta la clave de servicio en el servidor (Vercel).' };
    const opciones = {
      ...(d.deNombre ? { de_nombre: d.deNombre.replace(/[<>"\r\n,;]/g, ' ').trim().slice(0, 80), remitente: d.deNombre.replace(/\s*\(vía [^)]*\)$/, '') } : {}),
      ...(d.responderA ? { responder_a: d.responderA } : {}),
      ...(d.copia ? { copia: d.copia } : {}),
      ...(d.sinCopiaDynamo ? { sin_copia_dynamo: true } : {}),
      ...(d.texto ? { texto: d.texto } : {}),
      ...(d.adjuntos?.length ? { adjuntos: d.adjuntos.map((a) => ({ Name: a.nombre, Content: a.base64, ContentType: a.tipo })) } : {}),
    };
    // El registro primero: si la clave ya existe, este aviso ya se mandó (o está en
    // ello) y NO se repite — el insert falla por la clave única y aquí se acaba. La base de
    // datos le pone el plazo (enviar_desde) y lo cuelga del cambio abierto del envío.
    // Las direcciones de prueba (.invalid) se quitan; si no queda ninguna real, no se manda.
    const reales = d.para ? sinDireccionesDePrueba(d.para) : '';
    const { data: fila, error } = await sb.from('emails_enviados').insert({
      clave: d.clave, tipo: d.tipo, envio_id: d.envioId ?? null,
      destinatario: reales || d.para || '—', asunto: d.asunto, cuerpo_html: d.html,
      estado: d.para ? 'pendiente' : 'error',
      error: d.para ? null : 'Sin destinatario con email: avisar a mano.',
      via: 'web', opciones, creado_por: d.autorId ?? null,
    }).select('id, enviar_desde, estado, error').single();
    if (error) {
      // Clave repetida (23505): ese aviso ya se mandó, y no se repite. Cualquier OTRO error
      // es un fallo de verdad: se dice tal cual y queda en el registro del servidor.
      if (error.code === '23505') return { estado: 'error', error: 'Este aviso ya se mandó (clave repetida).' };
      console.error('[email operativo] no se ha podido registrar', d.tipo, error.code, error.message);
      if (/invalid api key|jwt|unauthorized/i.test(error.message ?? '')) {
        return { estado: 'error', error: 'El envío de emails de la plataforma no está bien configurado (la clave de servicio de Supabase en Vercel no es válida). No se ha enviado: avisa a Dynamo.' };
      }
      return { estado: 'error', error: error.code === '23514'
        ? 'La base de datos todavía no admite este tipo de email (falta aplicar la última actualización). Vuelve a intentarlo en unos minutos.'
        : 'No se ha podido registrar el email en la base de datos: no se ha enviado.' };
    }
    if (!fila || !d.para) return { estado: 'error', error: 'Sin destinatario con email.' };
    // La base de datos lo ha dejado sin mandar (envío con transportista propio del cliente).
    if (fila.estado === 'omitido') return { estado: 'error', error: fila.error ?? 'Este email no se manda.' };
    // Solo direcciones de prueba (dominio .invalid, que no existe): no se manda a Postmark —
    // serían rebotes que gastan emails y dañan la reputación del dominio. Queda omitido.
    if (!reales) {
      await sb.from('emails_enviados').update({ estado: 'omitido', error: 'Dirección de prueba (.invalid): no se envía.' }).eq('id', fila.id);
      return { estado: 'error', error: 'Es una dirección de prueba (.invalid): no se envía.' };
    }
    if (!process.env.POSTMARK_SERVER_TOKEN) {
      await sb.from('emails_enviados').update({ estado: 'error', error: 'Falta POSTMARK_SERVER_TOKEN en el servidor.' }).eq('id', fila.id);
      return { estado: 'error', error: 'Falta configurar el envío de email (claves de Postmark en Vercel): el email queda registrado pero SIN enviar.' };
    }
    // Sale al terminar su plazo: lo manda este mismo servidor después de responder (after) si
    // el plazo cabe en lo que aguanta (~50 s). Con el plazo a 60 s no cabe: lo manda la cola de
    // la base de datos, que lo recoge a los 15 segundos de cumplirse.
    try {
      const { after } = await import('next/server');
      after(() => mandarCuandoToque(fila.id));
    } catch { /* fuera de una petición: lo manda la cola */ }
    return { estado: 'enviado', saleEn: fila.enviar_desde };
  } catch { /* nada: el aviso no puede romper la acción que lo dispara */ }
  return { estado: 'error', error: 'No se ha podido enviar.' };
}

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Espera a que termine el plazo del email (que puede alargarse si el envío se vuelve a
// cambiar) y lo manda, salvo que en ese tiempo se haya anulado (estado ≠ pendiente) o el
// envío se haya cancelado. Como mucho ~50 s: si no da tiempo, lo manda la cola.
async function mandarCuandoToque(id: string): Promise<void> {
  const sb = supabaseServicio();
  const token = process.env.POSTMARK_SERVER_TOKEN;
  if (!sb || !token) return;
  const inicio = Date.now();
  try {
    for (;;) {
      const { data: x } = await sb.from('emails_enviados').select('estado, enviar_desde').eq('id', id).maybeSingle();
      if (!x || x.estado !== 'pendiente') return;
      const falta = new Date(x.enviar_desde).getTime() - Date.now();
      if (falta <= 0) break;
      if (Date.now() - inicio + falta > 50_000) return;
      await dormir(falta + 300);
    }
    // Lo coge solo uno (este servidor o la cola), aunque coincidan.
    const { data: f } = await sb.from('emails_enviados').update({ estado: 'enviado', enviado_en: new Date().toISOString() })
      .eq('id', id).eq('estado', 'pendiente').lte('enviar_desde', new Date().toISOString())
      .select('id, tipo, envio_id, destinatario, asunto, cuerpo_html, opciones').maybeSingle();
    if (!f) return;
    if (f.envio_id && f.tipo !== 'aviso_parada_cancelada' && f.tipo !== 'pago_devuelto') {
      const { data: e } = await sb.from('envios').select('estado').eq('id', f.envio_id).maybeSingle();
      if (e?.estado === 'cancelado') {
        await sb.from('emails_enviados').update({ estado: 'omitido', error: 'El envío se canceló antes de mandarlo.' }).eq('id', id);
        return;
      }
    }
    const op = (f.opciones ?? {}) as { de_nombre?: string; remitente?: string; responder_a?: string; copia?: string;
      sin_copia_dynamo?: boolean; texto?: string; adjuntos?: { Name: string; Content: string; ContentType: string }[] };
    // El diseño común (cabecera, firma y pie), el mismo que la cola: email_con_diseno().
    const { data: envuelto } = await sb.rpc('email_con_diseno', { p_html: f.cuerpo_html, p_remitente: op.remitente ?? null });
    const res = await fetch('https://api.postmarkapp.com/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-Postmark-Server-Token': token },
      body: JSON.stringify({
        From: `${op.de_nombre || 'Dynamotrans.com'} <${CONTACTO.email}>`,
        To: f.destinatario, Subject: f.asunto, HtmlBody: (envuelto as string | null) || f.cuerpo_html, MessageStream: 'outbound',
        ...(op.texto ? { TextBody: op.texto } : {}),
        ...(op.responder_a ? { ReplyTo: op.responder_a } : {}),
        // Copia a Dynamo en todos los emails del sistema (usuario, 2026-11-15), salvo
        // cuando el destinatario ya es Dynamo o lo que un cliente manda a su transportista.
        ...(() => {
          const cc = [op.copia, op.sin_copia_dynamo ? null : CONTACTO.email].filter((x): x is string => !!x && !f.destinatario.toLowerCase().includes(x.toLowerCase()));
          return cc.length ? { Cc: [...new Set(cc.map((x) => x.toLowerCase()))].join(', ') } : {};
        })(),
        ...(op.adjuntos?.length ? { Attachments: op.adjuntos } : {}),
      }),
    });
    const cuerpo = await res.json().catch(() => null) as { MessageID?: string } | null;
    const sinAdjuntos = { ...op }; delete sinAdjuntos.adjuntos;   // el PDF no se guarda en la base de datos
    if (res.ok) {
      await sb.from('emails_enviados').update({ postmark_id: cuerpo?.MessageID ?? 'ok', opciones: sinAdjuntos }).eq('id', id);
    } else {
      await sb.from('emails_enviados').update({ estado: 'error', error: `Postmark ${res.status}: ${JSON.stringify(cuerpo ?? {}).slice(0, 400)}` }).eq('id', id);
    }
  } catch { /* si falla aquí, el email sigue pendiente y lo manda la cola */ }
}

// Escape mínimo para incrustar textos de datos en el HTML del email.
export const escaparHtml = (t: string | null | undefined) =>
  (t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
