import { sesion, esDynamo } from '@/lib/sesion';
import AvisoCuenta from '@/components/panel/AvisoCuenta';
import Incidencias, { type IncidenciaFila } from '@/components/panel/Incidencias';
import { cargarEnviosLigeros } from '@/lib/enviosLigeros';

export const dynamic = 'force-dynamic';

// Incidencias (solo Dynamo en la etapa A): diseño de #sec-incidencias de dashboard.html.
// `?nueva=<envío>` abre «Reportar incidencia» con ese envío ya elegido (desde su ficha).
export default async function PaginaIncidencias({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const s = await sesion();
  if (!s) return null;
  const { supabase, perfil } = s;
  if (!perfil || perfil.estado !== 'activa') return <AvisoCuenta perfil={perfil} />;
  if (!esDynamo(perfil.rol)) {
    return <section className="section active"><div className="pt-aviso error" style={{ maxWidth: 640 }}><div>Esta sección todavía es solo del equipo de Dynamo.</div></div></section>;
  }
  const sp = await searchParams;
  const [inc, tipos, clientes, envios] = await Promise.all([
    supabase.from('incidencias').select('id, codigo, envio_id, cliente_id, tipo_id, titulo, detalle, estado, prioridad, resolucion, resuelto_en, creado_en, modificado_en, ' +
      'tipos_incidencia(nombre), clientes(nombre_visible), envios(referencia_gx, referencia_cliente, fecha_carga_desde, fecha_carga_hasta, ' +
      'codigo_postal_origen, poblacion_origen, codigo_postal_destino, poblacion_destino, metros_lineales, toneladas)').order('creado_en', { ascending: false }).limit(5000),
    supabase.from('tipos_incidencia').select('id, nombre, activo').order('orden'),
    supabase.from('clientes').select('id, nombre_visible').order('nombre_visible').limit(10000),
    cargarEnviosLigeros(supabase),
  ]);
  const filas: IncidenciaFila[] = (inc.data ?? []).map((x: any) => ({
    id: x.id, codigo: x.codigo, envio_id: x.envio_id, cliente_id: x.cliente_id, tipo_id: x.tipo_id, tipo: x.tipos_incidencia?.nombre ?? '—',
    titulo: x.titulo, detalle: x.detalle, estado: x.estado, prioridad: x.prioridad, resolucion: x.resolucion, resuelto_en: x.resuelto_en,
    creado_en: x.creado_en, modificado_en: x.modificado_en, cliente: x.clientes?.nombre_visible ?? null,
    envio: x.envios ? {
      referencia_gx: x.envios.referencia_gx, referencia_cliente: x.envios.referencia_cliente,
      fecha_carga_desde: x.envios.fecha_carga_desde, fecha_carga_hasta: x.envios.fecha_carga_hasta,
      origen: [x.envios.codigo_postal_origen, x.envios.poblacion_origen].filter(Boolean).join(' '),
      destino: [x.envios.codigo_postal_destino, x.envios.poblacion_destino].filter(Boolean).join(' '),
      metros_lineales: x.envios.metros_lineales, toneladas: x.envios.toneladas,
    } : null,
  }));
  return <Incidencias filas={filas} tipos={(tipos.data ?? []) as any} clientes={(clientes.data ?? []) as any} envios={envios}
    nuevaPara={sp.nueva ?? (sp.abrir ? '' : null)} error={inc.error?.message ?? null} />;
}
