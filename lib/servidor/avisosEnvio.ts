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
      .select('referencia_gx, transportista_id, es_manual, fecha_carga_prevista, fecha_carga_desde, fecha_carga_hasta, creado_por, matricula_camion')
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
    // UNA sola orden (usuario, 2026-11-14): el documento completo; su enlace lleva la clave.
    const enlEc = token ? `${origen}/cmr/${token}/orden?copia=economica&clave=${e.transportista_id}` : null;
    const enlFirma = token ? `${origen}/cmr/${token}` : null;
    let adjuntos: AdjuntoEmail[] | undefined;
    const pdf = await pdfDeEnvioDynamo(sb, envio, 'orden-de-carga', usuarioId, origen);
    if (!('error' in pdf)) adjuntos = [{ nombre: pdf.nombre, base64: Buffer.from(pdf.bytes).toString('base64'), tipo: 'application/pdf' }];
    const fecha = e.fecha_carga_prevista ?? e.fecha_carga_desde ?? null;
    const html = `<p>Hola,</p>
<p>Os hemos asignado el envío <strong>#${esc(e.referencia_gx)}</strong>${fecha ? ` (carga el <strong>${esc(fecha)}</strong>)` : ''}. Va adjunta la <strong>ORDEN DE CARGA en PDF</strong> (documento completo) con todos los datos y las condiciones.</p>
${enlFirma ? `<p>Firma en este enlace tu e-CMR DIGITAL EN RUTA (para móvil u ordenador, 100 % seguro, digital y legal. Protocolo eIDAS): <a href="${enlFirma}">${enlFirma}</a></p>` : ''}
${enlEc ? `<p>También podéis abrir o descargar la orden aquí: <a href="${enlEc}">${enlEc}</a></p>` : ''}
<p>Si cambian las matrículas o el conductor, avisadnos ANTES de la carga. Urgencias e incidencias 24 h: ${CONTACTO.telefono}.</p>
${pie}`;
    await enviarEmailOperativo({ clave: `orden_carga:${envio}:${e.transportista_id}`, tipo: 'orden_carga', envioId: envio,
      para, asunto: `Orden de carga · envío #${e.referencia_gx} · Dynamo`, html, adjuntos });

    // La confirmación al CLIENTE, acto seguido, con SU copia de la orden (la copia
    // «cliente», sin la economía del transportista) — usuario, 2026-11-15: al asignarse
    // el transportista la orden se auto-envía a ambos. Mismo registro anti-duplicados.
    // Desde 2026-11-16 va al usuario del CLIENTE del envío (lo creara él o Dynamo), con
    // el mismo bloque de detalle que el resto de sus emails; si las matrículas ya están
    // puestas, van aquí y no sale después el email de matrículas.
    {
      const { data: dc } = await sb.rpc('datos_email_cliente_envio', { p_envio: envio });
      const datos = (dc ?? null) as { para?: string | null; detalle?: string | null } | null;
      let paraCli = datos?.para || null;
      if (!paraCli && e.creado_por) {
        const { data: u } = await sb.from('usuarios').select('email, emails_copia_avisos').eq('id', e.creado_por).maybeSingle();
        paraCli = u?.email ? [u.email, ...(u.emails_copia_avisos ?? [])].join(',') : null;
      }
      const { data: ps } = await sb.from('envio_paradas').select('tipo, poblacion, orden').eq('envio_id', envio).order('orden');
      const org = (ps ?? []).find((p) => p.tipo === 'carga')?.poblacion ?? null;
      const dst = [...(ps ?? [])].reverse().find((p) => p.tipo === 'descarga')?.poblacion ?? null;
      let adjCli: AdjuntoEmail[] | undefined;
      const { pdfsOrdenDynamo } = await import('@/lib/pdf/generar');
      const pc = await pdfsOrdenDynamo(sb, envio, usuarioId, ['cliente'], origen);
      if (!('error' in pc) && pc.pdfs[0]) adjCli = [{ nombre: pc.pdfs[0].nombre, base64: Buffer.from(pc.pdfs[0].bytes).toString('base64'), tipo: 'application/pdf' }];
      const conMatriculas = !!e.matricula_camion;
      const htmlCli = `<p>Hola,</p>
<p>Tu envío ya tiene <strong>transportista asignado</strong>${conMatriculas ? ' y las <strong>matrículas</strong> del camión' : ''}${fecha ? `, y carga el <strong>${esc(fecha)}</strong>` : ''}. Va adjunta tu copia de la <strong>orden de carga en PDF</strong>.</p>
${conMatriculas ? '' : '<p>Las matrículas aún no están puestas: te avisaremos en cuanto las tengamos.</p>'}
${datos?.detalle ?? ''}
<p>Lo sigues en vivo en <a href="${origen}/panel/envios?ver=${envio}">la ficha del envío</a>. Si hay cualquier cambio, te avisamos.</p>
${pie}`;
      await enviarEmailOperativo({ clave: `orden_carga_cliente:${envio}:${e.transportista_id}`, tipo: 'orden_carga', envioId: envio,
        para: paraCli, asunto: `Transporte confirmado · envío #${e.referencia_gx}${org && dst ? ` (${org} → ${dst})` : ''}`, html: htmlCli, adjuntos: adjCli });
    }
  } catch { /* el aviso nunca rompe la asignación */ }
}

