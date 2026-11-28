import 'server-only';
import type { supabaseServidor } from '@/lib/supabase/server';
import type { Vista } from '@/lib/vistaTipo';
import type { IncidenciaFila } from '@/components/panel/Incidencias';
import { misEnviosLigerosPorId, type EnvioLigero } from '@/lib/enviosLigeros';
import { filtroFechaValido, rangoFiltroFecha, hoyMadrid } from '@/lib/filtroFechas';
import { textoBusqueda } from '@/lib/formato';

// INCIDENCIAS POR PÁGINAS (usuario, 2026-11-28): la base de datos filtra y cuenta
// (incidencias_pagina) y aquí se leen solo las filas de la página. La usan la pantalla y
// «Exportar» (que pide todas las del filtro, hasta 5.000).
type SB = NonNullable<Awaited<ReturnType<typeof supabaseServidor>>>;
export type Pestana = 'abiertas' | 'resueltas' | 'todas';
export type FiltrosIncidencias = { pe: Pestana; q: string; fr: string; fd: string; fh: string };
export type ModoLista = { tipo: 'dynamo'; vista: Vista } | { tipo: 'propias'; transportista: boolean };

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
/** Los filtros de la URL (pe, q, fr, fd, fh), acotados. Con algo buscado y sin pestaña, «Todas». */
export function filtrosDe(sp: Record<string, string | undefined>): FiltrosIncidencias {
  const q = (sp.q ?? '').trim().slice(0, 120);
  const pe: Pestana = sp.pe === 'abiertas' || sp.pe === 'resueltas' || sp.pe === 'todas' ? sp.pe : q ? 'todas' : 'abiertas';
  const fr = sp.fr && filtroFechaValido(sp.fr) ? sp.fr : '';
  return { pe, q, fr, fd: FECHA.test(sp.fd ?? '') ? sp.fd! : '', fh: FECHA.test(sp.fh ?? '') ? sp.fh! : '' };
}

