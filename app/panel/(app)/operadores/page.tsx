import { leerTodo } from '@/lib/leerTodo';
import { sesion, esDynamo, sinAcceso } from '@/lib/sesion';
import { vistaDe, filtrarVista } from '@/lib/vista';
import AvisoCuenta from '@/components/panel/AvisoCuenta';
import Operadores, { type OperadorFila } from '@/components/panel/Operadores';

export const dynamic = 'force-dynamic';

// Transportistas propios del cliente («Operadores de transporte», catálogo PRIVADO de cada
// cliente): diseño de #sec-operadores de dashboard.html. Dynamo ve los de todos los clientes.
export default async function PaginaOperadores() {
  const s = await sesion();
  if (!s) return null;
  const { supabase, perfil } = s;
  if (sinAcceso(perfil)) return <AvisoCuenta perfil={perfil} />;
  const dynamo = esDynamo(perfil.rol);
  if (!dynamo && perfil.rol !== 'cliente') {
    return <section className="section active"><div className="pt-aviso error" style={{ maxWidth: 640 }}><div>Esta sección es de los clientes.</div></div></section>;
  }
  const vista = await vistaDe(supabase, perfil.rol);
  // Con «Ver como» un cliente, la pantalla es LA DEL CLIENTE: sin selector de cliente
  // (todo lo que se cree aquí es de ese cliente; lo resuelve la acción por la vista).
  const uiDynamo = dynamo && vista.tipo === 'admin';
  const [ops, envs, clis, logos] = await Promise.all([
    leerTodo(filtrarVista(supabase.from('operadores').select('id, cliente_id, razon_social, cif, telefono, email, persona_contacto, web, anotaciones, creado_en, modificado_en, clientes(nombre_visible)'), vista, { transportista: null })
      .eq('borrado', false).order('razon_social'), 10000),
    supabase.rpc('envios_por_empresa', { p_campo: 'operador' }),
    uiDynamo ? leerTodo(supabase.from('clientes').select('id, nombre_visible').order('nombre_visible'), 10000) : Promise.resolve({ data: [] as { id: string; nombre_visible: string }[] }),
    // El logo de cada transportista, para enseñarlo en el listado (usuario, 2026-11-14).
    leerTodo(supabase.from('documentos').select('id, operador_id, creado_en').eq('tipo', 'logo').eq('borrado', false).not('operador_id', 'is', null).order('creado_en', { ascending: false }), 10000),
  ]);
  const logoDe = new Map<string, string>();
  ((logos.data ?? []) as { id: string; operador_id: string | null }[]).forEach((l) => { if (l.operador_id && !logoDe.has(l.operador_id)) logoDe.set(l.operador_id, l.id); });
  const usos = new Map<string, number>();
  ((envs.data ?? []) as { id: string; envios: number }[]).forEach((e) => usos.set(e.id, Number(e.envios)));
  const filas: OperadorFila[] = (ops.data ?? []).map((o) => ({
    id: o.id, cliente_id: o.cliente_id, cliente: o.clientes?.nombre_visible ?? null, razon_social: o.razon_social, cif: o.cif,
    telefono: o.telefono ?? '', email: o.email ?? '', persona_contacto: o.persona_contacto ?? '', web: o.web ?? '', anotaciones: o.anotaciones ?? '',
    creado_en: o.creado_en, modificado_en: o.modificado_en, envios: usos.get(o.id) ?? 0, logo: logoDe.get(o.id) ?? null,
  }));
  return <Operadores filas={filas} dynamo={uiDynamo} clientes={clis.data ?? []} error={ops.error?.message ?? null} />;
}
