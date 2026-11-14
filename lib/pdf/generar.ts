import type { SB } from '@/lib/supabase/cliente';
import { cargarDatosDoc, cargarDatosCmrPorToken, cargarFirmasCmr, cargarLogoOperador, datosDynamo, cargarDatosDocManual } from './datos';
import { PDFDocument } from 'pdf-lib';
import { ordenDeCarga, ordenCompuesta } from './orden';
import type { DatosDoc } from './datos';
import { cmr } from './cmr';

// El PDF del eCMR empieza por la ORDEN DE CARGA SIN datos económicos (usuario,
// 2026-11-11: hace el papel de la hoja DeCA, que ya no se pinta aparte) — en el idioma
// del transportista y luego en español — y siguen el impreso del CMR y la hoja de
// firmas. Sin porteador no hay orden que poner (como antes no había hoja DeCA).
async function cmrConOrden(d: DatosDoc): Promise<Uint8Array> {
  const cuerpo = await cmr(d, { sinDeca: true });
  if (!d.porteador) return cuerpo;
  // La copia operativa no lleva ninguna sección económica: los parámetros de pago no se usan.
  const orden = await ordenCompuesta(d, { pct: 0, minimo: 0, dias: 0, plazo: 0 }, 'operativa');
  const doc = await PDFDocument.create();
  for (const b of [orden, cuerpo]) {
    const src = await PDFDocument.load(b);
    (await doc.copyPages(src, src.getPageIndices())).forEach((p) => doc.addPage(p));
  }
  doc.setTitle(`CMR ${d.envio.referencia_gx ?? ''}`);
  return doc.save();
}

// La orden de carga (o de transporte, si es manual) y el CMR de un envío, como los ve
// Dynamo. La usan el visor (/panel/envios/<id>/<documento>) y «Guardar copia» de la ficha.
export async function pdfDeEnvioDynamo(sb: SB, id: string, documento: 'orden-de-carga' | 'cmr', usuarioId: string, origen?: string):
  Promise<{ bytes: Uint8Array; nombre: string; manual: boolean } | { error: string }> {
  const { datos, error } = await cargarDatosDoc(sb, id, usuarioId);
  if (!datos) return { error: error ?? 'No se ha podido leer el envío.' };
  let bytes: Uint8Array;
  datos.dynamo = await datosDynamo(sb);
  if (documento === 'cmr') {
    const { data: rs } = await sb.from('cmr_reservas').select('rol, texto, parada_id, creado_en').eq('envio_id', id).order('creado_en');
    // El enlace vivo del CMR digital hace de nº único del DeCA: va en el PDF como QR con
    // su fecha de creación (Orden FOM/2861/2012, art. 6).
    const { data: enl } = await sb.from('cmr_enlaces').select('token, creado_en').eq('envio_id', id).eq('revocado', false)
      .order('creado_en', { ascending: false }).limit(1).maybeSingle();
    bytes = await cmrConOrden({ ...datos, firmas: await cargarFirmasCmr(sb, id), reservas: (rs ?? []) as { rol: string; texto: string; parada_id: string | null; creado_en: string }[],
      deca: enl ? { url: `${origen ?? 'https://www.dynamotrans.com'}/cmr/${enl.token}`, creado_en: enl.creado_en } : null });
  }
  else {
    const { data: ps } = await sb.from('parametros').select('clave, valor')
      .in('clave', ['pronto_pago_pct', 'pronto_pago_minimo', 'pronto_pago_dias', 'plazo_pago_transportista_dias']);
    const p = new Map((ps ?? []).map((x) => [x.clave, Number(x.valor)]));
    if (datos.manual) datos.logoPorteador = await cargarLogoOperador(sb, datos.envio.operador_id);
    bytes = await ordenDeCarga(datos, { pct: p.get('pronto_pago_pct') ?? 3, minimo: p.get('pronto_pago_minimo') ?? 20,
      dias: p.get('pronto_pago_dias') ?? 5, plazo: p.get('plazo_pago_transportista_dias') ?? 60 });
  }
  const ref = String(datos.envio.referencia_gx ?? 'envio').replace(/[^A-Za-z0-9-]/g, '');
  const nombre = documento === 'cmr' ? `CMR-${ref}.pdf` : `${datos.manual ? 'Orden-de-transporte' : 'Orden-de-carga'}-${ref}.pdf`;
  return { bytes, nombre, manual: datos.manual };
}

