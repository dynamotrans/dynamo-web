import { sesion, esDynamo, sinAcceso } from '@/lib/sesion';
import { vistaDe } from '@/lib/vista';
import AvisoCuenta from '@/components/panel/AvisoCuenta';
import Sitios, { type ClienteSitios } from '@/components/panel/Sitios';
import { cargarSitios } from '@/lib/sitiosDatos';
import { paginaDe } from '@/components/panel/Paginador';

export const dynamic = 'force-dynamic';

// Sitios: la agenda de recogidas y entregas (diseño de #sec-sitios de dashboard.html).
// Dynamo ve los de todos los clientes; un cliente, solo los suyos (lo impone la base de
// datos con los permisos por fila, no esta pantalla). Por páginas desde la base de datos
// (sitios_pagina): con 7.000 sitios la pantalla mandaba 10 MB. Buscador y cliente por la URL.
export default async function PaginaSitios({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const s = await sesion();
  if (!s) return null;
  const { supabase, perfil } = s;
  if (sinAcceso(perfil)) return <AvisoCuenta perfil={perfil} />;
  const dynamo = esDynamo(perfil.rol);
  if (!dynamo && perfil.rol !== 'cliente') {
    return <section className="section active"><div className="pt-aviso error" style={{ maxWidth: 640 }}><div>Esta sección es de los clientes y del equipo de Dynamo.</div></div></section>;
  }
  const sp = await searchParams;
  const q = (sp.q ?? '').trim().slice(0, 200);
  const { pagina, porPagina } = paginaDe(sp);
  const vista = await vistaDe(supabase, perfil.rol);
  // Dynamo: el cliente del filtro (?cliente=) o el de la vista «Ver como».
  const clienteFiltro = vista.tipo === 'cliente' ? vista.id : (sp.cliente && /^[0-9a-f-]{36}$/i.test(sp.cliente) ? sp.cliente : null);

  const { data: pg, error: ep } = await supabase.rpc('sitios_pagina', { p_q: q || null, p_cliente: clienteFiltro, p_pagina: pagina, p_por_pagina: porPagina });
  const ids = (pg ?? []).map((x) => x.id);
  const total = Number(pg?.[0]?.total ?? 0);
  const cargados = await cargarSitios(supabase, false, ids);
  const pos = new Map(ids.map((id, i) => [id, i]));
  const filas = cargados.filas.sort((a, b) => (pos.get(a.id) ?? 1e9) - (pos.get(b.id) ?? 1e9));

  // Clientes: los de los sitios de esta página (nombre y sitio principal) más el del filtro.
  // Para elegir otro cliente (filtro o ficha nueva) está el buscador.
  let clientes: ClienteSitios[] = [];
  if (dynamo) {
    const idsCli = [...new Set([...filas.map((f) => f.cliente_id), clienteFiltro].filter(Boolean))] as string[];
    const { data } = idsCli.length ? await supabase.from('clientes').select('id, nombre_visible, cif, sitio_principal_id').in('id', idsCli) : { data: [] };
    clientes = (data ?? []).map((c) => ({ id: c.id, nombre: c.nombre_visible ?? '', cif: c.cif, principal_id: c.sitio_principal_id }));
  } else {
    const { data: e } = await supabase.rpc('mi_empresa').maybeSingle<{ id: string; razon_social: string; nombre_comercial: string | null; cif: string }>();
    if (e) {
      const { data: prin } = await supabase.rpc('sitio_principal', { p_cliente: e.id });
      clientes = [{ id: e.id, nombre: e.nombre_comercial || e.razon_social, cif: e.cif, principal_id: (prin as string | null) ?? null }];
    }
  }

  return <Sitios filas={filas} clientes={clientes} dynamo={dynamo} error={ep?.message ?? cargados.error} veranoDefecto={cargados.veranoDefecto}
    lista={{ q, cliente: vista.tipo === 'cliente' ? '' : (clienteFiltro ?? ''), pagina, porPagina, total, vistaCliente: vista.tipo === 'cliente' }} />;
}
