import { sesion, esDynamo } from '@/lib/sesion';
import type { EnvioFila, Parada } from '@/lib/envios';
import TablaEnvios from '@/components/panel/TablaEnvios';
import AvisoCuenta from '@/components/panel/AvisoCuenta';
import FichaEnvio from '@/components/panel/FichaEnvio';
import { cargarFicha, cargarTransportistasParaAsignar } from '@/lib/fichaEnvio';
import FichaEnvioCliente from '@/components/panel/FichaEnvioCliente';
import FichaViaje from '@/components/panel/FichaViaje';
import OfertasAbiertas, { type Oferta } from '@/components/panel/OfertasAbiertas';

export const dynamic = 'force-dynamic';
export default async function PaginaEnvios({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const s = await sesion();
  if (!s) return null;
  const { supabase, perfil } = s;
  if (!perfil || perfil.estado !== 'activa') return <AvisoCuenta perfil={perfil} />;

  const rol = perfil.rol;
  const dynamo = esDynamo(rol);
  const sp = await searchParams;
  const q = (sp.q ?? '').trim();

  // ---- Datos, según el rol (Dynamo lee la tabla; cliente y transportista, sus funciones)
  let filas: EnvioFila[] = [];
  let error: string | null = null;
  let nota: string | null = null;
  if (dynamo) {
    const COLS = 'id, referencia_gx, referencia_cliente, estado, estado_asignacion, es_manual, transportista_id, ' +
      'fecha_carga_desde, fecha_carga_hasta, fecha_carga_real, fecha_entrega_estimada, descripcion_mercancia, ' +
      'toneladas, metros_lineales, tipo_carga, paletizado, poblacion_origen, codigo_postal_origen, poblacion_destino, codigo_postal_destino, ' +
      'importe_cliente, importe_transportista, precio_acordado_operador, precio_fijado_a_mano, matricula_camion, ' +
      'matricula_remolque, creado_en, modificado_en, creado_por, solicitud_estado, clientes(nombre_visible, cif), operadores(razon_social), ' +
      'envio_paradas(orden, tipo, nombre_empresa, direccion, codigo_postal, poblacion, provincia, pais_codigo_iso)';
    const TERMINADOS = 1000;
    let data: any[] = [];
    if (q) {
      // Con búsqueda: la hace la base de datos sobre TODOS los envíos (también los antiguos).
      const { data: ids, error: e1 } = await supabase.rpc('buscar_envios', { p_q: q, p_limite: 500 });
      if (e1) error = e1.message;
      const lista = ((ids ?? []) as string[]);
      if (lista.length) {
        const r = await supabase.from('envios').select(COLS).in('id', lista);
        if (r.error) error = r.error.message;
        data = r.data ?? [];
      }
      if (lista.length >= 500) nota = 'Hay más de 500 envíos que coinciden: se ven los 500 más recientes. Afina la búsqueda.';
    } else {
      // Sin búsqueda: TODOS los vivos y los últimos terminados (entregados y cancelados).
      const [vivos, fin] = await Promise.all([
        supabase.from('envios').select(COLS).not('estado', 'in', '(entregado,cancelado)').order('creado_en', { ascending: false }).limit(5000),
        supabase.from('envios').select(COLS).in('estado', ['entregado', 'cancelado']).order('creado_en', { ascending: false }).limit(TERMINADOS),
      ]);
      error = vivos.error?.message ?? fin.error?.message ?? null;
      data = [...(vivos.data ?? []), ...(fin.data ?? [])];
      if ((fin.data ?? []).length >= TERMINADOS) nota = `Se ven los ${TERMINADOS.toLocaleString('es-ES')} últimos envíos entregados o cancelados. Para uno más antiguo, búscalo por su número, cliente, población o matrícula.`;
    }
    filas = (data as any[]).map((x) => ({
      ...x, cliente: x.clientes?.nombre_visible ?? null, cliente_cif: x.clientes?.cif ?? null,
      operador: x.operadores?.razon_social ?? null, transportista_asignado: !!x.transportista_id,
      paradas: (x.envio_paradas ?? []) as Parada[],
    }));
  } else {
    const { data, error: e } = await supabase.rpc(rol === 'transportista' ? 'mis_viajes' : 'mis_envios').limit(1000);
    if (e) error = e.message;
    filas = ((data ?? []) as any[]).map((x) => ({
      ...x, cliente: null, cliente_cif: null, operador: null, creado_por: x.creado_por ?? null,
      transportista_asignado: !!x.asignado_en || x.estado_asignacion === 'confirmada',
      paradas: (x.paradas ?? []) as Parada[],
    }));
    // Nombre del operador de los envíos manuales del cliente (su propio catálogo).
    const ids = [...new Set(filas.map((f: any) => f.operador_id).filter(Boolean))];
    if (ids.length) {
      const { data: ops } = await supabase.from('operadores').select('id, razon_social').in('id', ids);
      const mapa = new Map((ops ?? []).map((o) => [o.id, o.razon_social]));
      filas.forEach((f: any) => { f.operador = mapa.get(f.operador_id) ?? null; });
    }
  }
  filas.sort((a, b) => (b.creado_en ?? '').localeCompare(a.creado_en ?? ''));

  // Quién creó cada envío (columna "Creado por"). Dynamo ve a todos los usuarios.
  const nombres = new Map<string, string>();
  if (dynamo) {
    const ids = [...new Set(filas.map((f) => f.creado_por).filter(Boolean))] as string[];
    if (ids.length) {
      const { data: us } = await supabase.from('usuarios').select('id, nombre, email').in('id', ids);
      (us ?? []).forEach((u) => nombres.set(u.id, u.nombre || u.email));
    }
  }

  // Ficha de un envío (?ver=<id>), encima de la lista. Solo Dynamo por ahora (etapa A).
  let ficha = null, transportistas: Awaited<ReturnType<typeof cargarTransportistasParaAsignar>> = [], errorFicha: string | null = null;
  if (dynamo && sp.ver) {
    const [r, t] = await Promise.all([cargarFicha(supabase, sp.ver), cargarTransportistasParaAsignar(supabase)]);
    ficha = r.ficha; errorFicha = r.error; transportistas = t;
  }
  // Ficha para el CLIENTE: con lo que ya trae mis_envios() (sin datos internos) y sus hitos visibles.
  let fichaCli: any = null;
  if (rol === 'cliente' && sp.ver) {
    fichaCli = filas.find((x) => x.id === sp.ver) ?? null;
    if (!fichaCli && /^[0-9a-f-]{36}$/i.test(sp.ver)) {
      const { data } = await supabase.rpc('mis_envios').eq('id', sp.ver).maybeSingle();
      fichaCli = data ?? null;
    }
    if (fichaCli) {
      const { data: hit } = await supabase.from('envio_hitos').select('id, hito, cuando').eq('envio_id', fichaCli.id).order('cuando', { ascending: false }).limit(100);
      fichaCli = { ...fichaCli, hitos: hit ?? [] };
    }
  }
  // Etapa C: el TRANSPORTISTA, su ficha de viaje y sus ofertas abiertas.
  let fichaViaje: any = null, ofertas: Oferta[] = [];
  if (rol === 'transportista') {
    if (sp.ver) fichaViaje = filas.find((x) => x.id === sp.ver) ?? null;
    const { data } = await supabase.rpc('mis_ofertas');
    ofertas = (data ?? []) as Oferta[];
  }
  const sinVer = new URLSearchParams(Object.entries(sp).filter(([k, v]) => k !== 'ver' && v) as [string, string][]).toString();
  const cerrarHref = `/panel/envios${sinVer ? `?${sinVer}` : ''}`;

  return (
    <>
      {ofertas.length > 0 && <OfertasAbiertas ofertas={ofertas} />}
      <TablaEnvios filas={filas} nombres={Object.fromEntries(nombres)} rol={rol} f={sp.f} q={q} p={sp.p} error={error ?? errorFicha} nuevo={sp.nuevo} nota={nota} nuevoManual={!!sp.manual} />
      {ficha && <FichaEnvio key={ficha.envio.id} ficha={ficha} transportistas={transportistas} cerrarHref={cerrarHref} />}
      {fichaCli && <FichaEnvioCliente key={fichaCli.id} e={fichaCli} cerrarHref={cerrarHref} />}
      {fichaViaje && <FichaViaje key={fichaViaje.id} e={fichaViaje} cerrarHref={cerrarHref} />}
    </>
  );
}