export async function cargarIncidencias(sb: SB, modo: ModoLista, f: FiltrosIncidencias, pagina: number, porPagina: number): Promise<{
  filas: IncidenciaFila[]; total: number; abiertas: number; resueltas: number; error: string | null; envios: EnvioLigero[];
}> {
  const rango = rangoFiltroFecha(f.fr, hoyMadrid(), f.fd, f.fh);
  const v = modo.tipo === 'dynamo' ? modo.vista : null;
  const { data, error } = await sb.rpc('incidencias_pagina', {
    p_pestana: f.pe, p_q: textoBusqueda(f.q) || null, p_desde: rango?.desde ?? null, p_hasta: rango?.hasta ?? null,
    p_cliente: v?.tipo === 'cliente' ? v.id : null, p_transportista: v?.tipo === 'transportista' ? v.id : null,
    p_pagina: pagina, p_por_pagina: porPagina,
  });
  const r = (data ?? {}) as { ids?: string[]; total?: number; abiertas?: number; resueltas?: number };
  const ids = r.ids ?? [];
  const base = { total: Number(r.total ?? 0), abiertas: Number(r.abiertas ?? 0), resueltas: Number(r.resueltas ?? 0) };
  if (error) return { filas: [], ...base, error: error.message, envios: [] };
  if (!ids.length) return { filas: [], ...base, error: null, envios: [] };
  const pos = new Map(ids.map((id, i) => [id, i]));
  const enOrden = <T extends { id: string }>(xs: T[]) => xs.sort((a, b) => (pos.get(a.id) ?? 1e9) - (pos.get(b.id) ?? 1e9));

  if (modo.tipo === 'propias') {
    // El cliente (o el transportista): sus envíos, por la vía ligera (sin datos de otros).
    const { data: inc, error: e2 } = await sb.from('incidencias')
      .select('id, codigo, envio_id, cliente_id, tipo_id, titulo, detalle, estado, prioridad, resolucion, resuelto_en, creado_en, modificado_en, tipos_incidencia(nombre)')
      .in('id', ids);
    const envios = await misEnviosLigerosPorId(sb, [...new Set((inc ?? []).map((x) => x.envio_id).filter((x): x is string => !!x))], modo.transportista);
    const porId = new Map(envios.map((e) => [e.id, e]));
    const filas = enOrden((inc ?? []).map((x) => {
      const e = x.envio_id ? porId.get(x.envio_id) : null;
      return { id: x.id, codigo: x.codigo, envio_id: x.envio_id, cliente_id: x.cliente_id, tipo_id: x.tipo_id, tipo: x.tipos_incidencia?.nombre ?? '—',
        titulo: x.titulo, detalle: x.detalle, estado: x.estado, prioridad: x.prioridad, resolucion: x.resolucion, resuelto_en: x.resuelto_en,
        creado_en: x.creado_en, modificado_en: x.modificado_en, cliente: null,
        envio: e ? { referencia_gx: e.referencia_gx, referencia_cliente: e.referencia_cliente, fecha_carga_desde: e.fecha_carga_desde, fecha_carga_hasta: e.fecha_carga_hasta,
          origen: e.origen, destino: e.destino, metros_lineales: e.metros_lineales, toneladas: e.toneladas } : null } as IncidenciaFila;
    }));
    return { filas, ...base, error: e2?.message ?? null, envios };
  }

  const { data: inc, error: e2 } = await sb.from('incidencias').select('id, codigo, envio_id, cliente_id, tipo_id, titulo, detalle, estado, prioridad, resolucion, resuelto_en, creado_en, modificado_en, ' +
    'tipos_incidencia(nombre), clientes(nombre_visible), envios(referencia_gx, referencia_cliente, fecha_carga_desde, fecha_carga_hasta, ' +
    'codigo_postal_origen, poblacion_origen, codigo_postal_destino, poblacion_destino, metros_lineales, toneladas)').in('id', ids);
  type Fila = { id: string; codigo: string; envio_id: string | null; cliente_id: string | null; tipo_id: string; titulo: string; detalle: string | null;
    estado: IncidenciaFila['estado']; prioridad: IncidenciaFila['prioridad']; resolucion: string | null; resuelto_en: string | null; creado_en: string; modificado_en: string | null;
    tipos_incidencia: { nombre: string } | null; clientes: { nombre_visible: string } | null;
    envios: { referencia_gx: string; referencia_cliente: string | null; fecha_carga_desde: string | null; fecha_carga_hasta: string | null;
      codigo_postal_origen: string | null; poblacion_origen: string | null; codigo_postal_destino: string | null; poblacion_destino: string | null;
      metros_lineales: number | null; toneladas: number | null } | null };
  const filas = enOrden(((inc ?? []) as unknown as Fila[]).map((x) => ({
    id: x.id, codigo: x.codigo, envio_id: x.envio_id, cliente_id: x.cliente_id, tipo_id: x.tipo_id, tipo: x.tipos_incidencia?.nombre ?? '—',
    titulo: x.titulo, detalle: x.detalle, estado: x.estado, prioridad: x.prioridad, resolucion: x.resolucion, resuelto_en: x.resuelto_en,
    creado_en: x.creado_en, modificado_en: x.modificado_en, cliente: x.clientes?.nombre_visible ?? null,
    envio: x.envios ? {
      referencia_gx: x.envios.referencia_gx, referencia_cliente: x.envios.referencia_cliente,
      fecha_carga_desde: x.envios.fecha_carga_desde, fecha_carga_hasta: x.envios.fecha_carga_hasta,
      origen: [x.envios.codigo_postal_origen, x.envios.poblacion_origen].filter(Boolean).join(' '),
      destino: [x.envios.codigo_postal_destino, x.envios.poblacion_destino].filter(Boolean).join(' '),
      metros_lineales: x.envios.metros_lineales, toneladas: x.envios.toneladas,
    } : null,
  })));
  return { filas, ...base, error: e2?.message ?? null, envios: [] };
}