// ---- 1-bis. El DeCA al transportista (usuario, 2026-11-15) ----------------------------
// El DeCA es un documento aparte del CMR y lleva su propio camino: se emite al ponerse las
// primeras matrículas y CADA VERSIÓN se le envía sola al transportista, con el PDF adjunto
// y su dirección pública (la del QR). Lo llama el archivo de copias cuando guarda una
// versión nueva; `clave` deja mandarlo también a mano desde el botón «DeCA» de la ficha.
export async function avisoDecaTransportista(d: { envioId: string; token: string; origen: string; version: string; primera: boolean;
  pdf: { bytes: Uint8Array; nombre: string }; clave?: string }): Promise<{ estado: 'enviado' | 'error'; para?: string; sinEmail?: boolean; error?: string }> {
  try {
    const sbs = supabaseServicio();
    if (!sbs) return { estado: 'error', error: 'Falta la clave de servicio en el servidor (Vercel).' };
    const { data: e } = await sbs.from('envios')
      .select('referencia_gx, transportista_id, es_manual, matricula_camion, matricula_remolque, conductor_nombre')
      .eq('id', d.envioId).maybeSingle();
    if (!e?.transportista_id || e.es_manual) return { estado: 'error', error: 'Este envío no tiene transportista asignado.' };
    const para = await emailTransportista(sbs, e.transportista_id);
    const matr = [e.matricula_camion, e.matricula_remolque].filter(Boolean).join(' / ');
    const enlace = `${d.origen}/deca/${d.token}`;
    const html = `<p>Hola,</p>
<p>${d.primera
    ? `Va adjunto el <strong>DeCA</strong> (documento de control administrativo) del envío <strong>#${esc(e.referencia_gx)}</strong>`
    : `El <strong>DeCA</strong> del envío <strong>#${esc(e.referencia_gx)}</strong> ha cambiado. Va adjunta la <strong>versión vigente</strong>, que sustituye a la anterior`}${matr ? ` · matrículas <strong>${esc(matr)}</strong>` : ''}${e.conductor_nombre ? ` · conductor ${esc(e.conductor_nombre)}` : ''}.</p>
<p><strong>El conductor debe llevarlo durante todo el transporte</strong>, en el móvil o impreso, y enseñarlo si se lo piden en una inspección (Orden FOM/2861/2012).</p>
<p>Siempre al día en esta dirección, la misma que abre su código QR: <a href="${enlace}">${enlace}</a></p>
<p>Si cambian las matrículas o el conductor, avisadnos ANTES de la carga. Urgencias e incidencias 24 h: ${CONTACTO.telefono}.</p>
${pie}`;
    const r = await enviarEmailOperativo({ clave: d.clave ?? `deca:${d.envioId}:${d.version}`, tipo: 'deca', envioId: d.envioId, para,
      asunto: `${d.primera ? 'DeCA' : 'DeCA actualizado'} · envío #${e.referencia_gx} · Dynamo`, html,
      adjuntos: [{ nombre: d.pdf.nombre, base64: Buffer.from(d.pdf.bytes).toString('base64'), tipo: 'application/pdf' }] });
    return { ...r, para: para ?? undefined, sinEmail: !para };
  } catch { return { estado: 'error', error: 'No se ha podido enviar.' }; }
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

    // (a-bis) La COPIA del firmante AL MOMENTO (usuario, 2026-11-14): quien firma y deja
    // su email recibe ya el PDF con las firmas de este instante — la página lo promete.
    // La copia final completa llegará aparte cuando firmen todas las partes.
    if (ultima && sbs && envioId) {
      let q = sbs.from('firmas_cmr').select('email, nombre').eq('envio_id', envioId).eq('rol', ultima.rol).eq('extra', false);
      q = ultima.parada_id ? q.eq('parada_id', ultima.parada_id) : q.is('parada_id', null);
      const { data: ff } = await q.order('firmado_en', { ascending: false }).limit(1).maybeSingle();
      if (ff?.email) {
        let adj: AdjuntoEmail[] | undefined;
        const pdfF = await pdfCmrPorToken(sbp, token, origen);
        if (!('error' in pdfF)) adj = [{ nombre: pdfF.nombre, base64: Buffer.from(pdfF.bytes).toString('base64'), tipo: 'application/pdf' }];
        await enviarEmailOperativo({
          clave: `firma_cmr:copia:${token}:${ultima.rol}:${ultima.parada_id ?? 'cabecera'}`, tipo: 'firma_cmr', envioId,
          para: ff.email, asunto: `Tu copia del CMR · envío #${ref} · firma ${hechas} de ${total}`,
          html: `<p>Hola${ff.nombre ? ` ${esc(ff.nombre)}` : ''},</p>
<p>Tu firma del CMR del envío <strong>#${esc(ref)}</strong> ha quedado registrada (van <strong>${hechas} de ${total}</strong> firmas). Va adjunta <strong>tu copia en PDF</strong> con las firmas de este momento.</p>
<p>Cuando firmen todas las partes te llegará la <strong>copia final completa</strong>. Mientras tanto puedes seguirlo en vivo y abrir el PDF actualizado: <a href="${origen}/cmr/${token}">hoja de firmas</a> · <a href="${origen}/cmr/${token}/pdf">PDF</a>.</p>${pie}`,
          adjuntos: adj,
        });
      }
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
