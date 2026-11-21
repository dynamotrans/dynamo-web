import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { esDynamo } from '@/lib/sesion';
import { datosDynamo, nombrePais } from '@/lib/pdf/datos';
import { proforma } from '@/lib/pdf/proforma';
import type { Tabla } from '@/lib/supabase/tipos';

// Proforma ORIENTATIVA de la calculadora de Nuevo envío (usuario, 2026-11-11): el precio
// calculado, en PDF, ANTES de crear el envío. NO crea nada, NO reserva nada, va SIN
// numerar y SIN datos de pago (no es pagadera ni vinculante): es solo un papel para ver
// precios. La usan la descarga (/panel/nuevo-envio/proforma) y el envío por email con el
// PDF adjunto (usuario, 2026-11-16).
type ClienteProforma = Pick<Tabla<'clientes'>, 'razon_social' | 'cif' | 'direccion' | 'codigo_postal' | 'poblacion' | 'pais_codigo_iso'> & { iva_pct?: number | null };
// Una proforma con UN envío (ruta + detalle + base) o, desde «Crear varios envíos», con
// VARIOS: cada uno su concepto (máximo 20).
export type PeticionProforma = { base: number; ruta: string[]; det: string[]; cliente: string | null;
  varios?: { titulo: string; lineas: string[]; base: number }[] };

export const lineasProforma = (s: string, maxLargo: number, maxLineas: number) =>
  s.slice(0, maxLargo).split('\n').map((x) => x.trim()).filter(Boolean).slice(0, maxLineas);

export async function pdfProformaCalculo(sb: SupabaseClient, rol: string, p: PeticionProforma):
  Promise<{ bytes: Uint8Array; iva: number } | { error: string; status: number }> {
  if (p.varios) {
    if (!p.varios.length || p.varios.length > 20) return { error: 'La proforma lleva de 1 a 20 envíos.', status: 400 };
    if (p.varios.some((v) => !Number.isFinite(v.base) || v.base <= 0 || v.base > 100000)) return { error: 'Falta el importe de algún envío.', status: 400 };
  } else if (!Number.isFinite(p.base) || p.base <= 0 || p.base > 100000) return { error: 'Falta el importe del cálculo.', status: 400 };
  // El cliente siempre es ÉL MISMO; Dynamo pasa el cliente elegido en el asistente, o
  // ninguno: se puede calcular (y mandar) un precio a quien llama a preguntar, sin alta.
  let c: ClienteProforma | null = null;
  if (esDynamo(rol)) {
    if (p.cliente) {
      if (!/^[0-9a-f-]{36}$/i.test(p.cliente)) return { error: 'Ese cliente no existe.', status: 404 };
      c = (await sb.from('clientes').select('razon_social, cif, direccion, codigo_postal, poblacion, pais_codigo_iso, iva_pct').eq('id', p.cliente).maybeSingle<ClienteProforma>()).data;
      if (!c) return { error: 'Ese cliente no existe.', status: 404 };
    } else {
      c = { razon_social: 'Cliente por determinar', cif: '—', direccion: null, codigo_postal: null, poblacion: null, pais_codigo_iso: 'ES', iva_pct: 21 };
    }
  } else {
    c = (await sb.rpc('mi_empresa').maybeSingle()).data as ClienteProforma | null;
    if (!c) return { error: 'Ese cliente no existe.', status: 404 };
  }
  const { data: reg } = await sb.rpc('reglas_precio_envio');
  const cerrado = Number((reg as { cerrado_dias_habiles?: number } | null)?.cerrado_dias_habiles ?? 12);
  const iva = Number(c.iva_pct ?? 21);
  const bytes = await proforma({
    codigo: 'CALCULO', referencia_cliente: null, creado_en: new Date().toISOString(),
    cliente: { razon_social: c.razon_social ?? '—', cif: c.cif ?? '—', direccion: c.direccion ?? null,
      codigo_postal: c.codigo_postal ?? null, poblacion: c.poblacion ?? null, pais: nombrePais(c.pais_codigo_iso) },
    conceptos: p.varios
      ? p.varios.map((v) => ({ titulo: v.titulo.slice(0, 90), lineas: v.lineas.slice(0, 6).map((x) => x.slice(0, 120)), importe: Math.round(v.base * 100) / 100 }))
      : [{ titulo: 'Transporte', lineas: [...p.ruta, ...p.det], importe: p.base }],
    iva,
    sinPago: { aviso: 'Documento SIN NUMERAR y NO VINCULANTE: no crea ningún envío ni reserva, es solo el precio calculado hoy, para que lo veas. '
      + 'Por eso no lleva datos de pago. La proforma pagadera, con los datos de la transferencia, sale al crear el envío '
      + 'y quedar pendiente de pago, con el precio ya fijado.' },
    condiciones: `Precio válido al crear y confirmar el envío ahora. Las tarifas son dinámicas: el precio se fija al `
      + `confirmar el envío a ${cerrado} días hábiles o menos de la carga. Con más antelación, el precio se actualizará al llegar a `
      + `${cerrado} días hábiles de la primera parada, con el precio válido para el día de carga.`,
    dynamo: await datosDynamo(sb),
  });
  return { bytes, iva };
}
