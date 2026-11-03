import { sesion, esDynamo } from '@/lib/sesion';
import AvisoCuenta from '@/components/panel/AvisoCuenta';
import Sitios, { type SitioFila, type ClienteSitios } from '@/components/panel/Sitios';

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

  const [lug, con] = await Promise.all([
    supabase.from('lugares')
      .select('id, codigo, cliente_id, nombre_empresa, tipo, direccion, codigo_postal, poblacion, provincia, pais_codigo_iso, horarios, url_google_maps, anotaciones, requiere_cita, tiene_medios_carga, creado_en, modificado_en')
      .eq('borrado', false).eq('es_almacen_dynamo', false).order('nombre_empresa').limit(10000),
    supabase.from('contactos').select('lugar_id, nombre, telefono, email, es_principal, recibe_avisos').not('lugar_id', 'is', null).limit(50000),
  ]);

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

  const contactos = new Map<string, { nombre: string; telefono: string; emails: string[] }>();
  (con.data ?? []).forEach((c) => {
    const k = c.lugar_id as string;
    const x = contactos.get(k) ?? { nombre: '', telefono: '', emails: [] };
    if (c.es_principal) { x.nombre = c.nombre ?? ''; x.telefono = c.telefono ?? ''; }
    else if (c.recibe_avisos && c.email) x.emails.push(c.email);
    contactos.set(k, x);
  });
  const filas: SitioFila[] = (lug.data ?? []).map((l: any) => {
    const c = contactos.get(l.id);
    return {
      ...l, provincia: l.provincia ?? '', horarios: l.horarios ?? '', url_google_maps: l.url_google_maps ?? '',
      anotaciones: l.anotaciones ?? '', tipo: l.tipo ?? 'almacen_nave',
      contacto_nombre: c?.nombre === 'Contacto del sitio' ? '' : c?.nombre ?? '', contacto_telefono: c?.telefono ?? '',
      emails_avisos: (c?.emails ?? []).join(', '),
    };
  });
  return <Sitios filas={filas} clientes={clientes} dynamo={dynamo} error={lug.error?.message ?? null} />;
}
