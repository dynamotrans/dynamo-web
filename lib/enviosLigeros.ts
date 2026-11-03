import type { SupabaseClient } from '@supabase/supabase-js';

// Lista corta de envíos para elegir uno en Incidencias y Penalizaciones (buscador
// «Envío referenciado» del mockup) y para enseñar su resumen. Solo Dynamo.
export type EnvioLigero = {
  id: string; referencia_gx: string; referencia_cliente: string | null; estado: string; es_manual: boolean;
  cliente_id: string; cliente: string | null; transportista_id: string | null; transportista: string | null;
  fecha_carga_desde: string | null; fecha_carga_hasta: string | null; fecha_carga_real: string | null; fecha_entrega_estimada: string | null;
  origen: string; destino: string; descripcion_mercancia: string | null; metros_lineales: number | null; toneladas: number | null;
  matricula_camion: string | null; matricula_remolque: string | null; conductor_nombre: string | null;
  importe_cliente: number | null; importe_transportista: number | null;
};

// Los más recientes primero. (Con muchos miles habrá que buscar en el servidor: en TODO.)
export async function cargarEnviosLigeros(sb: SupabaseClient, limite = 3000): Promise<EnvioLigero[]> {
  const { data } = await sb.from('envios').select(
    'id, referencia_gx, referencia_cliente, estado, es_manual, cliente_id, transportista_id, fecha_carga_desde, fecha_carga_hasta, ' +
    'fecha_carga_real, fecha_entrega_estimada, codigo_postal_origen, poblacion_origen, codigo_postal_destino, poblacion_destino, ' +
    'descripcion_mercancia, metros_lineales, toneladas, matricula_camion, matricula_remolque, conductor_nombre, importe_cliente, ' +
    'importe_transportista, clientes(nombre_visible), transportistas(nombre_visible)')
    .neq('estado', 'borrador').order('creado_en', { ascending: false }).limit(limite);
  return (data ?? []).map((e: any) => ({
    id: e.id, referencia_gx: e.referencia_gx, referencia_cliente: e.referencia_cliente, estado: e.estado, es_manual: e.es_manual,
    cliente_id: e.cliente_id, cliente: e.clientes?.nombre_visible ?? null,
    transportista_id: e.transportista_id, transportista: e.transportistas?.nombre_visible ?? null,
    fecha_carga_desde: e.fecha_carga_desde, fecha_carga_hasta: e.fecha_carga_hasta, fecha_carga_real: e.fecha_carga_real,
    fecha_entrega_estimada: e.fecha_entrega_estimada,
    origen: [e.codigo_postal_origen, e.poblacion_origen].filter(Boolean).join(' '),
    destino: [e.codigo_postal_destino, e.poblacion_destino].filter(Boolean).join(' '),
    descripcion_mercancia: e.descripcion_mercancia, metros_lineales: e.metros_lineales, toneladas: e.toneladas,
    matricula_camion: e.matricula_camion, matricula_remolque: e.matricula_remolque, conductor_nombre: e.conductor_nombre,
    importe_cliente: e.importe_cliente, importe_transportista: e.importe_transportista,
  }));
}
