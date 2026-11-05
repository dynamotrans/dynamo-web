import { leerTodo } from '@/lib/leerTodo';
import { sesion, esDynamo } from '@/lib/sesion';
import { vistaDe, filtrarVista } from '@/lib/vista';
import AvisoCuenta from '@/components/panel/AvisoCuenta';
import Almacenamientos, { type AlmacenamientoFila, type AlmacenOpcion } from '@/components/panel/Almacenamientos';
import { notasInternas } from '@/lib/notasInternas';

export const dynamic = 'force-dynamic';

// Almacenamientos (solo Dynamo en la etapa A): diseño de #sec-almacenes de dashboard.html.
export default async function PaginaAlmacenamientos({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const s = await sesion();
  if (!s) return null;
  const { supabase, perfil } = s;
  if (!perfil || perfil.estado !== 'activa') return <AvisoCuenta perfil={perfil} />;
  const sp = await searchParams;
  if (perfil.rol === 'cliente') return <AlmacenamientosCliente abrir={!!sp.abrir} tab={sp.tab} />;
  if (!esDynamo(perfil.rol)) {
    return <section className="section active"><div className="pt-aviso error" style={{ maxWidth: 640 }}><div>Esta sección es de los clientes y del equipo de Dynamo.</div></div></section>;
  }
  const vista = await vistaDe(supabase, perfil.rol);
  const notas = await notasInternas(supabase, 'almacenamientos');
  const [alm, almacenes, clientes, ps] = await Promise.all([
    leerTodo(filtrarVista(supabase.from('almacenamientos').select('*, clientes(nombre_visible), almacen:sitios!almacenamientos_almacen_id_fkey(nombre_empresa, direccion, codigo_postal, poblacion, provincia), ' +
      'entrega:sitios!almacenamientos_sitio_entrega_id_fkey(nombre_empresa, direccion, codigo_postal, poblacion)'), vista, { transportista: null })
      .order('fecha_entrada', { ascending: false }), 5000),
    supabase.from('sitios').select('id, nombre_empresa, direccion, codigo_postal, poblacion, provincia, disponible, precio_almacenamiento_semana, precio_reparto')
      .eq('es_almacen_dynamo', true).eq('borrado', false).order('provincia'),
    leerTodo(supabase.from('clientes').select('id, nombre_visible, riesgo_efectivo_euros').order('nombre_visible'), 10000),
    supabase.from('parametros').select('clave, valor').in('clave', ['almacen_precio_semana', 'almacen_precio_reparto']),
  ]);
  const p = new Map((ps.data ?? []).map((x: any) => [x.clave, Number(x.valor)]));
  const def = { semana: p.get('almacen_precio_semana') ?? 240, reparto: p.get('almacen_precio_reparto') ?? 220 };
  const dir = (l: any) => l ? [l.direccion, [l.codigo_postal, l.poblacion].filter(Boolean).join(' ')].filter(Boolean).join(', ') : '';
  const filas: AlmacenamientoFila[] = (alm.data ?? []).map((a: any) => ({
    id: a.id, codigo: a.codigo, cliente_id: a.cliente_id, cliente: a.clientes?.nombre_visible ?? null,
    almacen_id: a.almacen_id, almacen: a.almacen?.nombre_empresa ?? 'Almacén Dynamo', almacen_provincia: a.almacen?.provincia ?? a.almacen?.poblacion ?? '',
    almacen_dir: dir(a.almacen), fecha_entrada: a.fecha_entrada, fecha_salida: a.fecha_salida, num_trailers: a.num_trailers,
    num_repartos: a.num_repartos, sitio_entrega_id: a.sitio_entrega_id, entrega: a.entrega ? `${a.entrega.nombre_empresa ?? ''} · ${dir(a.entrega)}` : null,
    descripcion: a.descripcion, referencia_cliente: a.referencia_cliente, anotaciones: notas.get(a.id)?.anotaciones ?? '',
    importe_almacenaje: a.importe_almacenaje != null ? Number(a.importe_almacenaje) : null, importe_reparto: a.importe_reparto != null ? Number(a.importe_reparto) : null,
    importe_total: Number(a.importe_total ?? 0), iva_pct: a.iva_pct != null ? Number(a.iva_pct) : 21,
    requiere_pago_previo: a.requiere_pago_previo, pagado_en: a.pagado_en ?? null, estado: a.estado, creado_en: a.creado_en, modificado_en: a.modificado_en,
  }));
  const opciones: AlmacenOpcion[] = (almacenes.data ?? []).map((l: any) => ({
    id: l.id, nombre: l.nombre_empresa ?? 'Almacén Dynamo', provincia: l.provincia ?? l.poblacion ?? '', dir: dir(l), disponible: l.disponible !== false,
    semana: l.precio_almacenamiento_semana != null ? Number(l.precio_almacenamiento_semana) : def.semana,
    reparto: l.precio_reparto != null ? Number(l.precio_reparto) : def.reparto,
  }));
  const abrir = !!sp.abrir;
  return <Almacenamientos abrir={abrir} pestanaInicial={sp.tab === 'pago' ? 'pago' : undefined} filas={filas} almacenes={opciones} clientes={(clientes.data ?? []) as any} error={alm.error?.message ?? null} />;
}

const dirDe = (l: any) => l ? [l.direccion, [l.codigo_postal, l.poblacion].filter(Boolean).join(' ')].filter(Boolean).join(', ') : '';

// El CLIENTE: sus almacenamientos (la seguridad por filas solo le da los suyos) y pedir uno.
// Sin datos internos: ni notas de Dynamo ni el riesgo de crédito.
async function AlmacenamientosCliente({ abrir, tab }: { abrir: boolean; tab?: string }) {
  const s = await sesion();
  if (!s?.perfil) return null;
  const { supabase } = s;
  const [alm, almacenes, cob, sit] = await Promise.all([
    leerTodo(supabase.from('almacenamientos').select('id, codigo, cliente_id, almacen_id, fecha_entrada, fecha_salida, num_trailers, num_repartos, sitio_entrega_id, descripcion, referencia_cliente, importe_almacenaje, importe_reparto, importe_total, iva_pct, requiere_pago_previo, pagado_en, estado, creado_en, modificado_en, ' +
      'almacen:sitios!almacenamientos_almacen_id_fkey(nombre_empresa, direccion, codigo_postal, poblacion, provincia), entrega:sitios!almacenamientos_sitio_entrega_id_fkey(nombre_empresa, direccion, codigo_postal, poblacion)')
      .order('fecha_entrada', { ascending: false }), 2000),
    supabase.rpc('almacenes_dynamo_tarifa'),
    supabase.rpc('mi_cobertura_credito'),
    // Sus sitios (la seguridad por filas le da los suyos y los almacenes de Dynamo).
    leerTodo(supabase.from('sitios').select('id, nombre_empresa, direccion, codigo_postal, poblacion').eq('es_almacen_dynamo', false).eq('borrado', false).order('nombre_empresa'), 5000),
  ]);
  const sitios = (sit.data ?? []).map((l: any) => ({ id: l.id, nombre: l.nombre_empresa ?? 'Sitio', linea: dirDe(l) }));
  const filas: AlmacenamientoFila[] = (alm.data ?? []).map((a: any) => ({
    id: a.id, codigo: a.codigo, cliente_id: a.cliente_id, cliente: null,
    almacen_id: a.almacen_id, almacen: a.almacen?.nombre_empresa ?? 'Almacén Dynamo', almacen_provincia: a.almacen?.provincia ?? a.almacen?.poblacion ?? '',
    almacen_dir: dirDe(a.almacen), fecha_entrada: a.fecha_entrada, fecha_salida: a.fecha_salida, num_trailers: a.num_trailers,
    num_repartos: a.num_repartos, sitio_entrega_id: a.sitio_entrega_id, entrega: a.entrega ? `${a.entrega.nombre_empresa ?? ''} · ${dirDe(a.entrega)}` : null,
    descripcion: a.descripcion ?? '', referencia_cliente: a.referencia_cliente ?? '', anotaciones: '',
    importe_almacenaje: a.importe_almacenaje != null ? Number(a.importe_almacenaje) : null, importe_reparto: a.importe_reparto != null ? Number(a.importe_reparto) : null,
    importe_total: Number(a.importe_total ?? 0), iva_pct: a.iva_pct != null ? Number(a.iva_pct) : 21,
    requiere_pago_previo: a.requiere_pago_previo, pagado_en: a.pagado_en ?? null, estado: a.estado, creado_en: a.creado_en, modificado_en: a.modificado_en,
  }));
  const opciones: AlmacenOpcion[] = ((almacenes.data ?? []) as any[]).map((l) => ({
    id: l.id, nombre: l.nombre ?? 'Almacén Dynamo', provincia: l.provincia ?? l.poblacion ?? '', dir: dirDe(l), disponible: l.disponible !== false,
    semana: Number(l.semana ?? 240), reparto: Number(l.reparto ?? 220),
  }));
  // Con crédito (CESCE o de Dynamo) no hay pago por adelantado.
  const conCredito = cob.data === 'disponible';
  return <Almacenamientos abrir={abrir} pestanaInicial={tab === 'pago' ? 'pago' : undefined} filas={filas} almacenes={opciones} clientes={[]}
    error={alm.error?.message ?? null} modoCliente={{ sitios, conCredito }} />;
}
