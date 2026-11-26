'use server';

import { sesion, esDynamo } from '@/lib/sesion';
import { comprobarEntrada } from '@/lib/entradas/comprobar';
import { holdedListo, leerHolded } from '@/lib/servidor/holded';
import { formaDeEnlaces } from '@/lib/holdedFacturas';
import { ponerAlDiaFacturas } from '@/lib/servidor/facturasCopia';
import { vistaDe } from '@/lib/vista';
import { rangoFiltroFecha, filtroFechaValido, hoyMadrid } from '@/lib/filtroFechas';

// Administración → Facturas: las facturas EMITIDAS, leídas de NUESTRA COPIA (tabla
// facturas_emitidas), que el servidor mantiene al día sola desde el programa de facturación
// (usuario, 2026-11-25). Dynamo las ve todas; cada cliente, las suyas (lo decide la base de
// datos en facturas_lista, nunca un dato que venga del navegador). Las recibidas no se
// enseñan: se gestionan en la facturación. SOLO LECTURA allí.
export type FacturaFila = {
  id: string; numero: string | null; fecha: string; vence: string | null;
  base: number; iva: number; retencion: number; total: number; pendiente: number;
  estado: 'pendiente' | 'vencida' | 'pagada' | 'anulada' | 'otro'; parcial: boolean; pagada_el: string | null;
  empresa?: string | null; cif?: string | null; cuenta?: string | null; es_cliente?: boolean;   // solo Dynamo
};
export type EstadoCopia = { conectado: boolean; ultimaOk: string | null; ultima: string | null; error: string | null;
  cargando: boolean; cargada: boolean; enCopia: number; desde: string | null; sinCif: number };
export type FiltroFacturas = { q: string; estado: string; fecha: string; desde: string; hasta: string; pagina: number };
export type PaginaFacturas =
  | { ok: true; total: number; base: number; importe: number; porCobrar: number; vencido: number; filas: FacturaFila[]; copia: EstadoCopia | null }
  | { ok: false; error: string };

const ESTADOS = ['todas', 'por_cobrar', 'vencida', 'pagada', 'anulada'];
const POR_PAGINA = 25;

export async function facturasPagina(f: FiltroFacturas): Promise<PaginaFacturas> {
  comprobarEntrada("app/panel/(app)/administracion/acciones#facturasPagina", [f]);
  const s = await sesion();
  if (!s?.perfil || !['activa', 'suspendida'].includes(s.perfil.estado)) return { ok: false, error: 'Sin permiso.' };
  const dynamo = esDynamo(s.perfil.rol);
  if (!dynamo && s.perfil.rol !== 'cliente') return { ok: false, error: 'Sin permiso.' };
  const rango = f.fecha && filtroFechaValido(f.fecha) ? rangoFiltroFecha(f.fecha, hoyMadrid(), f.desde, f.hasta) : null;
  // «Ver como» un cliente: Dynamo ve solo las de ese cliente.
  const vista = dynamo ? await vistaDe(s.supabase, s.perfil.rol) : null;
  const [r, e] = await Promise.all([
    s.supabase.rpc('facturas_lista', {
      p_q: f.q.trim().slice(0, 120) || undefined, p_estado: ESTADOS.includes(f.estado) ? f.estado : 'todas',
      p_desde: rango?.desde ?? undefined, p_hasta: rango?.hasta ?? undefined,
      p_pagina: Math.max(1, Math.floor(f.pagina) || 1), p_por: POR_PAGINA,
      p_cliente: vista?.tipo === 'cliente' ? vista.id : undefined }),
    dynamo ? s.supabase.rpc('deuda_estado') : Promise.resolve({ data: null }),
  ]);
  if (r.error) return { ok: false, error: 'No se han podido leer las facturas. Prueba otra vez en un momento.' };
  const d = (r.data ?? {}) as { total?: number; base?: number; importe?: number; por_cobrar?: number; vencido?: number; filas?: FacturaFila[] };
  const e0 = (e.data ?? null) as Record<string, unknown> | null;
  const n = (v: unknown) => Number(v ?? 0);
  return { ok: true, total: n(d.total), base: n(d.base), importe: n(d.importe), porCobrar: n(d.por_cobrar), vencido: n(d.vencido),
    filas: (d.filas ?? []).map((x) => ({ ...x, base: n(x.base), iva: n(x.iva), retencion: n(x.retencion), total: n(x.total), pendiente: n(x.pendiente) })),
    copia: e0 ? { conectado: holdedListo(), ultimaOk: (e0.ultima_ok_en as string | null) ?? null, ultima: (e0.ultima_en as string | null) ?? null,
      error: (e0.error as string | null) ?? null, cargando: e0.cargando === true, cargada: !!e0.carga_completa_en,
      enCopia: n(e0.en_copia), desde: (e0.desde as string | null) ?? null, sinCif: n(e0.sin_cif) } : null };
}

