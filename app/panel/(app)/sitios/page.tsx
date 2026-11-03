import { sesion, esDynamo } from '@/lib/sesion';
import AvisoCuenta from '@/components/panel/AvisoCuenta';
import Sitios, { type ClienteSitios } from '@/components/panel/Sitios';
import { cargarLugares } from '@/lib/sitiosDatos';

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

  const { filas, error } = await cargarLugares(supabase, false);

  // Clientes (para Dynamo, todos; para un cliente, él mismo) con su sitio principal.
  let clientes: ClienteSitios[] = [];
  if (dynamo) {
    const { data } = await supabase.from('clientes').select('id, nombre_visible, cif, lugar_defecto_id').order('nombre_visible').limit(5000);
    clientes = (data ?? []).map((c) => ({ id: c.id, nombre: c.nombre_visible, cif: c.cif, principal_id: c.lugar_defecto_id }));
  } else {
    const { data: e } = await supabase.rpc('mi_empresa').maybeSingle<{ id: string; razon_social: string; nombre_comercial: string | null; cif: string }>();
    if (e) {
      const { data: prin } = await supabase.rpc('sitio_principal', { p_cliente: e.id });
      clientes = [{ id: e.id, nombre: e.nombre_comercial || e.razon_social, cif: e.cif, principal_id: (prin as string | null) ?? null }];
    }
  }

  return <Sitios filas={filas} clientes={clientes} dynamo={dynamo} error={error} />;
}
