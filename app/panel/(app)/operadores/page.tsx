import { sesion, esDynamo } from '@/lib/sesion';
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
  const [ops, envs, clis] = await Promise.all([
    supabase.from('operadores').select('id, cliente_id, razon_social, cif, telefono, email, persona_contacto, web, anotaciones, creado_en, modificado_en, clientes(nombre_visible)')
      .eq('borrado', false).order('razon_social').limit(10000),
    supabase.from('envios').select('operador_id').eq('es_manual', true).not('operador_id', 'is', null).limit(100000),
    dynamo ? supabase.from('clientes').select('id, nombre_visible').order('nombre_visible').limit(10000) : Promise.resolve({ data: [] as any[] }),
  ]);
  const usos = new Map<string, number>();
  (envs.data ?? []).forEach((e: any) => usos.set(e.operador_id, (usos.get(e.operador_id) ?? 0) + 1));
  const filas: OperadorFila[] = (ops.data ?? []).map((o: any) => ({
    id: o.id, cliente_id: o.cliente_id, cliente: o.clientes?.nombre_visible ?? null, razon_social: o.razon_social, cif: o.cif,
    telefono: o.telefono ?? '', email: o.email ?? '', persona_contacto: o.persona_contacto ?? '', web: o.web ?? '', anotaciones: o.anotaciones ?? '',
    creado_en: o.creado_en, modificado_en: o.modificado_en, envios: usos.get(o.id) ?? 0,
  }));
  return <Operadores filas={filas} dynamo={dynamo} clientes={(clis.data ?? []) as any} error={ops.error?.message ?? null} />;
}
