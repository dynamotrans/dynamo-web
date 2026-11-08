import { leerTodo } from '@/lib/leerTodo';
import { sesion, esDynamo } from '@/lib/sesion';
import { vistaDe, filtrarVista } from '@/lib/vista';
import AvisoCuenta from '@/components/panel/AvisoCuenta';
import Incidencias, { type IncidenciaFila } from '@/components/panel/Incidencias';
import { cargarEnviosLigeros, misEnviosLigerosPorId, type EnvioLigero } from '@/lib/enviosLigeros';
import { CONTACTO } from '@/lib/atencion';

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
      return <section className="section active"><div className="pt-aviso info" style={{ maxWidth: 640 }}><div>Para cualquier incidencia, llámanos al {CONTACTO.telefono} o escríbenos por WhatsApp al {CONTACTO.whatsapp}.</div></div></section>;
    }
    const esT = perfil.rol === 'transportista';
    const [inc, tipos, rec] = await Promise.all([
      leerTodo(supabase.from('incidencias').select('id, codigo, envio_id, cliente_id, tipo_id, titulo, detalle, estado, prioridad, resolucion, resuelto_en, creado_en, modificado_en, tipos_incidencia(nombre)')
        .order('creado_en', { ascending: false }), 2000),
      supabase.from('tipos_incidencia').select('id, clave, nombre, activo').order('orden'),
      supabase.rpc('envios_pagina', { p_pestana: 'todas', p_pagina: 1, p_por_pagina: 40 }),
    ]);
    // Los 40 envíos más recientes (para elegir sin escribir) y los de sus incidencias; el resto
    // se busca en la base de datos al escribir (antes se mandaban hasta 3.000 al navegador).
    const ids = [...new Set([...((rec.data ?? []) as { id: string }[]).map((x) => x.id), ...(inc.data ?? []).map((x) => x.envio_id).filter(Boolean)])];
    const envios: EnvioLigero[] = await misEnviosLigerosPorId(supabase, ids, esT);
    const porId = new Map(envios.map((e) => [e.id, e]));
    const filas: IncidenciaFila[] = (inc.data ?? []).map((x) => {
      const e = x.envio_id ? porId.get(x.envio_id) : null;
      return { id: x.id, codigo: x.codigo, envio_id: x.envio_id, cliente_id: x.cliente_id, tipo_id: x.tipo_id, tipo: x.tipos_incidencia?.nombre ?? '—',
        titulo: x.titulo, detalle: x.detalle, estado: x.estado, prioridad: x.prioridad, resolucion: x.resolucion, resuelto_en: x.resuelto_en,
        creado_en: x.creado_en, modificado_en: x.modificado_en, cliente: null,
        envio: e ? { referencia_gx: e.referencia_gx, referencia_cliente: e.referencia_cliente, fecha_carga_desde: e.fecha_carga_desde, fecha_carga_hasta: e.fecha_carga_hasta,
          origen: e.origen, destino: e.destino, metros_lineales: e.metros_lineales, toneladas: e.toneladas } : null };
    });
    return <Incidencias esCliente esTransportista={esT} filas={filas} tipos={tipos.data ?? []} clientes={[]} envios={envios}
      nuevaPara={sp.nueva ?? (sp.abrir ? '' : null)} error={inc.error?.message ?? null}
      tipoInicial={sp.tipo === 'siniestro' ? (tipos.data ?? []).find((t) => t.clave === 'siniestro')?.id ?? null : null} />;
  }
  const vista = await vistaDe(supabase, perfil.rol);
  const [inc, tipos, clientes, envios] = await Promise.all([
    leerTodo(filtrarVista(supabase.from('incidencias').select('id, codigo, envio_id, cliente_id, tipo_id, titulo, detalle, estado, prioridad, resolucion, resuelto_en, creado_en, modificado_en, ' +
      'tipos_incidencia(nombre), clientes(nombre_visible), envios(referencia_gx, referencia_cliente, fecha_carga_desde, fecha_carga_hasta, ' +
      'codigo_postal_origen, poblacion_origen, codigo_postal_destino, poblacion_destino, metros_lineales, toneladas)'), vista).order('creado_en', { ascending: false }), 5000),
    supabase.from('tipos_incidencia').select('id, clave, nombre, activo').order('orden'),
    // En la vista de un transportista no hay cliente que elegir: ni se cargan.
    vista.tipo === 'transportista' ? Promise.resolve({ data: [] as { id: string; nombre_visible: string }[], error: null })
      : leerTodo(filtrarVista(supabase.from('clientes').select('id, nombre_visible'), vista, { cliente: 'id', transportista: null }).order('nombre_visible'), 10000),
    cargarEnviosLigeros(supabase, 40, vista.tipo === 'cliente' ? { cliente: vista.id } : vista.tipo === 'transportista' ? { transportista: vista.id } : undefined),
  ]);
  const filas: IncidenciaFila[] = (inc.data ?? []).map((x) => ({
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
  return <Incidencias filas={filas} tipos={tipos.data ?? []} clientes={clientes.data ?? []} envios={envios} vistaTransportista={vista.tipo === 'transportista'}
    nuevaPara={sp.nueva ?? (sp.abrir ? '' : null)} error={inc.error?.message ?? null}
      tipoInicial={sp.tipo === 'siniestro' ? (tipos.data ?? []).find((t) => t.clave === 'siniestro')?.id ?? null : null} />;
}
