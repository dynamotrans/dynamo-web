import { sesion, esDynamo } from '@/lib/sesion';
import AvisoCuenta from '@/components/panel/AvisoCuenta';
import Almacenamientos, { type AlmacenamientoFila, type AlmacenOpcion } from '@/components/panel/Almacenamientos';

export const dynamic = 'force-dynamic';

// Almacenamientos (solo Dynamo en la etapa A): diseño de #sec-almacenes de dashboard.html.
export default async function PaginaAlmacenamientos() {
  const s = await sesion();
  if (!s) return null;
  const { supabase, perfil } = s;
  if (!perfil || perfil.estado !== 'activa') return <AvisoCuenta perfil={perfil} />;
  if (!esDynamo(perfil.rol)) {
    return <section className="section active"><div className="pt-aviso error" style={{ maxWidth: 640 }}><div>Esta sección todavía es solo del equipo de Dynamo.</div></div></section>;
  }
  const [alm, almacenes, clientes, ps] = await Promise.all([
    supabase.from('almacenamientos').select('*, clientes(nombre_visible), almacen:lugares!almacenamientos_almacen_id_fkey(nombre_empresa, direccion, codigo_postal, poblacion, provincia), ' +
      'entrega:lugares!almacenamientos_lugar_entrega_id_fkey(nombre_empresa, direccion, codigo_postal, poblacion)')
      .order('fecha_entrada', { ascending: false }).limit(5000),
    supabase.from('lugares').select('id, nombre_empresa, direccion, codigo_postal, poblacion, provincia, disponible, precio_almacenamiento_semana, precio_reparto')
      .eq('es_almacen_dynamo', true).eq('borrado', false).order('provincia'),
    supabase.from('clientes').select('id, nombre_visible, riesgo_efectivo_euros').order('nombre_visible').limit(10000),
    supabase.from('parametros').select('clave, valor').in('clave', ['almacen_precio_semana', 'almacen_precio_reparto']),
  ]);
  const p = new Map((ps.data ?? []).map((x: any) => [x.clave, Number(x.valor)]));
  const def = { semana: p.get('almacen_precio_semana') ?? 240, reparto: p.get('almacen_precio_reparto') ?? 220 };
  const dir = (l: any) => l ? [l.direccion, [l.codigo_postal, l.poblacion].filter(Boolean).join(' ')].filter(Boolean).join(', ') : '';
  const filas: AlmacenamientoFila[] = (alm.data ?? []).map((a: any) => ({
    id: a.id, codigo: a.codigo, cliente_id: a.cliente_id, cliente: a.clientes?.nombre_visible ?? null,
    almacen_id: a.almacen_id, almacen: a.almacen?.nombre_empresa ?? 'Almacén Dynamo', almacen_provincia: a.almacen?.provincia ?? a.almacen?.poblacion ?? '',
    almacen_dir: dir(a.almacen), fecha_entrada: a.fecha_entrada, fecha_salida: a.fecha_salida, num_trailers: a.num_trailers,
    num_repartos: a.num_repartos, lugar_entrega_id: a.lugar_entrega_id, entrega: a.entrega ? `${a.entrega.nombre_empresa ?? ''} · ${dir(a.entrega)}` : null,
    descripcion: a.descripcion, referencia_cliente: a.referencia_cliente, anotaciones: a.anotaciones,
    importe_almacenaje: a.importe_almacenaje != null ? Number(a.importe_almacenaje) : null, importe_reparto: a.importe_reparto != null ? Number(a.importe_reparto) : null,
    importe_total: Number(a.importe_total ?? 0), iva_aplicado: a.iva_aplicado != null ? Number(a.iva_aplicado) : 21,
    pago_adelantado: a.pago_adelantado, estado: a.estado, creado_en: a.creado_en, modificado_en: a.modificado_en,
  }));
  const opciones: AlmacenOpcion[] = (almacenes.data ?? []).map((l: any) => ({
    id: l.id, nombre: l.nombre_empresa ?? 'Almacén Dynamo', provincia: l.provincia ?? l.poblacion ?? '', dir: dir(l), disponible: l.disponible !== false,
    semana: l.precio_almacenamiento_semana != null ? Number(l.precio_almacenamiento_semana) : def.semana,
    reparto: l.precio_reparto != null ? Number(l.precio_reparto) : def.reparto,
  }));
  return <Almacenamientos filas={filas} almacenes={opciones} clientes={(clientes.data ?? []) as any} error={alm.error?.message ?? null} />;
}
