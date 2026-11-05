import { leerTodo } from '@/lib/leerTodo';
import { sesion, esDynamo } from '@/lib/sesion';
import { vistaDe, filtrarVista } from '@/lib/vista';
import AvisoCuenta from '@/components/panel/AvisoCuenta';
import Incidencias, { type IncidenciaFila } from '@/components/panel/Incidencias';
import { cargarEnviosLigeros, type EnvioLigero } from '@/lib/enviosLigeros';

export const dynamic = 'force-dynamic';

// Incidencias (Dynamo; y desde la etapa B, el cliente las suyas): diseño de #sec-incidencias de dashboard.html.
// `?nueva=<envío>` abre «Reportar incidencia» con ese envío ya elegido (desde su ficha).
export default async function PaginaIncidencias({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const s = await sesion();
  if (!s) return null;
  const { supabase, perfil } = s;
  if (!perfil || perfil.estado !== 'activa') return <AvisoCuenta perfil={perfil} />;
  const sp = await searchParams;
  // ---- Etapa B: el CLIENTE ve y abre las suyas (la base de datos solo le deja las suyas)
  if (!esDynamo(perfil.rol)) {
    if (perfil.rol !== 'cliente' && perfil.rol !== 'transportista') {
      return <section className="section active"><div className="pt-aviso info" style={{ maxWidth: 640 }}><div>Para cualquier incidencia, llámanos al +34 955 225 945 o escríbenos por WhatsApp al +34 628 995 709.</div></div></section>;
    }
    const esT = perfil.rol === 'transportista';
    const [inc, tipos, mis] = await Promise.all([
      leerTodo(supabase.from('incidencias').select('id, codigo, envio_id, cliente_id, tipo_id, titulo, detalle, estado, prioridad, resolucion, resuelto_en, creado_en, modificado_en, tipos_incidencia(nombre)')
        .order('creado_en', { ascending: false }), 2000),
      supabase.from('tipos_incidencia').select('id, clave, nombre, activo').order('orden'),
      leerTodo(supabase.rpc(esT ? 'mis_viajes' : 'mis_envios').neq('estado', 'borrador'), 3000),
    ]);
    const envios: EnvioLigero[] = ((mis.data ?? []) as any[]).map((e) => ({
      id: e.id, referencia_gx: e.referencia_gx, referencia_cliente: e.referencia_cliente, estado: e.estado, es_manual: e.es_manual,
      cliente_id: '', cliente: null, transportista_id: null, transportista: null,
      fecha_carga_desde: e.fecha_carga_desde, fecha_carga_hasta: e.fecha_carga_hasta, fecha_carga_real: e.fecha_carga_real, fecha_entrega_estimada: e.fecha_entrega_estimada,
      origen: [e.codigo_postal_origen, e.poblacion_origen].filter(Boolean).join(' '), destino: [e.codigo_postal_destino, e.poblacion_destino].filter(Boolean).join(' '),
      descripcion_mercancia: e.descripcion_mercancia, metros_lineales: e.metros_lineales, toneladas: e.toneladas,
      matricula_camion: e.matricula_camion, matricula_remolque: e.matricula_remolque, conductor_nombre: e.conductor_nombre,
      importe_cliente: esT ? e.importe_transportista : e.importe_cliente, importe_transportista: null,
    }));
    const porId = new Map(envios.map((e) => [e.id, e]));
    const filas: IncidenciaFila[] = (inc.data ?? []).map((x: any) => {
      const e = x.envio_id ? porId.get(x.envio_id) : null;
      return { id: x.id, codigo: x.codigo, envio_id: x.envio_id, cliente_id: x.cliente_id, tipo_id: x.tipo_id, tipo: x.tipos_incidencia?.nombre ?? '—',
        titulo: x.titulo, detalle: x.detalle, estado: x.estado, prioridad: x.prioridad, resolucion: x.resolucion, resuelto_en: x.resuelto_en,
        creado_en: x.creado_en, modificado_en: x.modificado_en, cliente: null,
        envio: e ? { referencia_gx: e.referencia_gx, referencia_cliente: e.referencia_cliente, fecha_carga_desde: e.fecha_carga_desde, fecha_carga_hasta: e.fecha_carga_hasta,
          origen: e.origen, destino: e.destino, metros_lineales: e.metros_lineales, toneladas: e.toneladas } : null };
    });
    return <Incidencias esCliente esTransportista={esT} filas={filas} tipos={(tipos.data ?? []) as any} clientes={[]} envios={envios}
      nuevaPara={sp.nueva ?? (sp.abrir ? '' : null)} error={inc.error?.message ?? null}
      tipoInicial={sp.tipo === 'siniestro' ? ((tipos.data ?? []) as any[]).find((t) => t.clave === 'siniestro')?.id ?? null : null} />;
  }
  const vista = await vistaDe(supabase, perfil.rol);
  const [inc, tipos, clientes, envios] = await Promise.all([
    leerTodo(filtrarVista(supabase.from('incidencias').select('id, codigo, envio_id, cliente_id, tipo_id, titulo, detalle, estado, prioridad, resolucion, resuelto_en, creado_en, modificado_en, ' +
      'tipos_incidencia(nombre), clientes(nombre_visible), envios(referencia_gx, referencia_cliente, fecha_carga_desde, fecha_carga_hasta, ' +
      'codigo_postal_origen, poblacion_origen, codigo_postal_destino, poblacion_destino, metros_lineales, toneladas)'), vista).order('creado_en', { ascending: false }), 5000),
    supabase.from('tipos_incidencia').select('id, clave, nombre, activo').order('orden'),
    leerTodo(supabase.from('clientes').select('id, nombre_visible').order('nombre_visible'), 10000),
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
    nuevaPara={sp.nueva ?? (sp.abrir ? '' : null)} error={inc.error?.message ?? null}
      tipoInicial={sp.tipo === 'siniestro' ? ((tipos.data ?? []) as any[]).find((t) => t.clave === 'siniestro')?.id ?? null : null} />;
}
