import { sesion, esDynamo } from '@/lib/sesion';
import AvisoCuenta from '@/components/panel/AvisoCuenta';
import Sitios, { type SitioFila, type ClienteSitios } from '@/components/panel/Sitios';
import { contactosDe } from '@/lib/contactos';
import { gruposDe, type FilaHorario } from '@/lib/horarios';

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

  const [lug, con, hor] = await Promise.all([
    supabase.from('lugares')
      .select('id, codigo, cliente_id, nombre_empresa, tipo, direccion, codigo_postal, poblacion, provincia, pais_codigo_iso, horarios, url_google_maps, anotaciones, requiere_cita, tiene_medios_carga, emails_avisos, creado_en, modificado_en')
      .eq('borrado', false).eq('es_almacen_dynamo', false).order('nombre_empresa').limit(10000),
    supabase.from('contactos').select('id, lugar_id, nombre, cargo, funcion, telefono, email, recibe_avisos, es_principal, creado_en').not('lugar_id', 'is', null).limit(50000),
    supabase.from('lugar_horarios').select('lugar_id, dia_semana, abre, cierra').limit(100000),
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

  const horarioDe = new Map<string, FilaHorario[]>();
  (hor.data ?? []).forEach((h) => horarioDe.set(h.lugar_id as string, [...(horarioDe.get(h.lugar_id as string) ?? []), h as FilaHorario]));
  const porSitio = new Map<string, any[]>();
  (con.data ?? []).forEach((c) => porSitio.set(c.lugar_id as string, [...(porSitio.get(c.lugar_id as string) ?? []), c]));
  const filas: SitioFila[] = (lug.data ?? []).map((l: any) => {
    return {
      ...l, provincia: l.provincia ?? '', horarios: l.horarios ?? '', url_google_maps: l.url_google_maps ?? '',
      anotaciones: l.anotaciones ?? '', tipo: l.tipo ?? 'almacen_nave',
      contactos: contactosDe(porSitio.get(l.id) ?? []),
      horario: gruposDe(horarioDe.get(l.id) ?? []),
      emails_avisos: (l.emails_avisos ?? []).join(', '),
    };
  });
  return <Sitios filas={filas} clientes={clientes} dynamo={dynamo} error={lug.error?.message ?? null} />;
}
