import type { SB } from '@/lib/supabase/cliente';
import type { Funcion, Tabla } from '@/lib/supabase/tipos';

// Lista corta de envíos para elegir uno en Incidencias y Penalizaciones (buscador
// «Envío referenciado» del mockup) y para enseñar su resumen.
export type EnvioLigero = {
  id: string; referencia_gx: string; referencia_cliente: string | null; estado: string; es_manual: boolean;
  cliente_id: string; cliente: string | null; transportista_id: string | null; transportista: string | null;
  fecha_carga_desde: string | null; fecha_carga_hasta: string | null; fecha_carga_real: string | null; fecha_entrega_estimada: string | null;
  origen: string; destino: string; descripcion_mercancia: string | null; metros_lineales: number | null; toneladas: number | null;
  matricula_camion: string | null; matricula_remolque: string | null; conductor_nombre: string | null;
  importe_cliente: number | null; importe_transportista: number | null;
};

const COLUMNAS = 'id, referencia_gx, referencia_cliente, estado, es_manual, cliente_id, transportista_id, fecha_carga_desde, fecha_carga_hasta, ' +
  'fecha_carga_real, fecha_entrega_estimada, codigo_postal_origen, poblacion_origen, codigo_postal_destino, poblacion_destino, ' +
  'descripcion_mercancia, metros_lineales, toneladas, matricula_camion, matricula_remolque, conductor_nombre, importe_cliente, ' +
  'importe_transportista, clientes(nombre_visible), transportistas(nombre_visible)';

type FilaLigera = Pick<Tabla<'envios'>, 'id' | 'referencia_gx' | 'referencia_cliente' | 'estado' | 'es_manual' | 'cliente_id' | 'transportista_id'
  | 'fecha_carga_desde' | 'fecha_carga_hasta' | 'fecha_carga_real' | 'fecha_entrega_estimada' | 'codigo_postal_origen' | 'poblacion_origen'
  | 'codigo_postal_destino' | 'poblacion_destino' | 'descripcion_mercancia' | 'metros_lineales' | 'toneladas' | 'matricula_camion'
  | 'matricula_remolque' | 'conductor_nombre' | 'importe_cliente' | 'importe_transportista'>
  & { clientes: { nombre_visible: string | null } | null; transportistas: { nombre_visible: string | null } | null };

function aLigero(e: FilaLigera): EnvioLigero {
  return {
    id: e.id, referencia_gx: e.referencia_gx, referencia_cliente: e.referencia_cliente, estado: e.estado, es_manual: e.es_manual as boolean,
    cliente_id: e.cliente_id, cliente: e.clientes?.nombre_visible ?? null,
    transportista_id: e.transportista_id, transportista: e.transportistas?.nombre_visible ?? null,
    fecha_carga_desde: e.fecha_carga_desde, fecha_carga_hasta: e.fecha_carga_hasta, fecha_carga_real: e.fecha_carga_real,
    fecha_entrega_estimada: e.fecha_entrega_estimada,
    origen: [e.codigo_postal_origen, e.poblacion_origen].filter(Boolean).join(' '),
    destino: [e.codigo_postal_destino, e.poblacion_destino].filter(Boolean).join(' '),
    descripcion_mercancia: e.descripcion_mercancia, metros_lineales: e.metros_lineales, toneladas: e.toneladas,
    matricula_camion: e.matricula_camion, matricula_remolque: e.matricula_remolque, conductor_nombre: e.conductor_nombre,
    importe_cliente: e.importe_cliente, importe_transportista: e.importe_transportista,
  };
}

// Los más recientes primero: los que salen con el buscador vacío. El resto se busca en
// la base de datos al escribir (buscarEnviosLigeros), así da igual que haya miles.
export async function cargarEnviosLigeros(sb: SB, limite = 40, de?: { cliente?: string | null; transportista?: string | null }): Promise<EnvioLigero[]> {
  let q = sb.from('envios').select(COLUMNAS).neq('estado', 'borrador');
  // Con «Ver como» una empresa, solo sus envíos (a un cliente o transportista real ya se lo acota la base de datos).
  if (de?.cliente) q = q.eq('cliente_id', de.cliente);
  if (de?.transportista) q = q.eq('transportista_id', de.transportista);
  const { data } = await q.order('creado_en', { ascending: false }).limit(limite)
    .overrideTypes<FilaLigera[], { merge: false }>();
  return (data ?? []).map(aLigero);
}

// Unos envíos concretos, en el orden pedido (resultado de buscar_envios, o el ya elegido).
export async function enviosLigerosPorId(sb: SB, ids: string[]): Promise<EnvioLigero[]> {
  if (!ids.length) return [];
  const { data } = await sb.from('envios').select(COLUMNAS).in('id', ids).overrideTypes<FilaLigera[], { merge: false }>();
  const porId = new Map((data ?? []).map((e) => [e.id, aLigero(e)]));
  return ids.map((id) => porId.get(id)).filter((e): e is EnvioLigero => !!e);
}

// Lo mismo para el CLIENTE o el TRANSPORTISTA, desde sus funciones (mis_envios_por_ids /
// mis_viajes_por_ids): solo lo suyo y sin datos de la otra parte.
// Columnas comunes de mis_envios_por_ids y mis_viajes_por_ids, más las que solo trae una de las dos.
type MiEnvio = Funcion<'mis_envios_por_ids'>[number];
type MiViaje = Funcion<'mis_viajes_por_ids'>[number];
type FilaMia = Pick<MiViaje, keyof MiViaje & keyof MiEnvio> & Partial<Pick<MiEnvio, 'referencia_cliente' | 'es_manual' | 'importe_cliente'>>
  & Partial<Pick<MiViaje, 'importe_transportista'>>;
export function ligeroDeMio(e: FilaMia, esT: boolean): EnvioLigero {
  return {
    id: e.id, referencia_gx: e.referencia_gx, referencia_cliente: e.referencia_cliente ?? null, estado: e.estado, es_manual: !!e.es_manual,
    cliente_id: '', cliente: null, transportista_id: null, transportista: null,
    fecha_carga_desde: e.fecha_carga_desde, fecha_carga_hasta: e.fecha_carga_hasta, fecha_carga_real: e.fecha_carga_real, fecha_entrega_estimada: e.fecha_entrega_estimada,
    origen: [e.codigo_postal_origen, e.poblacion_origen].filter(Boolean).join(' '), destino: [e.codigo_postal_destino, e.poblacion_destino].filter(Boolean).join(' '),
    descripcion_mercancia: e.descripcion_mercancia, metros_lineales: e.metros_lineales, toneladas: e.toneladas,
    matricula_camion: e.matricula_camion, matricula_remolque: e.matricula_remolque, conductor_nombre: e.conductor_nombre,
    importe_cliente: (esT ? e.importe_transportista : e.importe_cliente) as number | null, importe_transportista: null,
  };
}
export async function misEnviosLigerosPorId(sb: SB, ids: string[], esT: boolean): Promise<EnvioLigero[]> {
  if (!ids.length) return [];
  const { data } = await sb.rpc(esT ? 'mis_viajes_por_ids' : 'mis_envios_por_ids', { p_ids: ids });
  const porId = new Map(((data ?? []) as FilaMia[]).map((e) => [e.id, ligeroDeMio(e, esT)]));
  return ids.map((id) => porId.get(id)).filter((e): e is EnvioLigero => !!e);
}