// Las copias de la orden en PDF para ADJUNTARLAS a un email desde la plataforma
// (usuario, 2026-11-13: «mailto no puede autoadjuntar; que lo mande la plataforma»).
export async function pdfsOrdenDynamo(sb: SB, id: string, usuarioId: string, copias: ('operativa' | 'economica' | 'cliente')[], origen?: string):
  Promise<{ pdfs: { bytes: Uint8Array; nombre: string }[] } | { error: string }> {
  const { datos, error } = await cargarDatosDoc(sb, id, usuarioId);
  if (!datos) return { error: error ?? 'No se ha podido leer el envío.' };
  if (datos.manual) return { error: 'Los envíos manuales no llevan orden de carga de Dynamo.' };
  datos.dynamo = await datosDynamo(sb);
  const { data: enl } = await sb.from('cmr_enlaces').select('token, creado_en').eq('envio_id', id).eq('revocado', false)
    .order('creado_en', { ascending: false }).limit(1).maybeSingle();
  if (enl) datos.deca = { url: `${origen ?? 'https://www.dynamotrans.com'}/cmr/${enl.token}`, creado_en: enl.creado_en };
  const { data: ps } = await sb.from('parametros').select('clave, valor')
    .in('clave', ['pronto_pago_pct', 'pronto_pago_minimo', 'pronto_pago_dias', 'plazo_pago_transportista_dias']);
  const p = new Map((ps ?? []).map((x) => [x.clave, Number(x.valor)]));
  const pago = { pct: p.get('pronto_pago_pct') ?? 3, minimo: p.get('pronto_pago_minimo') ?? 20,
    dias: p.get('pronto_pago_dias') ?? 5, plazo: p.get('plazo_pago_transportista_dias') ?? 60 };
  const ref = String(datos.envio.referencia_gx ?? 'envio').replace(/[^A-Za-z0-9-]/g, '');
  const pdfs: { bytes: Uint8Array; nombre: string }[] = [];
  for (const c of copias) {
    pdfs.push({ bytes: await ordenDeCarga(datos, pago, { copia: c }), nombre: `Orden-${ref}-${c === 'operativa' ? 'conductor' : c === 'cliente' ? 'cliente' : 'administracion'}.pdf` });
  }
  return { pdfs };
}

// (La orden COMPUESTA del enlace público /cmr/<token>/orden vive en su ruta, con la
// clave pública y datos_orden_por_cmr — 2026-11-11: antes iba con la clave de servicio.)

// El CMR relleno por su ENLACE público (/cmr/<token>/pdf): la verificación en línea que
// promete el QR del documento. Con la clave pública y datos_cmr_por_token (2026-11-11:
// antes iba con la clave de servicio y en la preview moría).
// CMR para IMPRIMIR de un envío MANUAL, para su propio cliente (usuario, 2026-11-14):
// sin QR, sin hoja de firmas digitales, sin DeCA y sin nada de Dynamo — se firma a mano.
export async function pdfCmrManualCliente(sb: SB, id: string): Promise<{ bytes: Uint8Array; nombre: string } | { error: string }> {
  const r = await cargarDatosDocManual(sb, id);
  if (!r.datos) return { error: r.error ?? 'No se ha podido leer el envío.' };
  const bytes = await cmrConOrden({ ...r.datos, firmas: [], deca: null });
  const ref = String(r.datos.envio.referencia_gx ?? 'envio').replace(/[^A-Za-z0-9-]/g, '');
  return { bytes, nombre: `CMR-${ref}.pdf` };
}

export async function pdfCmrPorToken(sb: SB, token: string, origen: string):
  Promise<{ bytes: Uint8Array; nombre: string } | { error: string }> {
  const r = await cargarDatosCmrPorToken(sb, token);
  if (!r.datos) return { error: r.error ?? 'Este enlace no es válido: ha caducado o se ha retirado.' };
  const bytes = await cmrConOrden({ ...r.datos,
    deca: r.decaCreado ? { url: `${origen}/cmr/${token}`, creado_en: r.decaCreado } : null });
  const ref = String(r.datos.envio.referencia_gx ?? 'envio').replace(/[^A-Za-z0-9-]/g, '');
  return { bytes, nombre: `CMR-${ref}.pdf` };
}
