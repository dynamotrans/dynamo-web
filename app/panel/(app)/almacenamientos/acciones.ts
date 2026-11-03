'use server';

import { sesion, esDynamo } from '@/lib/sesion';
import { supabaseServidor } from '@/lib/supabase/server';
import { precioAlmacenamiento } from '@/lib/almacenamiento';

export type AlmacenamientoDatos = {
  cliente_id: string; almacen_id: string; fecha_entrada: string; fecha_salida: string;
  num_trailers: number; num_repartos: number; lugar_entrega_id: string | null;
  descripcion: string; referencia_cliente: string; anotaciones: string;
};
export type EstadoAlm = 'pendiente_confirmar' | 'confirmado' | 'en_almacen' | 'finalizado' | 'cancelado';
type Res = { ok: true; id: string; codigo?: string } | { ok: false; error: string };

function traducir(msg: string): string {
  if (/COMPLETO/i.test(msg)) return 'Este almacén está COMPLETO y no admite entradas. Elige otro o márcalo como disponible en Almacenes Dynamo.';
  if (/almacen de Dynamo/i.test(msg)) return 'Hay que elegir un almacén de Dynamo.';
  if (/direccion de entrega/i.test(msg)) return 'La dirección de entrega tiene que ser un sitio de ese cliente.';
  if (/ck_alm_fechas/i.test(msg)) return 'La fecha de salida no puede ser anterior a la de entrada.';
  if (/ck_alm_reparto/i.test(msg)) return 'Con reparto urbano hay que elegir la dirección de entrega.';
  if (/num_trailers/i.test(msg)) return 'Entre 1 y 10 tráileres.';
  if (/permission denied|42501|row-level security/i.test(msg)) return 'No tienes permiso para hacer esto.';
  return msg;
}
async function dynamo() {
  const s = await sesion();
  if (!s?.perfil || s.perfil.estado !== 'activa' || !esDynamo(s.perfil.rol)) return null;
  return s.supabase;
}

// El precio lo calcula SIEMPRE el servidor con las tarifas del almacén (o las de
// `parametros`) y queda congelado en el registro: la tarifa de mañana no cambia lo de hoy.
export async function guardarAlmacenamiento(id: string | null, d: AlmacenamientoDatos, recalcular: boolean): Promise<Res> {
  const sb = await dynamo();
  if (!sb) return { ok: false, error: 'Esta sección todavía es solo del equipo de Dynamo.' };
  if (!d.cliente_id) return { ok: false, error: 'Elige el cliente.' };
  if (!d.almacen_id) return { ok: false, error: 'Elige el almacén Dynamo.' };
  if (!d.fecha_entrada || !d.fecha_salida) return { ok: false, error: 'Pon la fecha de entrada y la de salida.' };
  if (d.fecha_salida < d.fecha_entrada) return { ok: false, error: 'La fecha de salida no puede ser anterior a la de entrada.' };
  if (d.num_repartos > 0 && !d.lugar_entrega_id) return { ok: false, error: 'Con reparto urbano hay que elegir la dirección de entrega.' };

  const fila: Record<string, unknown> = {
    cliente_id: d.cliente_id, almacen_id: d.almacen_id, fecha_entrada: d.fecha_entrada, fecha_salida: d.fecha_salida,
    num_trailers: d.num_trailers, num_repartos: d.num_repartos, lugar_entrega_id: d.num_repartos > 0 ? d.lugar_entrega_id : null,
    descripcion: d.descripcion.trim() || null, referencia_cliente: d.referencia_cliente.trim() || null, anotaciones: d.anotaciones.trim() || null,
  };
  if (!id || recalcular) {
    const [{ data: alm }, { data: ps }, { data: cli }] = await Promise.all([
      sb.from('lugares').select('precio_almacenamiento_semana, precio_reparto').eq('id', d.almacen_id).maybeSingle(),
      sb.from('parametros').select('clave, valor').in('clave', ['almacen_precio_semana', 'almacen_precio_reparto']),
      sb.from('clientes').select('riesgo_efectivo_euros, iva_porcentaje').eq('id', d.cliente_id).maybeSingle(),
    ]);
    const p = new Map((ps ?? []).map((x: any) => [x.clave, Number(x.valor)]));
    const precio = precioAlmacenamiento(d, {
      semana: alm?.precio_almacenamiento_semana != null ? Number(alm.precio_almacenamiento_semana) : p.get('almacen_precio_semana') ?? 240,
      reparto: alm?.precio_reparto != null ? Number(alm.precio_reparto) : p.get('almacen_precio_reparto') ?? 220,
    });
    fila.importe_almacenaje = precio.almacenaje;
    fila.importe_reparto = precio.reparto;
    fila.iva_aplicado = cli?.iva_porcentaje ?? 21;
    // Sin crédito (CESCE o de Dynamo), se paga por adelantado con proforma.
    fila.pago_adelantado = !(Number(cli?.riesgo_efectivo_euros) > 0);
  }
  const q = id ? sb.from('almacenamientos').update(fila).eq('id', id).select('id, codigo').single()
               : sb.from('almacenamientos').insert(fila).select('id, codigo').single();
  const { data, error } = await q;
  if (error) return { ok: false, error: traducir(error.message) };
  return { ok: true, id: data.id, codigo: data.codigo };
}

export async function cambiarEstadoAlmacenamiento(id: string, estado: EstadoAlm): Promise<Res> {
  const sb = await dynamo();
  if (!sb) return { ok: false, error: 'Esta sección todavía es solo del equipo de Dynamo.' };
  const { error } = await sb.from('almacenamientos').update({ estado }).eq('id', id);
  if (error) return { ok: false, error: traducir(error.message) };
  return { ok: true, id };
}

// Pago por adelantado: Dynamo marca cuándo validó el pago (o lo deshace si se equivocó).
export async function marcarPagadoAlmacenamiento(id: string, pagado: boolean): Promise<Res> {
  const sb = await dynamo();
  if (!sb) return { ok: false, error: 'Esta sección todavía es solo del equipo de Dynamo.' };
  const { error } = await sb.from('almacenamientos').update({ pagado_en: pagado ? new Date().toISOString() : null }).eq('id', id);
  if (error) return { ok: false, error: traducir(error.message) };
  return { ok: true, id };
}

// Sitios de un cliente, para la dirección del reparto urbano.
// (Carga de fondo: sin sesión devuelve lista vacía en vez de redirigir a la entrada.)
export async function sitiosDelCliente(clienteId: string): Promise<{ id: string; nombre: string; linea: string }[]> {
  const sb = await supabaseServidor();
  if (!sb || !clienteId) return [];
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return [];
  const { data } = await sb.from('lugares').select('id, nombre_empresa, direccion, codigo_postal, poblacion')
    .eq('cliente_id', clienteId).eq('borrado', false).order('nombre_empresa').limit(5000);
  return (data ?? []).map((l: any) => ({ id: l.id, nombre: l.nombre_empresa ?? 'Sitio', linea: [l.direccion, [l.codigo_postal, l.poblacion].filter(Boolean).join(' ')].filter(Boolean).join(', ') }));
}
