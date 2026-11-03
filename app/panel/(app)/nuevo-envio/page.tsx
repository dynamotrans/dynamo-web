import { sesion, esDynamo } from '@/lib/sesion';
import AvisoCuenta from '@/components/panel/AvisoCuenta';
import NuevoEnvio, { type ClienteOpcion, type SitioOpcion } from '@/components/panel/NuevoEnvio';

export const dynamic = 'force-dynamic';

// Nuevo envío (pantalla "Nuevo envío" de dashboard.html, asistente de 4 pasos).
// Etapa A: lo crea el equipo de Dynamo para un cliente, con el precio puesto a mano.
export default async function PaginaNuevoEnvio() {
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
  const [cli, lug, fes] = await Promise.all([
    supabase.from('clientes').select('id, nombre_visible, cif').order('nombre_visible').limit(2000),
    supabase.from('lugares')
      .select('id, cliente_id, nombre_empresa, tipo, direccion, codigo_postal, poblacion, provincia, pais_codigo_iso, horarios, es_almacen_dynamo, disponible')
      .eq('borrado', false).order('nombre_empresa').limit(5000),
    supabase.from('festivos').select('fecha').is('region', null).eq('pais_codigo_iso', 'ES').gte('fecha', hoy).limit(200),
  ]);

  const clientes: ClienteOpcion[] = (cli.data ?? []).map((c) => ({ id: c.id, nombre: c.nombre_visible, cif: c.cif }));
  const sitios: SitioOpcion[] = (lug.data ?? []) as SitioOpcion[];
  const festivos = (fes.data ?? []).map((f) => f.fecha as string);
  const error = cli.error?.message || lug.error?.message || null;

  return <NuevoEnvio clientes={clientes} sitios={sitios} festivos={festivos} error={error} />;
}
