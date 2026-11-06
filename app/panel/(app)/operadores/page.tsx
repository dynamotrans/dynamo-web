import { leerTodo } from '@/lib/leerTodo';
import { sesion, esDynamo } from '@/lib/sesion';
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
  if (!perfil || perfil.estado !== 'activa') return <AvisoCuenta perfil={perfil} />;
  const dynamo = esDynamo(perfil.rol);
  if (!dynamo && perfil.rol !== 'cliente') {
    return <section className="section active"><div className="pt-aviso error" style={{ maxWidth: 640 }}><div>Esta sección es de los clientes.</div></div></section>;
  }
  const vista = await vistaDe(supabase, perfil.rol);
  const [ops, envs, clis] = await Promise.all([
    leerTodo(filtrarVista(supabase.from('operadores').select('id, cliente_id, razon_social, cif, telefono, email, persona_contacto, web, anotaciones, creado_en, modificado_en, clientes(nombre_visible)'), vista, { transportista: null })
      .eq('borrado', false).order('razon_social'), 10000),
    supabase.rpc('envios_por_empresa', { p_campo: 'operador' }),
    dynamo ? leerTodo(supabase.from('clientes').select('id, nombre_visible').order('nombre_visible'), 10000) : Promise.resolve({ data: [] as any[] }),
  ]);
  const usos = new Map<string, number>();
  ((envs.data ?? []) as { id: string; envios: number }[]).forEach((e) => usos.set(e.id, Number(e.envios)));
  const filas: OperadorFila[] = (ops.data ?? []).map((o) => ({
    id: o.id, cliente_id: o.cliente_id, cliente: o.clientes?.nombre_visible ?? null, razon_social: o.razon_social, cif: o.cif,
    telefono: o.telefono ?? '', email: o.email ?? '', persona_contacto: o.persona_contacto ?? '', web: o.web ?? '', anotaciones: o.anotaciones ?? '',
    creado_en: o.creado_en, modificado_en: o.modificado_en, envios: usos.get(o.id) ?? 0,
  }));
  return <Operadores filas={filas} dynamo={dynamo} clientes={(clis.data ?? []) as any} error={ops.error?.message ?? null} />;
}
