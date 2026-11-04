import type { SupabaseClient } from '@supabase/supabase-js';
import { cargarDatosDoc, cargarFirmasCmr, cargarLogoOperador, datosDynamo } from './datos';
import { ordenDeCarga } from './orden';
import { cmr } from './cmr';

// La orden de carga (o de transporte, si es manual) y el CMR de un envío, como los ve
// Dynamo. La usan el visor (/panel/envios/<id>/<documento>) y «Guardar copia» de la ficha.
export async function pdfDeEnvioDynamo(sb: SupabaseClient, id: string, documento: 'orden-de-carga' | 'cmr', usuarioId: string):
  Promise<{ bytes: Uint8Array; nombre: string; manual: boolean } | { error: string }> {
  const { datos, error } = await cargarDatosDoc(sb, id, usuarioId);
  if (!datos) return { error: error ?? 'No se ha podido leer el envío.' };
  let bytes: Uint8Array;
  datos.dynamo = await datosDynamo(sb);
  if (documento === 'cmr') {
    const { data: rs } = await sb.from('cmr_reservas').select('rol, texto').eq('envio_id', id).order('creado_en');
    bytes = await cmr({ ...datos, firmas: await cargarFirmasCmr(sb, id), reservas: (rs ?? []) as { rol: string; texto: string }[] });
  }
  else {
    const { data: ps } = await sb.from('parametros').select('clave, valor')
      .in('clave', ['pronto_pago_pct', 'pronto_pago_minimo', 'pronto_pago_dias', 'plazo_pago_transportista_dias']);
    const p = new Map((ps ?? []).map((x: any) => [x.clave, Number(x.valor)]));
    if (datos.manual) datos.logoPorteador = await cargarLogoOperador(sb, datos.envio.operador_id);
    bytes = await ordenDeCarga(datos, { pct: p.get('pronto_pago_pct') ?? 3, minimo: p.get('pronto_pago_minimo') ?? 20,
      dias: p.get('pronto_pago_dias') ?? 5, plazo: p.get('plazo_pago_transportista_dias') ?? 60 });
  }
  const ref = String(datos.envio.referencia_gx ?? 'envio').replace(/[^A-Za-z0-9-]/g, '');
  const nombre = documento === 'cmr' ? `CMR-${ref}.pdf` : `${datos.manual ? 'Orden-de-transporte' : 'Orden-de-carga'}-${ref}.pdf`;
  return { bytes, nombre, manual: datos.manual };
}
