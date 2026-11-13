import 'server-only';
import { headers } from 'next/headers';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/tipos';
import { enviarEmailOperativo, escaparHtml as esc, type AdjuntoEmail } from './emailOperativo';
import { pdfDeEnvioDynamo, pdfCmrPorToken } from '@/lib/pdf/generar';
import { supabasePublico } from '@/lib/supabase/publico';
import { supabaseServicio } from '@/lib/supabase/servicio';
import { CONTACTO } from '@/lib/atencion';
import type { CmrPublico } from '@/app/cmr/[token]/tipos';

// ---- Avisos de EVENTO por email (usuario, 2026-11-12) --------------------------------
// · Orden de carga: al asignar transportista, el email con la orden en PDF adjunta y
//   los enlaces de descarga (igual que el diálogo «Compartir» de la ficha, pero solo).
// · Firmas del CMR: cada firma de casilla avisa a Dynamo; con TODAS las firmas, el
//   eCMR en PDF va a Dynamo, al creador del envío (y sus copias) y al transportista.
// Todos con registro en `emails_enviados` (clave única: no se repiten) y sin romper
// nunca la acción que los dispara.

type SB = SupabaseClient<Database>;

async function origenActual(): Promise<string> {
  try {
    const h = await headers();
    const host = h.get('x-forwarded-host') ?? h.get('host');
    return host ? `https://${host}` : 'https://www.dynamotrans.com';
  } catch { return 'https://www.dynamotrans.com'; }
}

const pie = `<p>— Dynamo Operador Logístico, S.L. · ${CONTACTO.email} · ${CONTACTO.telefono}</p>`;

// Email de contacto del transportista: tráfico primero, luego el principal.
async function emailTransportista(sb: SB, transportistaId: string): Promise<string | null> {
  const { data: c } = await sb.from('contactos').select('email, funcion, es_principal')
    .eq('transportista_id', transportistaId).not('email', 'is', null)
    .order('es_principal', { ascending: false }).limit(10);
  return (c ?? []).sort((a, b) => Number(b.funcion === 'trafico') - Number(a.funcion === 'trafico'))[0]?.email ?? null;
}

// ---- 1. Orden de carga al asignar transportista -------------------------------------
export async function avisoOrdenCarga(sb: SB, usuarioId: string, envio: string): Promise<void> {
  try {
    const { data: e } = await sb.from('envios')
      .select('referencia_gx, transportista_id, es_manual, fecha_carga_prevista, fecha_carga_desde, fecha_carga_hasta')
      .eq('id', envio).maybeSingle();
    if (!e?.transportista_id || e.es_manual) return;
    const para = await emailTransportista(sb, e.transportista_id);
    // El enlace vivo del CMR (o uno nuevo): con él van los enlaces de descarga de la orden.
    let token = (await sb.from('cmr_enlaces').select('token').eq('envio_id', envio).eq('revocado', false)
      .gt('caduca_en', new Date().toISOString()).maybeSingle()).data?.token ?? null;
    if (!token) {
      await sb.from('cmr_enlaces').update({ revocado: true }).eq('envio_id', envio).eq('revocado', false);
      token = (await sb.from('cmr_enlaces').insert({ envio_id: envio }).select('token').single()).data?.token ?? null;
    }
    const origen = await origenActual();
    const enlOp = token ? `${origen}/cmr/${token}/orden?copia=operativa` : null;
    const enlEc = token ? `${origen}/cmr/${token}/orden?copia=economica&clave=${e.transportista_id}` : null;
    let adjuntos: AdjuntoEmail[] | undefined;
    const pdf = await pdfDeEnvioDynamo(sb, envio, 'orden-de-carga', usuarioId, origen);
    if (!('error' in pdf)) adjuntos = [{ nombre: pdf.nombre, base64: Buffer.from(pdf.bytes).toString('base64'), tipo: 'application/pdf' }];
    const fecha = e.fecha_carga_prevista ?? e.fecha_carga_desde ?? null;
    const html = `<p>Hola,</p>
<p>Os hemos asignado el envío <strong>#${esc(e.referencia_gx)}</strong>${fecha ? ` (carga el <strong>${esc(fecha)}</strong>)` : ''}. Va adjunta la <strong>orden de carga en PDF</strong> con todos los datos y las condiciones.</p>
${enlOp && enlEc ? `<p>También podéis abrirla o descargarla aquí:<br>· Copia del conductor (sin precios): <a href="${enlOp}">${enlOp}</a><br>· Copia de administración (completa): <a href="${enlEc}">${enlEc}</a></p>` : ''}
<p>Si cambian las matrículas o el conductor, avisadnos ANTES de la carga. Urgencias e incidencias 24 h: ${CONTACTO.telefono}.</p>
${pie}`;
    await enviarEmailOperativo({ clave: `orden_carga:${envio}:${e.transportista_id}`, tipo: 'orden_carga', envioId: envio,
      para, asunto: `Orden de carga · envío #${e.referencia_gx} · Dynamo`, html, adjuntos });
  } catch { /* el aviso nunca rompe la asignación */ }
}

