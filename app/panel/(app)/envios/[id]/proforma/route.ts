import { supabaseServidor } from '@/lib/supabase/server';
import { esDynamo } from '@/lib/sesion';
import { datosDynamo, nombrePais } from '@/lib/pdf/datos';
import { proforma } from '@/lib/pdf/proforma';
import { fecha, pesoTn } from '@/lib/formato';

// /panel/envios/<id>/proforma: la factura proforma del PREVIO PAGO de un envío. Se ABRE
// en el visor (regla 0-bis). Dynamo, cualquiera; el cliente, solo las suyas (pagos_envio()
// solo le devuelve las de su empresa). Solo existe si el envío lleva pago previo.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

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

  const { data: p } = await sb.rpc('pagos_envio', { p_envio: id }).maybeSingle<any>();
  if (!p) return texto('Ese envío no lleva pago previo (o no es tuyo).', 404);

  // Datos del envío y del cliente: Dynamo los lee de las tablas; el cliente, de sus funciones.
  let e: any = null, c: any = null;
  if (esDynamo(yo.rol)) {
    const r = await sb.from('envios').select('referencia_gx, referencia_cliente, creado_en, fecha_carga_desde, fecha_carga_hasta, poblacion_origen, poblacion_destino, ' +
      'metros_lineales, toneladas, descripcion_mercancia, clientes(razon_social, cif, direccion, codigo_postal, poblacion, pais_codigo_iso)').eq('id', id).maybeSingle<any>();
    e = r.data; c = r.data?.clientes ?? null;
  } else {
    e = (await sb.rpc('mis_envios').eq('id', id).maybeSingle<any>()).data;
    c = (await sb.rpc('mi_empresa').maybeSingle<any>()).data;
  }
  if (!e) return texto('Ese envío no existe.', 404);
  const ruta = [e.poblacion_origen, e.poblacion_destino].filter(Boolean).join(' → ');
  const cuando = e.fecha_carga_desde ? (e.fecha_carga_hasta && e.fecha_carga_hasta !== e.fecha_carga_desde ? `carga ${fecha(e.fecha_carga_desde)} – ${fecha(e.fecha_carga_hasta)}` : `carga ${fecha(e.fecha_carga_desde)}`) : '';
  const medidas = [e.metros_lineales != null ? `${Number(e.metros_lineales).toLocaleString('es-ES')} m` : '', e.toneladas != null ? pesoTn(e.toneladas) : ''].filter(Boolean).join(' · ');

  const bytes = await proforma({
    codigo: p.referencia_gx, referencia_cliente: p.referencia_cliente, creado_en: e.creado_en ?? new Date().toISOString(),
    cliente: { razon_social: c?.razon_social ?? '—', cif: c?.cif ?? '—', direccion: c?.direccion ?? null, codigo_postal: c?.codigo_postal ?? null, poblacion: c?.poblacion ?? null, pais: nombrePais(c?.pais_codigo_iso) },
    conceptos: [{ titulo: `Transporte ${p.referencia_gx}${ruta ? ` · ${ruta}` : ''}`, sub: [cuando, medidas, e.descripcion_mercancia].filter(Boolean).join(' · '), importe: Number(p.base) }],
    iva: Number(p.iva),
    condiciones: 'El envío no se asigna a ningún transportista hasta validar el pago (por transferencia, la validación puede tardar hasta 24 h; con tarjeta, al momento). Si la fecha de carga ya no se puede cumplir cuando llegue el pago, te propondremos otra.',
    dynamo: await datosDynamo(sb),
  });
  return new Response(Buffer.from(bytes), { headers: { 'content-type': 'application/pdf',
    'content-disposition': `inline; filename="Proforma-${p.referencia_gx}.pdf"`, 'cache-control': 'private, no-store' } });
}
