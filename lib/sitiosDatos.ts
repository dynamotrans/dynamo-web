import { leerTodo } from './leerTodo';
import type { SB } from '@/lib/supabase/cliente';
import type { SitioFila } from '@/components/panel/Sitios';
import { contactosDe } from './contactos';
import { gruposDe, VERANO_GENERICO, type FilaHorario, type FechasVerano } from './horarios';

// Carga los sitios (de los clientes) o los almacenes Dynamo con sus contactos y su
// horario, listos para la tabla y la ficha. La usan las páginas Sitios y Almacenes.
export async function cargarSitios(sb: SB, almacenes: boolean): Promise<{ filas: SitioFila[]; error: string | null; veranoDefecto: FechasVerano }> {
  const { data: sitios, error } = await leerTodo(sb.from('sitios')
    .select('id, codigo, cliente_id, nombre_empresa, tipo, direccion, codigo_postal, poblacion, provincia, pais_codigo_iso, horarios, horarios_verano, verano_activo, verano_desde, verano_hasta, url_google_maps, anotaciones, requiere_cita, tiene_medios_carga, emails_avisos, disponible, precio_almacenamiento_semana, precio_reparto, creado_en, modificado_en')
    .eq('borrado', false).eq('es_almacen_dynamo', almacenes).order('nombre_empresa'), 10000);
  const ids = (sitios ?? []).map((l) => l.id as string);
  // Almacenes: son pocos, se filtra por sus ids. Sitios: pueden ser miles (la lista de ids
  // no cabría en la dirección de la consulta), así que se piden todos los de sitios: los
  // permisos por fila ya dejan solo los que esta persona puede ver.
  const con0 = sb.from('contactos').select('id, sitio_id, nombre, cargo, funcion, telefono, email, recibe_avisos, es_principal, creado_en');
  const hor0 = sb.from('sitio_horarios').select('sitio_id, temporada, dia_semana, abre, cierra');
  const [con, hor] = !ids.length ? [{ data: [] }, { data: [] }] : await Promise.all(almacenes
    ? [leerTodo(con0.in('sitio_id', ids), 50000), leerTodo(hor0.in('sitio_id', ids), 100000)]
    : [leerTodo(con0.not('sitio_id', 'is', null), 50000), leerTodo(hor0, 200000)]);

  // Fechas genéricas del verano de los almacenes (Parámetros): las que se proponen al activarlo.
  // (con una función: la tabla Parámetros solo la lee Dynamo, y los clientes también lo necesitan)
  const { data: pv } = await sb.rpc('verano_sitios_fechas');
  const g = pv as { desde?: string; hasta?: string } | null;
  const veranoDefecto: FechasVerano = { desde: g?.desde ?? VERANO_GENERICO.desde, hasta: g?.hasta ?? VERANO_GENERICO.hasta };
  const horarioDe = new Map<string, FilaHorario[]>(), veranoDe = new Map<string, FilaHorario[]>();
  (hor.data ?? []).forEach((h) => {
    const m = h.temporada === 'verano' ? veranoDe : horarioDe;
    m.set(h.sitio_id, [...(m.get(h.sitio_id) ?? []), h as FilaHorario]);
  });
  const porSitio = new Map<string, any[]>();
  (con.data ?? []).forEach((c) => porSitio.set(c.sitio_id, [...(porSitio.get(c.sitio_id) ?? []), c]));

  const filas: SitioFila[] = (sitios ?? []).map((l) => ({
    ...l, cliente_id: l.cliente_id ?? '', provincia: l.provincia ?? '', horarios: l.horarios ?? '',
    url_google_maps: l.url_google_maps ?? '', anotaciones: l.anotaciones ?? '', tipo: l.tipo ?? 'almacen_nave',
    contactos: contactosDe(porSitio.get(l.id) ?? []),
    horario: gruposDe(horarioDe.get(l.id) ?? []),
    horarios_verano: l.horarios_verano ?? '',
    verano: { activo: !!l.verano_activo, desde: l.verano_desde ?? veranoDefecto.desde, hasta: l.verano_hasta ?? veranoDefecto.hasta, horario: gruposDe(veranoDe.get(l.id) ?? []) },
    emails_avisos: (l.emails_avisos ?? []).join(', '),
    ...(almacenes ? { almacen: { disponible: l.disponible, precio_almacenamiento_semana: l.precio_almacenamiento_semana, precio_reparto: l.precio_reparto } } : {}),
  }));
  return { filas, error: error?.message ?? null, veranoDefecto };
}
