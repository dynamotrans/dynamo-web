import 'server-only';
import { headers } from 'next/headers';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/tipos';
import { enviarEmailOperativo, escaparHtml as esc, type AdjuntoEmail } from './emailOperativo';
import { pdfDeEnvioDynamo, pdfCmrPorToken } from '@/lib/pdf/generar';
import { supabasePublico } from '@/lib/supabase/publico';
import { supabaseServicio } from '@/lib/supabase/servicio';
import { CONTACTO } from '@/lib/atencion';
import { fecha as fechaTxt } from '@/lib/formato';
import { htmlCargasDeVuelta, type DatosVuelta } from '@/lib/cargasDeVuelta';
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

// ¿Tiene el envío las matrículas que pide el documento de control? (tractora y, en un
// conjunto articulado, semirremolque; un rígido o con plataforma no lleva semirremolque).
// La misma regla que envio_matriculas_completas() en la base de datos.
async function matriculasCompletas(sb: SB, envio: string): Promise<boolean> {
  const { data: e } = await sb.from('envios').select('matricula_camion, matricula_remolque, requiere_plataforma_elevadora, vehiculo_camion_id, operador_id')
    .eq('id', envio).maybeSingle();
  if (!e) return false;
  if (e.operador_id) return true;
  if (!e.matricula_camion) return false;
  if (e.matricula_remolque || e.requiere_plataforma_elevadora) return true;
  const veh = e.vehiculo_camion_id ? (await sb.from('vehiculos').select('tipo').eq('id', e.vehiculo_camion_id).maybeSingle()).data : null;
  return veh?.tipo === 'rigido';
}

// Caja roja del email cuando faltan las matrículas (usuario, 2026-11-19): el mismo mensaje
// que la orden en PDF.
const CAJA_SIN_MATRICULAS = `<div style="background:#fde8e8;border:1px solid #dc2626;border-left:5px solid #dc2626;border-radius:8px;padding:12px 14px;margin:12px 0;color:#8c1414">
<p style="margin:0 0 6px"><strong>DIRECCIONES OCULTAS HASTA RECIBIR LAS MATRÍCULAS</strong></p>
<p style="margin:0 0 6px"><strong>El envío está CONFIRMADO.</strong> Envíanos las <strong>matrículas</strong> (tractora y semirremolque) y te mandamos <strong>al momento</strong> la orden de carga con las direcciones de carga y descarga.</p>
<p style="margin:0"><strong>Sin matrículas no se carga:</strong> las comunicamos a los almacenes antes de que llegue el camión.</p>
</div>`;

// ---- Cargas de vuelta al final de la orden (usuario, 2026-11-19) -----------------------
// Envíos libres de la bolsa que salen de la provincia de la última descarga el mismo día
// (envios_de_vuelta) y, después, desde el origen 2 días hábiles más tarde. El HTML, en
// lib/cargasDeVuelta.ts. Vacío si no hay ninguna.
export async function bloqueCargasDeVuelta(sb: SB, envio: string, origen: string): Promise<string> {
  try {
    // Dos bloques: desde donde descarga el día de la descarga y, al final, desde el origen
    // 2 días hábiles después de la carga (usuario, 2026-11-19).
    const [d, r] = await Promise.all([
      sb.rpc('envios_de_vuelta', { p_envio: envio, p_max: 15, p_tramo: 'descarga' }),
      sb.rpc('envios_de_vuelta', { p_envio: envio, p_max: 15, p_tramo: 'regreso' }),
    ]);
    return (d.error ? '' : htmlCargasDeVuelta(d.data as unknown as DatosVuelta | null, origen))
      + (r.error ? '' : htmlCargasDeVuelta(r.data as unknown as DatosVuelta | null, origen));
  } catch { return ''; }
}

