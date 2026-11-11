import type { SB } from '@/lib/supabase/cliente';
import { cargarDatosDoc, cargarFirmasCmr, cargarLogoOperador, datosDynamo } from './datos';
import { ordenDeCarga, ordenCompuesta, type QueOrden } from './orden';
import { cmr } from './cmr';

// La orden de carga (o de transporte, si es manual) y el CMR de un envío, como los ve
// Dynamo. La usan el visor (/panel/envios/<id>/<documento>) y «Guardar copia» de la ficha.
export async function pdfDeEnvioDynamo(sb: SB, id: string, documento: 'orden-de-carga' | 'cmr', usuarioId: string, origen?: string):
  Promise<{ bytes: Uint8Array; nombre: string; manual: boolean } | { error: string }> {
  const { datos, error } = await cargarDatosDoc(sb, id, usuarioId);
  if (!datos) return { error: error ?? 'No se ha podido leer el envío.' };
  let bytes: Uint8Array;
  datos.dynamo = await datosDynamo(sb);
  if (documento === 'cmr') {
    const { data: rs } = await sb.from('cmr_reservas').select('rol, texto').eq('envio_id', id).order('creado_en');
    // El enlace vivo del CMR digital hace de nº único del DeCA: va en el PDF como QR con
    // su fecha de creación (Orden FOM/2861/2012, art. 6).
    const { data: enl } = await sb.from('cmr_enlaces').select('token, creado_en').eq('envio_id', id).eq('revocado', false)
      .order('creado_en', { ascending: false }).limit(1).maybeSingle();
    bytes = await cmr({ ...datos, firmas: await cargarFirmasCmr(sb, id), reservas: (rs ?? []) as { rol: string; texto: string }[],
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

// La orden COMPUESTA para compartir con el transportista (enlace público /cmr/<token>/orden):
// la variante pedida, en su idioma y en español. El gestor va nulo a propósito (enlace
// compartido, no una sesión del panel): la orden dice «Operador de tráfico: Dynamo».
export async function pdfOrdenCompuesta(sb: SB, id: string, que: QueOrden):
  Promise<{ bytes: Uint8Array; nombre: string } | { error: string }> {
  const { datos, error } = await cargarDatosDoc(sb, id, '00000000-0000-0000-0000-000000000000');
  if (!datos) return { error: error ?? 'No se ha podido leer el envío.' };
  if (datos.manual) return { error: 'Los envíos manuales no tienen orden de Dynamo.' };
  datos.dynamo = await datosDynamo(sb);
  const { data: ps } = await sb.from('parametros').select('clave, valor')
    .in('clave', ['pronto_pago_pct', 'pronto_pago_minimo', 'pronto_pago_dias', 'plazo_pago_transportista_dias']);
  const p = new Map((ps ?? []).map((x) => [x.clave, Number(x.valor)]));
  const bytes = await ordenCompuesta(datos, { pct: p.get('pronto_pago_pct') ?? 3, minimo: p.get('pronto_pago_minimo') ?? 20,
    dias: p.get('pronto_pago_dias') ?? 5, plazo: p.get('plazo_pago_transportista_dias') ?? 60 }, que);
  const ref = String(datos.envio.referencia_gx ?? 'envio').replace(/[^A-Za-z0-9-]/g, '');
  const apellido = que === 'operativa' ? '-conductor' : que === 'economica' ? '-administracion' : '';
  return { bytes, nombre: `Orden-de-carga-${ref}${apellido}.pdf` };
}
