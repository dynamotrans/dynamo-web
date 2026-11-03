import { sesion, esDynamo } from '@/lib/sesion';
import AvisoCuenta from '@/components/panel/AvisoCuenta';
import NuevoEnvio, { type ClienteOpcion, type SitioOpcion, type Base } from '@/components/panel/NuevoEnvio';

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

  if (!esDynamo(perfil.rol)) {
    return (
      <section className="section active">
        <div className="sec-header"><h2>Nuevo envío</h2></div>
        <div className="pt-aviso info" style={{ maxWidth: 640 }}><div>
          <strong>Muy pronto podrás crear tus envíos aquí.</strong> Mientras tanto, pídenoslo por
          email a info@dynamotrans.com o por WhatsApp al +34 628 995 709 y lo creamos al momento.
        </div></div>
      </section>
    );
  }

  const hoy = new Date().toISOString().slice(0, 10);
  const hasta = new Date(Date.now() + 400 * 86400000).toISOString().slice(0, 10);
  const [cli, lug, fes] = await Promise.all([
    supabase.from('clientes').select('id, nombre_visible, cif, lugar_defecto_id').order('nombre_visible').limit(2000),
    supabase.from('lugares')
      .select('id, cliente_id, nombre_empresa, tipo, direccion, codigo_postal, poblacion, provincia, pais_codigo_iso, horarios, es_almacen_dynamo, disponible')
      .eq('borrado', false).order('nombre_empresa').limit(5000),
    // Nacionales de los próximos 13 meses, con su fecha real de cada año (los que se
    // repiten, como el 1 de noviembre o Viernes Santo, los resuelve la base de datos).
    supabase.rpc('festivos_entre', { p_desde: hoy, p_hasta: hasta }),
  ]);

  let base: Base | null = null;
  const idBase = sp.ruta || sp.repetir;
  if (idBase && /^[0-9a-f-]{36}$/i.test(idBase)) {
    const [{ data: e }, { data: ps }] = await Promise.all([
      supabase.from('envios').select('id, referencia_gx, cliente_id, estado, metros_lineales, toneladas, paletizado, carga_lateral, carga_trasera, carga_superior, plataforma_elevadora, nima_requerido, adr, anotaciones_cliente, importe_cliente, importe_transportista, discrecion_comercial').eq('id', idBase).maybeSingle(),
      supabase.from('envio_paradas').select('id, tipo, lugar_id, nombre_empresa, direccion, codigo_postal, poblacion, provincia, pais_codigo_iso').eq('envio_id', idBase).order('orden'),
    ]);
    if (e) base = { modo: sp.ruta ? 'ruta' : 'repetir', envio: e as Base['envio'], paradas: (ps ?? []) as Base['paradas'] };
  }

  const clientes: ClienteOpcion[] = (cli.data ?? []).map((c) => ({ id: c.id, nombre: c.nombre_visible, cif: c.cif, principal_id: c.lugar_defecto_id }));
  const sitios: SitioOpcion[] = (lug.data ?? []) as SitioOpcion[];
  const festivos = ((fes.data ?? []) as { fecha: string }[]).map((f) => f.fecha);
  const nombresFestivos = Object.fromEntries(((fes.data ?? []) as { fecha: string; nombre: string }[]).map((f) => [f.fecha, f.nombre]));
  const error = cli.error?.message || lug.error?.message || null;

  return <NuevoEnvio key={idBase ?? 'nuevo'} clientes={clientes} sitios={sitios} festivos={festivos} nombresFestivos={nombresFestivos} error={error} base={base} />;
}
