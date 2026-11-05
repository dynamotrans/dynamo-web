import { hoyMadrid } from '@/lib/formato';
import { leerTodo } from '@/lib/leerTodo';
import { sesion, esDynamo } from '@/lib/sesion';
import { vistaDe, filtrarVista } from '@/lib/vista';
import AvisoCuenta from '@/components/panel/AvisoCuenta';
import NuevoEnvio, { type ClienteOpcion, type SitioOpcion, type Base, type ReglasPrecio } from '@/components/panel/NuevoEnvio';

export const dynamic = 'force-dynamic';

// Nuevo envío (pantalla "Nuevo envío" de dashboard.html, asistente de 4 pasos).
// Etapa A: lo crea el equipo de Dynamo para un cliente, con el precio puesto a mano.
// ?repetir=<envío> abre el asistente relleno con otro envío (sin fecha); ?ruta=<envío>
// abre solo la ruta de un envío ya creado para cambiarla.
export default async function PaginaNuevoEnvio({ searchParams }: { searchParams: Promise<{ repetir?: string; ruta?: string }> }) {
  const sp = await searchParams;
  const s = await sesion();
  if (!s) return null;
  const { supabase, perfil } = s;
  if (!perfil || perfil.estado !== 'activa') return <AvisoCuenta perfil={perfil} />;

  const hoy = hoyMadrid();
  const hasta = hoyMadrid(400);

  // ---- Etapa B: el CLIENTE pide su envío (solicitud, sin precio) --------------------
  if (!esDynamo(perfil.rol)) {
    if (perfil.rol !== 'cliente') {
      return <section className="section active"><div className="pt-aviso info" style={{ maxWidth: 640 }}><div>Esta pantalla es para los clientes.</div></div></section>;
    }
    const [emp, lug, fes, ops, reg] = await Promise.all([
      supabase.rpc('mi_empresa').maybeSingle(),
      leerTodo(supabase.from('sitios')
        .select('id, cliente_id, nombre_empresa, tipo, direccion, codigo_postal, poblacion, provincia, pais_codigo_iso, horarios, es_almacen_dynamo, disponible')
        .eq('borrado', false).order('nombre_empresa'), 5000),
      supabase.rpc('festivos_entre', { p_desde: hoy, p_hasta: hasta }),
      supabase.from('operadores').select('id, razon_social').eq('borrado', false).order('razon_social'),
      supabase.rpc('reglas_precio_envio'),
    ]);
    const e = emp.data as any;
    if (!e) return <section className="section active"><div className="pt-aviso error" style={{ maxWidth: 640 }}><div>Tu usuario aún no está asociado a una empresa. Escríbenos a info@dynamotrans.com.</div></div></section>;
    let base: Base | null = null;
    if (sp.repetir && /^[0-9a-f-]{36}$/i.test(sp.repetir)) {
      const { data: r } = await supabase.rpc('mis_envios').eq('id', sp.repetir).maybeSingle();
      const x = r as any;
      if (x) base = { modo: 'repetir', envio: { ...x, cliente_id: e.id, importe_cliente: null, importe_transportista: null },
        paradas: ((x.paradas ?? []) as any[]).map((p) => ({ id: p.id, tipo: p.tipo, sitio_id: p.sitio_id, nombre_empresa: p.nombre_empresa, direccion: p.direccion,
          codigo_postal: p.codigo_postal, poblacion: p.poblacion, provincia: p.provincia, pais_codigo_iso: p.pais_codigo_iso })) };
    }
    const fesC = (fes.data ?? []) as { fecha: string; nombre: string }[];
    return <NuevoEnvio key={sp.repetir ?? 'nuevo'} esCliente clientes={[{ id: e.id, nombre: e.nombre_comercial || e.razon_social, cif: e.cif, iva: e.iva_porcentaje ?? null }]}
      sitios={(lug.data ?? []) as SitioOpcion[]} festivos={fesC.map((f) => f.fecha)} nombresFestivos={Object.fromEntries(fesC.map((f) => [f.fecha, f.nombre]))}
      error={lug.error?.message ?? null} base={base}
      operadores={((ops.data ?? []) as any[]).map((o) => ({ id: o.id, nombre: o.razon_social }))} reglas={(reg.data ?? null) as ReglasPrecio | null} />;
  }

  // En la vista de un cliente, el envío es para ese cliente (solo sale él en la lista).
  const vista = await vistaDe(supabase, perfil.rol);
  const [cli, lug, fes, reg] = await Promise.all([
    leerTodo(filtrarVista(supabase.from('clientes').select('id, nombre_visible, cif, sitio_defecto_id, iva_porcentaje'), vista.tipo === 'cliente' ? vista : { tipo: 'admin', id: null, nombre: null }, { cliente: 'id' }).order('nombre_visible'), 2000),
    leerTodo(supabase.from('sitios')
      .select('id, cliente_id, nombre_empresa, tipo, direccion, codigo_postal, poblacion, provincia, pais_codigo_iso, horarios, es_almacen_dynamo, disponible')
      .eq('borrado', false).order('nombre_empresa'), 5000),
    // Nacionales de los próximos 13 meses, con su fecha real de cada año (los que se
    // repiten, como el 1 de noviembre o Viernes Santo, los resuelve la base de datos).
    supabase.rpc('festivos_entre', { p_desde: hoy, p_hasta: hasta }),
    supabase.rpc('reglas_precio_envio'),
  ]);

  let base: Base | null = null;
  const idBase = sp.ruta || sp.repetir;
  if (idBase && /^[0-9a-f-]{36}$/i.test(idBase)) {
    const [{ data: e }, { data: ps }] = await Promise.all([
      supabase.from('envios').select('id, referencia_gx, cliente_id, estado, metros_lineales, toneladas, paletizado, carga_lateral, carga_trasera, carga_superior, plataforma_elevadora, nima_requerido, adr, anotaciones_cliente, importe_cliente, importe_transportista, discrecion_comercial, negociacion_pct').eq('id', idBase).maybeSingle(),
      supabase.from('envio_paradas').select('id, tipo, sitio_id, nombre_empresa, direccion, codigo_postal, poblacion, provincia, pais_codigo_iso').eq('envio_id', idBase).order('orden'),
    ]);
    if (e) base = { modo: sp.ruta ? 'ruta' : 'repetir', envio: e as Base['envio'], paradas: (ps ?? []) as Base['paradas'] };
  }

  const clientes: ClienteOpcion[] = (cli.data ?? []).map((c) => ({ id: c.id, nombre: c.nombre_visible, cif: c.cif, principal_id: c.sitio_defecto_id, iva: c.iva_porcentaje }));
  const sitios: SitioOpcion[] = (lug.data ?? []) as SitioOpcion[];
  const festivos = ((fes.data ?? []) as { fecha: string }[]).map((f) => f.fecha);
  const nombresFestivos = Object.fromEntries(((fes.data ?? []) as { fecha: string; nombre: string }[]).map((f) => [f.fecha, f.nombre]));
  const error = cli.error?.message || lug.error?.message || null;

  return <NuevoEnvio key={idBase ?? 'nuevo'} clientes={clientes} sitios={sitios} festivos={festivos} nombresFestivos={nombresFestivos} error={error} base={base} esMaster={perfil.rol === 'admin'} reglas={(reg.data ?? null) as ReglasPrecio | null} />;
}
