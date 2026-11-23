import 'server-only';
import { supabaseServicio } from '@/lib/supabase/servicio';
import { proformaDeEnvio } from '@/lib/servidor/proformaEnvio';
import { stripeListo } from '@/lib/stripe';
import type { SB } from '@/lib/supabase/cliente';

// EMAIL «ENVÍO CREADO» DE UN ENVÍO PENDIENTE DE PAGO (usuario, 2026-11-23: «en el mail también
// podríamos poner el botón de pago tarjeta, o adjunta PDF proforma… o paga con transferencia a
// los datos de la proforma PDF adjunta»). El email lo encola la base de datos
// (fn_email_envio_creado) y espera su plazo de salida; aquí, justo al crear el envío, se
// completa mientras espera:
//   · se le adjunta la proforma en PDF (opciones.adjuntos: la cola la manda y luego la borra);
//   · se rellenan los dos huecos del texto: el pago con tarjeta (si está conectado) y
//     «va adjunta en PDF» (solo si de verdad se ha adjuntado).
// NUNCA lanza ni frena la creación del envío: si algo falla, el email sale como lo dejó la base
// de datos, que ya es correcto por sí solo (los huecos son comentarios que no se ven).
const H_TARJETA = '<!--pago-tarjeta-->';
const H_PROFORMA = '<!--pago-proforma-->';

export async function completarEmailEnvioCreado(sb: SB, envioId: string, dynamo: boolean): Promise<void> {
  try {
    const sv = supabaseServicio();
    if (!sv) return;
    const { data: fila } = await sv.from('emails_enviados').select('id, estado, cuerpo_html, opciones')
      .eq('clave', `envio_creado:${envioId}`).maybeSingle();
    if (!fila || fila.estado !== 'pendiente' || !fila.cuerpo_html?.includes(H_PROFORMA)) return;
    const pdf = await proformaDeEnvio(sb, envioId, dynamo);
    const adjunta = pdf.ok && pdf.pagadera;
    const html = fila.cuerpo_html
      .replace(H_TARJETA, stripeListo() ? ' con <strong>tarjeta</strong> desde el botón «Pagar el envío» (se confirma al momento), o' : '')
      .replace(H_PROFORMA, adjunta ? ', que va <strong>adjunta en PDF</strong> a este email' : '');
    const opciones = { ...((fila.opciones ?? {}) as Record<string, unknown>),
      ...(adjunta ? { adjuntos: [{ Name: pdf.nombre, Content: Buffer.from(pdf.bytes).toString('base64'), ContentType: 'application/pdf' }] } : {}) };
    // Solo si sigue esperando: si ya ha salido (o se ha anulado), no se toca.
    await sv.from('emails_enviados').update({ cuerpo_html: html, opciones }).eq('id', fila.id).eq('estado', 'pendiente');
  } catch (e) {
    console.error('[email envío creado] no se ha podido completar', envioId, e instanceof Error ? e.message : e);
  }
}
