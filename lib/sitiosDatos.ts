import type { SupabaseClient } from '@supabase/supabase-js';
import type { SitioFila } from '@/components/panel/Sitios';
import { contactosDe } from './contactos';
import { gruposDe, type FilaHorario } from './horarios';

// Carga los sitios (de los clientes) o los almacenes Dynamo con sus contactos y su
// horario, listos para la tabla y la ficha. La usan las páginas Sitios y Almacenes.
export async function cargarLugares(sb: SupabaseClient, almacenes: boolean): Promise<{ filas: SitioFila[]; error: string | null }> {
  const { data: lugares, error } = await sb.from('lugares')
    .select('id, codigo, cliente_id, nombre_empresa, tipo, direccion, codigo_postal, poblacion, provincia, pais_codigo_iso, horarios, url_google_maps, anotaciones, requiere_cita, tiene_medios_carga, emails_avisos, disponible, precio_almacenamiento_semana, precio_reparto, creado_en, modificado_en')
    .eq('borrado', false).eq('es_almacen_dynamo', almacenes).order('nombre_empresa').limit(10000);
  const ids = (lugares ?? []).map((l) => l.id as string);
  // Almacenes: son pocos, se filtra por sus ids. Sitios: pueden ser miles (la lista de ids
  // no cabría en la dirección de la consulta), así que se piden todos los de sitios: los
  // permisos por fila ya dejan solo los que esta persona puede ver.
  const con0 = sb.from('contactos').select('id, lugar_id, nombre, cargo, funcion, telefono, email, recibe_avisos, es_principal, creado_en');
  const hor0 = sb.from('lugar_horarios').select('lugar_id, dia_semana, abre, cierra');
  const [con, hor] = !ids.length ? [{ data: [] }, { data: [] }] : await Promise.all(almacenes
    ? [con0.in('lugar_id', ids).limit(50000), hor0.in('lugar_id', ids).limit(100000)]
    : [con0.not('lugar_id', 'is', null).limit(50000), hor0.limit(200000)]);

  const horarioDe = new Map<string, FilaHorario[]>();
  (hor.data ?? []).forEach((h: any) => horarioDe.set(h.lugar_id, [...(horarioDe.get(h.lugar_id) ?? []), h as FilaHorario]));
  const porSitio = new Map<string, any[]>();
  (con.data ?? []).forEach((c: any) => porSitio.set(c.lugar_id, [...(porSitio.get(c.lugar_id) ?? []), c]));

  const filas: SitioFila[] = (lugares ?? []).map((l: any) => ({
    ...l, cliente_id: l.cliente_id ?? '', provincia: l.provincia ?? '', horarios: l.horarios ?? '',
    url_google_maps: l.url_google_maps ?? '', anotaciones: l.anotaciones ?? '', tipo: l.tipo ?? 'almacen_nave',
    contactos: contactosDe(porSitio.get(l.id) ?? []),
    horario: gruposDe(horarioDe.get(l.id) ?? []),
    emails_avisos: (l.emails_avisos ?? []).join(', '),
    ...(almacenes ? { almacen: { disponible: l.disponible, precio_almacenamiento_semana: l.precio_almacenamiento_semana, precio_reparto: l.precio_reparto } } : {}),
  }));
  return { filas, error: error?.message ?? null };
}
