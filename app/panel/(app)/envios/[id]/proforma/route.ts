import { supabaseServidor } from '@/lib/supabase/server';
import { esDynamo } from '@/lib/sesion';
import { datosDynamo, nombrePais } from '@/lib/pdf/datos';
import { proforma } from '@/lib/pdf/proforma';
import { ventana, medidasTxt, euros, fechaHora } from '@/lib/formato';
import type { Tabla } from '@/lib/supabase/tipos';

// /panel/envios/<id>/proforma: la factura proforma del PREVIO PAGO de un envío. Se ABRE
// en el visor (regla 0-bis). Dynamo, cualquiera; el cliente, solo las suyas (pagos_envio()
// solo le devuelve las de su empresa). Solo existe si el envío lleva pago previo.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type EnvioProforma = Pick<Tabla<'envios'>, 'creado_en' | 'fecha_carga_desde' | 'fecha_carga_hasta' | 'poblacion_origen' | 'poblacion_destino'
  | 'metros_lineales' | 'toneladas' | 'descripcion_mercancia'>;
type ClienteProforma = Pick<Tabla<'clientes'>, 'razon_social' | 'cif' | 'direccion' | 'codigo_postal' | 'poblacion' | 'pais_codigo_iso'>;
const texto = (msg: string, status: number) => new Response(msg, { status, headers: { 'content-type': 'text/plain; charset=utf-8' } });

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return texto('Ese envío no existe.', 404);
  const sb = await supabaseServidor();
  if (!sb) return texto('La plataforma no está conectada.', 503);
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return Response.redirect(new URL('/panel/entrar', req.url), 302);
  const { data: yo } = await sb.from('usuarios').select('rol, estado').eq('id', user.id).maybeSingle<{ rol: string; estado: string }>();
  if (!yo || yo.estado !== 'activa' || !(esDynamo(yo.rol) || yo.rol === 'cliente')) return texto('No tienes permiso para ver este documento.', 403);

  const { data: p } = await sb.rpc('pagos_envio', { p_envio: id }).maybeSingle();
  if (!p) return texto('Ese envío no lleva pago previo (o no es tuyo).', 404);

  // Datos del envío y del cliente: Dynamo los lee de las tablas; el cliente, de sus funciones.
  let e: EnvioProforma | null = null, c: ClienteProforma | null = null;
  if (esDynamo(yo.rol)) {
    const r = await sb.from('envios').select('referencia_gx, referencia_cliente, creado_en, fecha_carga_desde, fecha_carga_hasta, poblacion_origen, poblacion_destino, ' +
      'metros_lineales, toneladas, descripcion_mercancia, clientes(razon_social, cif, direccion, codigo_postal, poblacion, pais_codigo_iso)').eq('id', id).maybeSingle<EnvioProforma & { clientes: ClienteProforma | null }>();
    e = r.data; c = r.data?.clientes ?? null;
  } else {
    e = (await sb.rpc('mis_envios').eq('id', id).maybeSingle()).data;
    c = (await sb.rpc('mi_empresa').maybeSingle()).data;
  }
  if (!e) return texto('Ese envío no existe.', 404);
  const ruta = [e.poblacion_origen, e.poblacion_destino].filter(Boolean).join(' → ');
  const cuando = e.fecha_carga_desde ? `carga ${ventana(e.fecha_carga_desde, e.fecha_carga_hasta)}` : '';
  const medidas = medidasTxt(e.metros_lineales, e.toneladas);

  // Con el precio todavía PROVISIONAL la proforma va SIN datos de pago (usuario, 2026-11-11):
  // las tarifas son dinámicas y el precio se revisa N días hábiles antes de la primera
  // parada, así que todavía no es pagadera. Desde ese día (o si no hay fecha que mirar),
  // sale completa con la transferencia. La cuenta la hace la base de datos (un solo
  // parámetro, en días hábiles; usuario, 2026-11-16).
  const { data: reg } = await sb.rpc('reglas_precio_envio');
  const cerrado = Number((reg as { cerrado_dias_habiles?: number } | null)?.cerrado_dias_habiles ?? 12);
  const { data: cierre } = e.fecha_carga_desde ? await sb.rpc('precio_dia_cierre', { p_carga: e.fecha_carga_desde }) : { data: null };
  const lejos = !!cierre;

  // Ya pagó y el precio subió al modificar el envío: lo pagado va a cuenta y solo falta la diferencia.
  const aCuenta = Number(p.a_cuenta ?? 0);
  const bytes = await proforma({
    codigo: p.referencia_gx, referencia_cliente: p.referencia_cliente, creado_en: e.creado_en ?? new Date().toISOString(),
    cliente: { razon_social: c?.razon_social ?? '—', cif: c?.cif ?? '—', direccion: c?.direccion ?? null, codigo_postal: c?.codigo_postal ?? null, poblacion: c?.poblacion ?? null, pais: nombrePais(c?.pais_codigo_iso) },
    conceptos: [{ titulo: `Transporte ${p.referencia_gx}${ruta ? ` · ${ruta}` : ''}`, sub: [cuando, medidas, e.descripcion_mercancia].filter(Boolean).join(' · '), importe: Number(p.base) }],
    iva: Number(p.iva),
    sinPago: lejos ? { aviso: `El precio de este envío todavía NO está fijado: las tarifas son dinámicas y se revisará al llegar a ${cerrado} `
      + `días hábiles de la primera parada, con el precio válido para el día de carga. Por eso esta proforma no lleva datos de pago: la proforma `
      + `pagadera, con la transferencia, saldrá aquí mismo cuando queden ${cerrado} días hábiles o menos.` } : null,
    condiciones: (aCuenta > 0 && Number(p.pendiente) > 0
      ? `YA PAGADO A CUENTA: ${euros(aCuenta)}. PENDIENTE DE PAGO: ${euros(Number(p.pendiente))} (IVA incluido), la diferencia por la modificación del envío. `
      : '') + (lejos
      ? `Precio pendiente de fijar: se actualizará al llegar a ${cerrado} días hábiles de la carga. El envío no se asigna a ningún transportista hasta validar el pago.`
      : 'El envío no se asigna a ningún transportista hasta validar el pago: con tarjeta, al momento; por transferencia (mejor inmediata), al comprobarla en el banco. Si la fecha de carga ya no se puede cumplir cuando llegue el pago, te propondremos otra.')
      // Hasta cuándo vale esta proforma (usuario, 2026-11-19): pasado el plazo se anula con su envío.
      + (p.estado_pago_previo === 'pendiente' && p.pago_limite
        ? ` PLAZO PARA PAGAR: hasta el ${fechaHora(p.pago_limite)}. Si pagas por transferencia, avísanos dentro del plazo con el botón «Ya he hecho la transferencia» de la ficha del envío: el plazo se para mientras la validamos. Pasado el plazo sin pago ni aviso, el envío y esta proforma quedan anulados y habrá que crear un envío nuevo.`
        : p.estado_pago_previo === 'pendiente' && p.pago_avisado_en
          ? ` TRANSFERENCIA AVISADA el ${fechaHora(p.pago_avisado_en)}: pendiente de validar por Dynamo.`
          : ''),
    dynamo: await datosDynamo(sb),
  });
  return new Response(Buffer.from(bytes), { headers: { 'content-type': 'application/pdf',
    'content-disposition': `inline; filename="Proforma-${p.referencia_gx}.pdf"`, 'cache-control': 'private, no-store' } });
}
