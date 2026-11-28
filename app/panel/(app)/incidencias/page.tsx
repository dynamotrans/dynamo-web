import { leerTodo } from '@/lib/leerTodo';
import { sesion, esDynamo, sinAcceso } from '@/lib/sesion';
import { vistaDe, filtrarVista } from '@/lib/vista';
import AvisoCuenta from '@/components/panel/AvisoCuenta';
import Incidencias from '@/components/panel/Incidencias';
import { cargarEnviosLigeros, misEnviosLigerosPorId, type EnvioLigero } from '@/lib/enviosLigeros';
import { CONTACTO } from '@/lib/atencion';
import type { CambioPendiente } from '@/lib/envios';
import { paginaDe } from '@/components/panel/Paginador';
import { cargarIncidencias, filtrosDe } from './lista';
import type { SB } from '@/lib/supabase/cliente';

export const dynamic = 'force-dynamic';

// Cambios que todavía se pueden deshacer (usuario, 2026-11-25): los que corren ahora, con el
// código de su incidencia para nombrarla en el contador (aunque no esté en esta página).
type FilaPendiente = { fila_id: string; vence_en: string; tipo: string; autor: string | null; puede_anular: boolean; emails: number };
async function pendientesDe(sb: SB, datos: unknown): Promise<{ id: string; codigo: string; pendiente: CambioPendiente }[]> {
  const ps = (datos ?? []) as FilaPendiente[];
  if (!ps.length) return [];
  const { data } = await sb.from('incidencias').select('id, codigo').in('id', ps.map((x) => x.fila_id));
  const porId = new Map((data ?? []).map((f) => [f.id, f.codigo as string]));
  return ps.filter((x) => porId.has(x.fila_id))
    .map((x) => ({ id: x.fila_id, codigo: porId.get(x.fila_id)!, pendiente: { vence_en: x.vence_en, tipo: x.tipo, autor: x.autor, puede_anular: x.puede_anular, emails: x.emails } }));
}

// Incidencias (Dynamo; y desde la etapa B, el cliente las suyas): diseño de #sec-incidencias de dashboard.html.
// Por páginas desde la base de datos (usuario, 2026-11-28): pestaña, buscador y fecha por la URL.
// `?nueva=<envío>` abre «Reportar incidencia» con ese envío ya elegido (desde su ficha).
export default async function PaginaIncidencias({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const s = await sesion();
  if (!s) return null;
  const { supabase, perfil } = s;
  if (sinAcceso(perfil)) return <AvisoCuenta perfil={perfil} />;
  const sp = await searchParams;
  const f = filtrosDe(sp);
  const { pagina, porPagina } = paginaDe(sp, 20);
  // ---- Etapa B: el CLIENTE ve y abre las suyas (la base de datos solo le deja las suyas)
  if (!esDynamo(perfil.rol)) {
    if (perfil.rol !== 'cliente' && perfil.rol !== 'transportista') {
      return <section className="section active"><div className="pt-aviso info" style={{ maxWidth: 640 }}><div>Para cualquier incidencia, llámanos al {CONTACTO.telefono} o escríbenos por WhatsApp al {CONTACTO.whatsapp}.</div></div></section>;
    }
    const esT = perfil.rol === 'transportista';
    const [lista, tipos, rec, pend] = await Promise.all([
      cargarIncidencias(supabase, { tipo: 'propias', transportista: esT }, f, pagina, porPagina),
      supabase.from('tipos_incidencia').select('id, clave, nombre, activo').order('orden'),
      supabase.rpc('envios_pagina', { p_pestana: 'todas', p_pagina: 1, p_por_pagina: 40 }),
      supabase.rpc('cambios_deshacer_pendientes', { p_tabla: 'incidencias' }),
    ]);
    // Los 40 envíos más recientes (para elegir sin escribir) y los de sus incidencias; el resto
    // se busca en la base de datos al escribir (antes se mandaban hasta 3.000 al navegador).
    const ya = new Set(lista.envios.map((e) => e.id));
    const otros = ((rec.data ?? []) as { id: string }[]).map((x) => x.id).filter((id) => !ya.has(id));
    const envios: EnvioLigero[] = [...lista.envios, ...(otros.length ? await misEnviosLigerosPorId(supabase, otros, esT) : [])];
    return <Incidencias esCliente esTransportista={esT} filas={lista.filas} pendientes={await pendientesDe(supabase, pend.data)} tipos={tipos.data ?? []} clientes={[]} envios={envios}
      lista={{ ...f, pagina, porPagina, total: lista.total, abiertas: lista.abiertas, resueltas: lista.resueltas }}
      nuevaPara={sp.nueva ?? (sp.abrir ? '' : null)} error={lista.error}
      tipoInicial={sp.tipo === 'siniestro' ? (tipos.data ?? []).find((t) => t.clave === 'siniestro')?.id ?? null : null} />;
  }
  const vista = await vistaDe(supabase, perfil.rol);
  const [lista, tipos, clientes, envios, pend] = await Promise.all([
    cargarIncidencias(supabase, { tipo: 'dynamo', vista }, f, pagina, porPagina),
    supabase.from('tipos_incidencia').select('id, clave, nombre, activo').order('orden'),
    // En la vista de un transportista no hay cliente que elegir: ni se cargan.
    vista.tipo === 'transportista' ? Promise.resolve({ data: [] as { id: string; nombre_visible: string }[], error: null })
      : leerTodo(filtrarVista(supabase.from('clientes').select('id, nombre_visible'), vista, { cliente: 'id', transportista: null }).order('nombre_visible'), 10000),
    cargarEnviosLigeros(supabase, 40, vista.tipo === 'cliente' ? { cliente: vista.id } : vista.tipo === 'transportista' ? { transportista: vista.id } : undefined),
    supabase.rpc('cambios_deshacer_pendientes', { p_tabla: 'incidencias' }),
  ]);
  return <Incidencias filas={lista.filas} pendientes={await pendientesDe(supabase, pend.data)} tipos={tipos.data ?? []} clientes={clientes.data ?? []} envios={envios} vistaTransportista={vista.tipo === 'transportista'}
    lista={{ ...f, pagina, porPagina, total: lista.total, abiertas: lista.abiertas, resueltas: lista.resueltas }}
    nuevaPara={sp.nueva ?? (sp.abrir ? '' : null)} error={lista.error}
    tipoInicial={sp.tipo === 'siniestro' ? (tipos.data ?? []).find((t) => t.clave === 'siniestro')?.id ?? null : null} />;
}
