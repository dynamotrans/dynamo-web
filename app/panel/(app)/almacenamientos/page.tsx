import { leerTodo } from '@/lib/leerTodo';
import { sesion, esDynamo, sinAcceso } from '@/lib/sesion';
import { vistaDe, filtrarVista } from '@/lib/vista';
import AvisoCuenta from '@/components/panel/AvisoCuenta';
import Almacenamientos, { type AlmacenamientoFila, type AlmacenOpcion } from '@/components/panel/Almacenamientos';
import { notasInternas } from '@/lib/notasInternas';

type Direccion = { direccion: string | null; codigo_postal: string | null; poblacion: string | null };

export const dynamic = 'force-dynamic';

// Almacenamientos (solo Dynamo en la etapa A): diseño de #sec-almacenes de dashboard.html.
export default async function PaginaAlmacenamientos({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const s = await sesion();
  if (!s) return null;
  const { supabase, perfil } = s;
  if (sinAcceso(perfil)) return <AvisoCuenta perfil={perfil} />;
  const sp = await searchParams;
  // Módulo v3 (usuario, 2026-11-14): los almacenamientos quedan SOLO para el equipo de
  // Dynamo — a clientes y transportistas se les oculta entero (tampoco por URL).
  if (!esDynamo(perfil.rol)) {
    return <section className="section active"><div className="pt-aviso info" style={{ maxWidth: 640 }}><div>Esta sección aún no está disponible. Si necesitas almacenaje, escríbenos y te lo gestionamos.</div></div></section>;
  }
  const vista = await vistaDe(supabase, perfil.rol);
  const notas = await notasInternas(supabase, 'almacenamientos');
  const [alm, almacenes, clientes, ps] = await Promise.all([
    leerTodo(filtrarVista(supabase.from('almacenamientos').select('*, clientes(nombre_visible), almacen:sitios!almacenamientos_almacen_id_fkey(nombre_empresa, direccion, codigo_postal, poblacion, provincia), ' +
      'entrega:sitios!almacenamientos_sitio_entrega_id_fkey(nombre_empresa, direccion, codigo_postal, poblacion)'), vista, { transportista: null })
      .order('fecha_entrada', { ascending: false }), 5000),
    supabase.from('sitios').select('id, nombre_empresa, direccion, codigo_postal, poblacion, provincia, disponible, precio_almacenamiento_semana, precio_reparto')
      .eq('es_almacen_dynamo', true).eq('borrado', false).order('provincia'),
    leerTodo(filtrarVista(supabase.from('clientes').select('id, nombre_visible, riesgo_efectivo_euros'), vista, { cliente: 'id', transportista: null }).order('nombre_visible'), 10000),
    supabase.from('parametros').select('clave, valor').in('clave', ['almacen_precio_semana', 'almacen_precio_reparto']),
  ]);
  const p = new Map((ps.data ?? []).map((x) => [x.clave, Number(x.valor)]));
  const def = { semana: p.get('almacen_precio_semana') ?? 240, reparto: p.get('almacen_precio_reparto') ?? 220 };
  const dir = (l: Direccion | null | undefined) => l ? [l.direccion, [l.codigo_postal, l.poblacion].filter(Boolean).join(' ')].filter(Boolean).join(', ') : '';
  const filas: AlmacenamientoFila[] = (alm.data ?? []).map((a) => ({
    id: a.id, codigo: a.codigo, cliente_id: a.cliente_id, cliente: a.clientes?.nombre_visible ?? null,
    almacen_id: a.almacen_id, almacen: a.almacen?.nombre_empresa ?? 'Almacén Dynamo', almacen_provincia: a.almacen?.provincia ?? a.almacen?.poblacion ?? '',
    almacen_dir: dir(a.almacen), fecha_entrada: a.fecha_entrada, fecha_salida: a.fecha_salida, num_trailers: a.num_trailers,
    num_repartos: a.num_repartos, sitio_entrega_id: a.sitio_entrega_id, entrega: a.entrega ? `${a.entrega.nombre_empresa ?? ''} · ${dir(a.entrega)}` : null,
    descripcion: a.descripcion, referencia_cliente: a.referencia_cliente, anotaciones: notas.get(a.id)?.anotaciones ?? '',
    importe_almacenaje: a.importe_almacenaje != null ? Number(a.importe_almacenaje) : null, importe_reparto: a.importe_reparto != null ? Number(a.importe_reparto) : null,
    importe_total: Number(a.importe_total ?? 0), iva_pct: a.iva_pct != null ? Number(a.iva_pct) : 21,
    requiere_pago_previo: a.requiere_pago_previo, pagado_en: a.pagado_en ?? null, estado: a.estado, creado_en: a.creado_en, modificado_en: a.modificado_en,
  }));
  const opciones: AlmacenOpcion[] = (almacenes.data ?? []).map((l) => ({
    id: l.id, nombre: l.nombre_empresa ?? 'Almacén Dynamo', provincia: l.provincia ?? l.poblacion ?? '', dir: dir(l), disponible: l.disponible !== false,
    semana: l.precio_almacenamiento_semana != null ? Number(l.precio_almacenamiento_semana) : def.semana,
    reparto: l.precio_reparto != null ? Number(l.precio_reparto) : def.reparto,
  }));
  const abrir = !!sp.abrir;
  return <Almacenamientos abrir={abrir} pestanaInicial={sp.tab === 'pago' ? 'pago' : undefined} filas={filas} almacenes={opciones} clientes={clientes.data ?? []} error={alm.error?.message ?? null} />;
}