// ---- 1. Orden de carga al asignar transportista -------------------------------------
// Sin matrículas, la orden va con las direcciones OCULTAS (solo código postal), la caja roja
// y SIN el enlace del eCMR (también enseña las direcciones). Cuando llegan las matrículas,
// avisoOrdenCompleta le manda la orden entera (una vez).
export async function avisoOrdenCarga(sb: SB, usuarioId: string, envio: string, completaYa?: boolean): Promise<void> {
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
    const completa = completaYa ?? await matriculasCompletas(sb, envio);
    // UNA sola orden (usuario, 2026-11-14): el documento completo; su enlace lleva la clave.
    const enlEc = token ? `${origen}/cmr/${token}/orden?copia=economica&clave=${e.transportista_id}` : null;
    const enlFirma = token && completa ? `${origen}/cmr/${token}` : null;
    // Sin matrículas: el botón a la página sencilla para darlas (usuario, 2026-11-19).
    const enlMatr = token && !completa ? `${origen}/matriculas/${token}?clave=${e.transportista_id}` : null;
    let adjuntos: AdjuntoEmail[] | undefined;
    const pdf = await pdfDeEnvioDynamo(sb, envio, 'orden-de-carga', usuarioId, origen);
    if (!('error' in pdf)) adjuntos = [{ nombre: pdf.nombre, base64: Buffer.from(pdf.bytes).toString('base64'), tipo: 'application/pdf' }];
    const fecha = e.fecha_carga_prevista ?? e.fecha_carga_desde ?? null;
    const vuelta = await bloqueCargasDeVuelta(sb, envio, origen);
    const html = completa ? `<p>Hola,</p>
<p>${completaYa ? `Ya tenemos las matrículas del envío <strong>#${esc(e.referencia_gx)}</strong>` : `Os hemos asignado el envío <strong>#${esc(e.referencia_gx)}</strong>`}${fecha ? ` (carga el <strong>${esc(fechaTxt(fecha))}</strong>)` : ''}. Va adjunta la <strong>ORDEN DE CARGA en PDF</strong> (documento completo) con todos los datos${completaYa ? ', las direcciones' : ''} y las condiciones.</p>
${enlFirma ? `<p>Firma en este enlace tu e-CMR DIGITAL EN RUTA (para móvil u ordenador, 100 % seguro, digital y legal. Protocolo eIDAS): <a href="${enlFirma}">${enlFirma}</a></p>` : ''}
${enlEc ? `<p>También podéis abrir o descargar la orden aquí: <a href="${enlEc}">${enlEc}</a></p>` : ''}
<p>Si cambian las matrículas o el conductor, avisadnos ANTES de la carga. Urgencias e incidencias 24 h: ${CONTACTO.telefono}.</p>
${vuelta}
${pie}` : `<p>Hola,</p>
<p>Os hemos asignado el envío <strong>#${esc(e.referencia_gx)}</strong>${fecha ? ` (carga el <strong>${esc(fechaTxt(fecha))}</strong>)` : ''}. Va adjunta la <strong>ORDEN DE CARGA en PDF</strong>, de momento <strong>sin las direcciones</strong>.</p>
${CAJA_SIN_MATRICULAS}
${enlMatr ? `<p style="margin:16px 0"><a href="${enlMatr}" style="display:inline-block;background:#dc2626;color:#ffffff;font-weight:700;text-decoration:none;padding:12px 22px;border-radius:10px">Proporcionar matrículas del envío</a></p>
<p style="font-size:13px;color:#555">Si el botón no se abre, copia esta dirección en el navegador: <a href="${enlMatr}">${enlMatr}</a></p>` : ''}
${enlEc ? `<p>Esta orden (sin direcciones) también está aquí: <a href="${enlEc}">${enlEc}</a></p>` : ''}
<p>Urgencias e incidencias 24 h: ${CONTACTO.telefono}.</p>
${vuelta}
${pie}`;
    // Sin matrículas, su propia clave: cuando lleguen, sale la orden completa (orden_carga:…).
    await enviarEmailOperativo({ clave: completa ? `orden_carga:${envio}:${e.transportista_id}` : `orden_carga_oculta:${envio}:${e.transportista_id}`, tipo: 'orden_carga', envioId: envio,
      para, asunto: completa ? `${completaYa ? 'Orden de carga con direcciones' : 'Orden de carga'} · envío #${e.referencia_gx} · Dynamo` : `Envío #${e.referencia_gx} confirmado · faltan las matrículas · Dynamo`, html, adjuntos });
    if (completaYa) return;   // la orden completa al llegar las matrículas: el cliente ya tuvo su confirmación

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
<p>Tu envío ya tiene <strong>transportista asignado</strong>${conMatriculas ? ' y las <strong>matrículas</strong> del camión' : ''}${fecha ? `, y carga el <strong>${esc(fechaTxt(fecha))}</strong>` : ''}. Va adjunta tu copia de la <strong>orden de carga en PDF</strong>.</p>
${conMatriculas ? '' : '<p>Las matrículas aún no están puestas: te avisaremos en cuanto las tengamos.</p>'}
${datos?.detalle ?? ''}
<p>Lo sigues en vivo en <a href="${origen}/panel/envios?ver=${envio}">la ficha del envío</a>. Si hay cualquier cambio, te avisamos.</p>
${pie}`;
      await enviarEmailOperativo({ clave: `orden_carga_cliente:${envio}:${e.transportista_id}`, tipo: 'orden_carga', envioId: envio,
        para: paraCli, asunto: `Transporte confirmado · envío #${e.referencia_gx}${org && dst ? ` (${org} → ${dst})` : ''}`, html: htmlCli, adjuntos: adjCli });
    }
  } catch { /* el aviso nunca rompe la asignación */ }
}

