import { leerTodo } from '@/lib/leerTodo';
import { sesion, esDynamo } from '@/lib/sesion';
import { vistaDe, filtrarVista } from '@/lib/vista';
import AvisoCuenta from '@/components/panel/AvisoCuenta';
import Sitios, { type ClienteSitios } from '@/components/panel/Sitios';
import { cargarSitios } from '@/lib/sitiosDatos';

export const dynamic = 'force-dynamic';

// Sitios: la agenda de recogidas y entregas (diseño de #sec-sitios de dashboard.html).
// Dynamo ve los de todos los clientes; un cliente, solo los suyos (lo impone la base de
// datos con los permisos por fila, no esta pantalla).
export default async function PaginaSitios() {
  const s = await sesion();
  if (!s) return null;
  const { supabase, perfil } = s;
  if (!perfil || perfil.estado !== 'activa') return <AvisoCuenta perfil={perfil} />;
  const dynamo = esDynamo(perfil.rol);
  if (!dynamo && perfil.rol !== 'cliente') {
    return <section className="section active"><div className="pt-aviso error" style={{ maxWidth: 640 }}><div>Esta sección es de los clientes y del equipo de Dynamo.</div></div></section>;
  }

  const vista = await vistaDe(supabase, perfil.rol);
  const cargados = await cargarSitios(supabase, false);
  const error = cargados.error;
  // En la vista de un cliente, solo sus sitios.
  const filas = vista.tipo === 'cliente' ? cargados.filas.filter((f) => f.cliente_id === vista.id) : cargados.filas;

  // Clientes (para Dynamo, todos; para un cliente, él mismo) con su sitio principal.
  let clientes: ClienteSitios[] = [];
  if (dynamo) {
    const { data } = await leerTodo(filtrarVista(supabase.from('clientes').select('id, nombre_visible, cif, sitio_principal_id'), vista, { cliente: 'id' }).order('nombre_visible'), 5000);
    clientes = (data ?? []).map((c) => ({ id: c.id, nombre: c.nombre_visible, cif: c.cif, principal_id: c.sitio_principal_id }));
  } else {
    const { data: e } = await supabase.rpc('mi_empresa').maybeSingle<{ id: string; razon_social: string; nombre_comercial: string | null; cif: string }>();
    if (e) {
      const { data: prin } = await supabase.rpc('sitio_principal', { p_cliente: e.id });
      clientes = [{ id: e.id, nombre: e.nombre_comercial || e.razon_social, cif: e.cif, principal_id: (prin as string | null) ?? null }];
    }
  }

  return <Sitios filas={filas} clientes={clientes} dynamo={dynamo} error={error} veranoDefecto={cargados.veranoDefecto} />;
}