// «Actualizar ahora»: una pasada de la puesta al día de la copia, sin esperar a la automática.
// Si la primera carga aún no ha terminado, sigue con ella (la pantalla repite hasta que acabe).
// `cargando`: falta trabajo (la primera carga o un repaso a medias): la pantalla vuelve a llamar.
export type FacturasAlDia = { ok: true; cargando: boolean } | { ok: false; conectado: boolean; error: string };
export async function actualizarFacturas(): Promise<FacturasAlDia> {
  comprobarEntrada("app/panel/(app)/administracion/acciones#actualizarFacturas", []);
  const s = await sesion();
  if (!s?.perfil || s.perfil.estado !== 'activa' || !esDynamo(s.perfil.rol)) return { ok: false, conectado: false, error: 'Solo el equipo de Dynamo.' };
  const r = await ponerAlDiaFacturas({ forzar: true });
  if (!r.ok) return r;
  if (!r.cargando) void enlacesDePedidos();
  return { ok: true, cargando: r.cargando || r.enCurso };
}

// «Repasar desde una fecha» (usuario, 2026-11-26): volver a leer de la facturación TODAS las
// facturas emitidas desde ese día, pagadas incluidas. Para cuando se corrige en la facturación
// el importe o el cliente de una factura antigua ya pagada, que el repaso de cada noche (los
// últimos 6 meses) no mira. Si no cabe en una llamada, la pantalla sigue con actualizarFacturas.
export async function repasarFacturas(desde: string): Promise<FacturasAlDia> {
  comprobarEntrada("app/panel/(app)/administracion/acciones#repasarFacturas", [desde]);
  const s = await sesion();
  if (!s?.perfil || s.perfil.estado !== 'activa' || !esDynamo(s.perfil.rol)) return { ok: false, conectado: false, error: 'Solo el equipo de Dynamo.' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(desde) || Number.isNaN(Date.parse(`${desde}T00:00:00Z`)) || desde > hoyMadrid() || desde < '2010-01-01') {
    return { ok: false, conectado: true, error: 'Elige una fecha válida, de hoy hacia atrás.' };
  }
  const r = await ponerAlDiaFacturas({ forzar: true, repasarDesde: desde });
  if (!r.ok) return r;
  if (r.hecho === 'nada') return { ok: false, conectado: true, error: 'Se acaba de actualizar hace un momento. Espera unos segundos y vuelve a pulsar.' };
  if (r.cargando) return { ok: false, conectado: true, error: 'La primera carga aún no ha terminado. Cuando acabe, vuelve a pulsar.' };
  return { ok: true, cargando: r.enCurso };
}

// Afinando (quitar cuando se sepa): ¿dice la facturación de qué pedido sale cada factura y qué
// facturas han salido de cada pedido? Se leen unos pocos documentos reales (solo lectura) y se
// apunta su estado y el tipo de los documentos enlazados. Como mucho una vez cada 10 minutos.
let ultimoEnlaces = 0;
async function enlacesDePedidos(): Promise<void> {
  if (Date.now() - ultimoEnlaces < 10 * 60_000) return;
  ultimoEnlaces = Date.now();
  try {
    const uno = async (ruta: string) => { const r = await leerHolded(ruta); return r.ok ? formaDeEnlaces(r.datos) : { error: r.error }; };
    const lista = async (ruta: string) => {
      const r = await leerHolded(ruta, { limit: 5 });
      const items = r.ok && Array.isArray((r.datos as { items?: unknown } | null)?.items) ? (r.datos as { items: Record<string, unknown>[] }).items : [];
      return { error: r.ok ? null : r.error, ids: items.map((i) => String(i?.id ?? '')).filter((x) => /^[0-9a-f]{24}$/.test(x)).slice(0, 2),
        estados: items.map((i) => i?.status ?? null), claves: items[0] ? Object.keys(items[0]) : [] };
    };
    const [venta, compra, recibidas, emitidas] = await Promise.all([lista('/sales-orders'), lista('/purchase-orders'), lista('/purchases'), lista('/invoices')]);
    const facturas = emitidas.ids;
    const [f, v, c, p] = await Promise.all([
      Promise.all(facturas.filter((x) => /^[0-9a-f]{24}$/.test(x)).map((x) => uno(`/invoices/${x}`))),
      Promise.all(venta.ids.map((x) => uno(`/sales-orders/${x}`))),
      Promise.all(compra.ids.map((x) => uno(`/purchase-orders/${x}`))),
      Promise.all(recibidas.ids.map((x) => uno(`/purchases/${x}`))),
    ]);
    console.log('[Holded] enlaces de pedidos', JSON.stringify({
      facturas: f, pedidos_venta: { error: venta.error, estados: venta.estados, claves: venta.claves, detalle: v },
      pedidos_compra: { error: compra.error, estados: compra.estados, claves: compra.claves, detalle: c },
      facturas_recibidas: { error: recibidas.error, estados: recibidas.estados, detalle: p },
    }));
  } catch (e) { console.error('[Holded] enlaces de pedidos', e instanceof Error ? e.message : 'fallo'); }
}