// ---- 1-ter. La orden COMPLETA al llegar las matrículas (usuario, 2026-11-19) ----------
// Si al asignar se le mandó la orden sin direcciones y ahora el envío ya tiene todas las
// matrículas, sale la orden entera (con el enlace del eCMR), una sola vez. Lo llama el
// archivo del DeCA al emitirse su primera versión (que es cuando llegan las matrículas).
export async function avisoOrdenCompleta(sb: SB, envio: string): Promise<void> {
  try {
    const { data: e } = await sb.from('envios').select('transportista_id, creado_por').eq('id', envio).maybeSingle();
    if (!e?.transportista_id || !(await matriculasCompletas(sb, envio))) return;
    const { data: ya } = await sb.from('emails_enviados').select('clave')
      .in('clave', [`orden_carga_oculta:${envio}:${e.transportista_id}`, `orden_carga:${envio}:${e.transportista_id}`]);
    const claves = new Set((ya ?? []).map((x) => x.clave));
    if (!claves.has(`orden_carga_oculta:${envio}:${e.transportista_id}`) || claves.has(`orden_carga:${envio}:${e.transportista_id}`)) return;
    const { data: yo } = await sb.auth.getUser();
    await avisoOrdenCarga(sb, yo.user?.id ?? e.creado_por ?? '', envio, true);
  } catch { /* nunca rompe nada */ }
}

// Lo mismo desde una página PÚBLICA (sin sesión): con la clave de servicio, que es la única
// que puede leer el registro de emails y generar la orden (sin ella la web no manda ningún
// email: tarea #94). Si ya salió, no se repite.
export async function avisoOrdenCompletaAhora(envio: string): Promise<void> {
  const sbs = supabaseServicio();
  if (sbs) await avisoOrdenCompleta(sbs, envio);
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
      // El TRANSPORTISTA firma con el email de su EMPRESA (fijo en la pantalla de firma,
      // usuario 2026-11-16): a ese email no va copia en cada firma, solo la final, al
      // terminar el transporte. Si puso otro (su empresa no tenía email), sí va.
      let copiaAhora = !!ff?.email;
      if (ff?.email && ultima.rol === 'transportista') {
        const { data: evT } = await sbs.from('envios').select('transportista_id').eq('id', envioId).maybeSingle();
        const emp = evT?.transportista_id ? await emailTransportista(sbs, evT.transportista_id) : null;
        if (emp && emp.trim().toLowerCase() === ff.email.trim().toLowerCase()) copiaAhora = false;
      }
      if (ff?.email && copiaAhora) {
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

    // (b) TODAS las firmas → el eCMR en PDF a Dynamo, al cliente (creador, usuarios y contactos
    // con avisos) y al transportista.
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
        // El CLIENTE del envío: sus usuarios y sus contactos de Logística que reciben los
        // avisos (como el resto de emails del envío) y, por ser el albarán, también los de
        // Contabilidad (usuario, 2026-11-17: «Recibe los avisos» conectado por rol).
        const { data: dc } = await sbs.rpc('datos_email_cliente_envio', { p_envio: envioId });
        const { data: conta } = await sbs.rpc('emails_contabilidad_envio', { p_envio: envioId });
        [((dc ?? null) as { para?: string | null } | null)?.para, conta as string | null]
          .forEach((lista) => (lista ?? '').split(',').map((x) => x.trim()).filter(Boolean).forEach((x) => destinos.add(x)));
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