// ---- 2. Firmas del CMR (página pública) ---------------------------------------------
export async function avisosFirmaCmr(token: string): Promise<void> {
  try {
    const sbp = supabasePublico();
    if (!sbp) return;
    const { data } = await sbp.rpc('cmr_publico', { p_token: token });
    const cmr = data as CmrPublico | null;
    if (!cmr || cmr.resultado !== 'ok') return;
    const total = (cmr.paradas?.length ?? 0) + 1;
    const casillas = (cmr.firmas ?? []).filter((f) => !f.extra);
    const hechas = casillas.length;
    const ultima = [...casillas].sort((a, b) => (a.firmado_en ?? '').localeCompare(b.firmado_en ?? '')).pop();
    const origen = await origenActual();
    const ref = cmr.referencia ?? '';
    const sbs = supabaseServicio();
    let envioId: string | null = null;
    if (sbs) envioId = (await sbs.from('cmr_enlaces').select('envio_id').eq('token', token).maybeSingle()).data?.envio_id ?? null;

    // (a) Cada firma de casilla → aviso a Dynamo (las extra no avisan).
    if (ultima) {
      const rolTxt = ({ remitente: 'cargador', transportista: 'transportista', destinatario: 'destinatario' } as Record<string, string>)[ultima.rol] ?? ultima.rol;
      await enviarEmailOperativo({
        clave: `firma_cmr:${token}:${ultima.rol}:${ultima.parada_id ?? 'cabecera'}`, tipo: 'firma_cmr', envioId,
        para: CONTACTO.email, asunto: `Firma del CMR · envío #${ref} · ${hechas} de ${total}`,
        html: `<p><strong>${esc(ultima.nombre)}</strong> (${esc(rolTxt)}) acaba de firmar el CMR del envío <strong>#${esc(ref)}</strong>: van <strong>${hechas} de ${total}</strong> firmas.</p>
<p><a href="${origen}/cmr/${token}">Ver la hoja de firmas</a></p>${pie}`,
      });
    }

    // (b) TODAS las firmas → el eCMR en PDF a Dynamo, al creador del envío y al transportista.
    if (hechas >= total) {
      const destinos = new Set<string>([CONTACTO.email]);
      if (sbs && envioId) {
        const { data: ev } = await sbs.from('envios').select('creado_por, transportista_id').eq('id', envioId).maybeSingle();
        if (ev?.creado_por) {
          const { data: u } = await sbs.from('usuarios').select('email, emails_copia_avisos').eq('id', ev.creado_por).maybeSingle();
          if (u?.email) destinos.add(u.email);
          (u?.emails_copia_avisos ?? []).forEach((x) => destinos.add(x));
        }
        if (ev?.transportista_id) {
          const t = await emailTransportista(sbs, ev.transportista_id);
          if (t) destinos.add(t);
        }
        // Los FIRMANTES que dejaron su email también reciben la copia: la ventana de
        // firma lo promete («se te enviará copia del eCMR», usuario 2026-11-12).
        const { data: fs } = await sbs.from('firmas_cmr').select('email').eq('envio_id', envioId).not('email', 'is', null);
        (fs ?? []).forEach((f) => { if (f.email) destinos.add(f.email); });
      }
      let adjuntos: AdjuntoEmail[] | undefined;
      const pdf = await pdfCmrPorToken(sbp, token, origen);
      if (!('error' in pdf)) adjuntos = [{ nombre: pdf.nombre, base64: Buffer.from(pdf.bytes).toString('base64'), tipo: 'application/pdf' }];
      await enviarEmailOperativo({
        clave: `cmr_completo:${token}`, tipo: 'cmr_completo', envioId, para: [...destinos].join(','),
        asunto: `CMR firmado por todas las partes · envío #${ref}`,
        html: `<p>El CMR del envío <strong>#${esc(ref)}</strong> ya está <strong>firmado por todas las partes</strong> (${total} de ${total}). Va adjunto en PDF, con las firmas y su registro.</p>
<p>También se puede ver aquí: <a href="${origen}/cmr/${token}">hoja de firmas</a> · <a href="${origen}/cmr/${token}/pdf">PDF</a></p>${pie}`,
        adjuntos,
      });
    }
  } catch { /* el aviso nunca rompe la firma */ }
}
