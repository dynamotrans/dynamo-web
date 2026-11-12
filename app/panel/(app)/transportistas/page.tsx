import { sesion, esDynamo } from '@/lib/sesion';
import AvisoCuenta from '@/components/panel/AvisoCuenta';
import Transportistas, { type TransportistaFila } from '@/components/panel/Transportistas';
import { contactosDe, type FilaContacto } from '@/lib/contactos';
import { notasInternas } from '@/lib/notasInternas';
import { paginaDe } from '@/components/panel/Paginador';

export const dynamic = 'force-dynamic';

// Catálogo de transportistas (solo Dynamo): diseño de #sec-transportistas de dashboard.html.
// Por páginas desde la base de datos (transportistas_pagina): con 20.000 transportistas la
// pantalla mandaba 22 MB al navegador. Buscador y filtros van por la URL (?q, ?estado, ?adr).
export default async function PaginaTransportistas({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const s = await sesion();
  if (!s) return null;
  const { supabase, perfil } = s;
  if (!perfil || perfil.estado !== 'activa') return <AvisoCuenta perfil={perfil} />;
  if (!esDynamo(perfil.rol)) {
    return <section className="section active"><div className="pt-aviso error" style={{ maxWidth: 640 }}><div>Esta sección es solo del equipo de Dynamo.</div></div></section>;
  }
  const sp = await searchParams;
  const q = (sp.q ?? '').trim().slice(0, 200);
  const estado = ['activo', 'no_ofertar', 'suspendido'].includes(sp.estado ?? '') ? sp.estado! : '';
  const adr = ['si', 'no'].includes(sp.adr ?? '') ? sp.adr! : '';
  const { pagina, porPagina } = paginaDe(sp);
  const ver = sp.ver && /^[0-9a-f-]{36}$/i.test(sp.ver) ? sp.ver : undefined;

  const { data: pg, error: ep } = await supabase.rpc('transportistas_pagina', { p_q: q || null, p_estado: estado || null, p_adr: adr || null, p_pagina: pagina, p_por_pagina: porPagina });
  const ids = (pg ?? []).map((x) => x.id);
  const total = Number(pg?.[0]?.total ?? 0);
  // La ficha abierta (?ver=) puede no estar en la página: se trae aparte.
  const idsLeer = ver && !ids.includes(ver) ? [...ids, ver] : ids;

  let filas: TransportistaFila[] = [];
  let error = ep?.message ?? null;
  if (idsLeer.length) {
    const [tra, con, flo, env, notas] = await Promise.all([
      supabase.from('transportistas').select('*').in('id', idsLeer),
      supabase.from('contactos').select('id, transportista_id, nombre, cargo, funcion, telefono, email, recibe_avisos, es_principal, creado_en').in('transportista_id', idsLeer),
      supabase.rpc('transportistas_flota', { p_ids: idsLeer }),
      supabase.rpc('envios_hechos_de', { p_campo: 'transportista', p_ids: idsLeer }),
      notasInternas(supabase, 'transportistas', idsLeer),
    ]);
    if (tra.error) error = tra.error.message;
    const porTransportista = new Map<string, FilaContacto[]>();
    (con.data ?? []).forEach((c) => porTransportista.set(c.transportista_id as string, [...(porTransportista.get(c.transportista_id as string) ?? []), c]));
    const flota = new Map((flo.data ?? []).map((f) => [f.transportista_id, { tractoras: f.tractoras, rigidos: f.rigidos, remolques: f.remolques, adr: !!f.adr, matriculas: f.matriculas ?? [] }]));
    const envios = new Map((env.data ?? []).map((e) => [e.id, Number(e.envios)]));
    const pos = new Map(ids.map((id, i) => [id, i]));
    filas = ((tra.data ?? []) as unknown as Omit<TransportistaFila, 'contactos' | 'flota' | 'envios'>[]).map((t) => ({
      ...t,
      anotaciones: notas.get(t.id)?.anotaciones ?? '', anotaciones_incidencias: notas.get(t.id)?.anotaciones_incidencias ?? '',
      contactos: contactosDe(porTransportista.get(t.id) ?? []),
      flota: flota.get(t.id) ?? { tractoras: 0, rigidos: 0, remolques: 0, adr: false, matriculas: [] },
      envios: envios.get(t.id) ?? 0,
    })).sort((a, b) => (pos.get(a.id) ?? 1e9) - (pos.get(b.id) ?? 1e9));
  }
  return <Transportistas filas={filas} error={error} abrirId={ver} admin={perfil.rol === 'admin'} lista={{ q, estado, adr, pagina, porPagina, total }} />;
}
