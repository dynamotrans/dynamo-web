import { supabaseServidor } from '@/lib/supabase/server';
import { esDynamo } from '@/lib/sesion';
import { datosDynamo, nombrePais } from '@/lib/pdf/datos';
import { proforma } from '@/lib/pdf/proforma';
import type { Tabla } from '@/lib/supabase/tipos';

type ClienteProforma = Pick<Tabla<'clientes'>, 'razon_social' | 'cif' | 'direccion' | 'codigo_postal' | 'poblacion' | 'pais_codigo_iso'>;
type FilaProforma = Tabla<'almacenamientos'> & { clientes: ClienteProforma | null;
  almacen: Pick<Tabla<'sitios'>, 'nombre_empresa' | 'poblacion' | 'provincia'> | null;
  entrega: Pick<Tabla<'sitios'>, 'nombre_empresa' | 'direccion' | 'codigo_postal' | 'poblacion'> | null };

// /panel/almacenamientos/<id>/proforma: la factura proforma (pago por adelantado). Se
// ABRE en el visor (regla 0-bis). Dynamo y el cliente dueño (desde Administración → Proformas).
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const texto = (msg: string, status: number) => new Response(msg, { status, headers: { 'content-type': 'text/plain; charset=utf-8' } });

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return texto('Ese almacenamiento no existe.', 404);
  const sb = await supabaseServidor();
  if (!sb) return texto('La plataforma no está conectada.', 503);
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return Response.redirect(new URL('/panel/entrar', req.url), 302);
  const { data: yo } = await sb.from('usuarios').select('rol, estado').eq('id', user.id).maybeSingle<{ rol: string; estado: string }>();
  // Dynamo, cualquiera; el cliente, solo las suyas (la seguridad por filas no le devuelve las de otro).
  if (!yo || yo.estado !== 'activa' || !(esDynamo(yo.rol) || yo.rol === 'cliente')) return texto('No tienes permiso para ver este documento.', 403);

  const { data: a } = await sb.from('almacenamientos').select('*, clientes(razon_social, cif, direccion, codigo_postal, poblacion, pais_codigo_iso), ' +
    'almacen:sitios!almacenamientos_almacen_id_fkey(nombre_empresa, poblacion, provincia), entrega:sitios!almacenamientos_sitio_entrega_id_fkey(nombre_empresa, direccion, codigo_postal, poblacion)')
    .eq('id', id).maybeSingle<FilaProforma>();
  if (!a) return texto('Ese almacenamiento no existe.', 404);
  const c = a.clientes ?? ({} as ClienteProforma);
  const bytes = await proforma({
    codigo: a.codigo, referencia_cliente: a.referencia_cliente, creado_en: a.creado_en,
    cliente: { razon_social: c.razon_social ?? '—', cif: c.cif ?? '—', direccion: c.direccion, codigo_postal: c.codigo_postal, poblacion: c.poblacion, pais: nombrePais(c.pais_codigo_iso) },
    almacen: [a.almacen?.poblacion, a.almacen?.provincia && a.almacen.provincia !== a.almacen.poblacion ? a.almacen.provincia : null].filter(Boolean).join(', ') || 'Almacén Dynamo',
    fecha_entrada: a.fecha_entrada, fecha_salida: a.fecha_salida, num_trailers: a.num_trailers, descripcion: a.descripcion,
    num_repartos: a.num_repartos,
    entrega: a.entrega ? [a.entrega.nombre_empresa, a.entrega.direccion, [a.entrega.codigo_postal, a.entrega.poblacion].filter(Boolean).join(' ')].filter(Boolean).join(', ') : null,
    importe_almacenaje: Number(a.importe_almacenaje ?? 0), importe_reparto: Number(a.importe_reparto ?? 0), iva: Number(a.iva_pct ?? 21),
    dynamo: await datosDynamo(sb),
  });
  return new Response(Buffer.from(bytes), { headers: { 'content-type': 'application/pdf',
    'content-disposition': `inline; filename="Proforma-${a.codigo}.pdf"`, 'cache-control': 'private, no-store' } });
}
