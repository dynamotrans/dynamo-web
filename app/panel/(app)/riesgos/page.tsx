import { sesion, esDynamo, sinAcceso } from '@/lib/sesion';
import AvisoCuenta from '@/components/panel/AvisoCuenta';
import Riesgos, { type RiesgoFila, type DeudaCliente, type EstadoDeuda } from '@/components/panel/Riesgos';
import { holdedListo } from '@/lib/servidor/holded';
import { paginaDe } from '@/components/panel/Paginador';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;   // leer de la facturación lo que debe cada cliente puede tardar unos segundos

// CESCE - Riesgos (solo Dynamo): por cliente, el crédito concedido (CESCE y manual), el
// que limita, lo asumido en los últimos días (envíos sin cobrar, con IVA) y lo disponible.
// Por páginas desde la base de datos (riesgos_pagina): con miles de clientes la pantalla
// mandaba ~870 KB. Buscador y filtro van por la URL (?q, ?f).
export default async function PaginaRiesgos({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const s = await sesion();
  if (!s) return null;
  const { supabase, perfil } = s;
  if (sinAcceso(perfil)) return <AvisoCuenta perfil={perfil} />;
  if (!esDynamo(perfil.rol)) {
    return <section className="section active"><div className="pt-aviso error" style={{ maxWidth: 640 }}><div>Esta sección es solo del equipo de Dynamo.</div></div></section>;
  }
  const sp = await searchParams;
  const q = (sp.q ?? '').trim().slice(0, 200);
  const filtro = ['con', 'sin', 'pasado', 'alto', 'riesgo'].includes(sp.f ?? '') ? sp.f! : '';
  const { pagina, porPagina } = paginaDe(sp, 50);

  const [pg, tot, p] = await Promise.all([
    supabase.rpc('riesgos_pagina', { p_q: q || null, p_filtro: filtro || null, p_pagina: pagina, p_por_pagina: porPagina }),
    supabase.rpc('riesgos_totales'),
    supabase.from('parametros').select('valor').eq('clave', 'riesgo_dias_asumido').maybeSingle(),
  ]);
  const num = (x: unknown) => (x == null ? null : Number(x));
  const total = Number(pg.data?.[0]?.total ?? 0);
  const filas: RiesgoFila[] = (pg.data ?? []).map((x) => ({
    id: x.cliente_id, nombre: x.nombre, cif: x.cif, cesce: num(x.riesgo_cesce), plazo: x.plazo_cesce, manual: num(x.riesgo_manual),
    limite: num(x.riesgo_efectivo), manda: x.manda as RiesgoFila['manda'], envios: x.envios, base: Number(x.asumido_base), asumido: Number(x.asumido),
    disponible: num(x.disponible), ultimo: x.ultimo_envio,
  }));
  // Lo que debe cada cliente de esta página según la última foto de la facturación (facturas
  // emitidas con algo pendiente de cobro). De momento solo informativo.
  const [du, de] = await Promise.all([
    filas.length ? supabase.rpc('deuda_clientes', { p_clientes: filas.map((f) => f.id) }) : Promise.resolve({ data: [] as { cliente_id: string; pendiente: number; vencido: number; facturas: number; vence_primera: string | null }[] }),
    supabase.rpc('deuda_estado'),
  ]);
  const deuda: Record<string, DeudaCliente> = {};
  for (const d of du.data ?? []) deuda[d.cliente_id] = { pendiente: Number(d.pendiente), vencido: Number(d.vencido), facturas: Number(d.facturas), vencePrimera: d.vence_primera };
  const e0 = (de.data ?? {}) as Record<string, unknown>;
  const estadoDeuda: EstadoDeuda = { conectado: holdedListo(), ultimaOk: (e0.ultima_ok_en as string | null) ?? null, ultima: (e0.ultima_en as string | null) ?? null,
    error: (e0.error as string | null) ?? null, facturas: Number(e0.facturas ?? 0), sinCif: Number(e0.sin_cif ?? 0),
    pendiente: Number(e0.pendiente ?? 0), vencido: Number(e0.vencido ?? 0), pendienteOtros: Number(e0.pendiente_otros ?? 0), facturasOtros: Number(e0.facturas_otros ?? 0) };
  const t0 = (tot.data ?? [])[0] as { limite: number; asumido: number; pasados: number } | undefined;
  const totales = { limite: Number(t0?.limite ?? 0), asumido: Number(t0?.asumido ?? 0), pasados: Number(t0?.pasados ?? 0) };
  return <Riesgos filas={filas} dias={Number(p.data?.valor ?? 60)} error={pg.error?.message ?? null}
    totales={totales} lista={{ q, filtro, pagina, porPagina, total }} deuda={deuda} estadoDeuda={estadoDeuda} />;
}
