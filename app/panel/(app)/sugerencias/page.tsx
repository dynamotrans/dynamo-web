import { sesion, esDynamo, sinAcceso } from '@/lib/sesion';
import AvisoCuenta from '@/components/panel/AvisoCuenta';
import Sugerencias, { type SugerenciaFila } from '@/components/panel/Sugerencias';

export const dynamic = 'force-dynamic';

// Gestión interna → Sugerencias (solo el equipo de Dynamo): lo que mandan los usuarios desde
// Soporte (mejoras y fallos), con su estado. ?ver=<id> abre la ficha (enlace de la campana).
export default async function PaginaSugerencias({ searchParams }: { searchParams: Promise<{ ver?: string }> }) {
  const s = await sesion();
  if (!s) return null;
  const { supabase, perfil } = s;
  if (sinAcceso(perfil)) return <AvisoCuenta perfil={perfil} />;
  if (!esDynamo(perfil.rol)) {
    return <section className="section active"><div className="pt-aviso error" style={{ maxWidth: 640 }}><div>Esta sección es solo del equipo de Dynamo.</div></div></section>;
  }
  const sp = await searchParams;
  const { data, error } = await supabase.from('sugerencias')
    .select('id, numero, usuario_id, autor_email, cliente_id, transportista_id, texto, pagina, navegador, estado, nota_dynamo, revisada_por, revisada_en, creado_en')
    .order('creado_en', { ascending: false }).limit(3000);
  const filas = data ?? [];
  const ids = (k: 'usuario_id' | 'revisada_por' | 'cliente_id' | 'transportista_id') => [...new Set(filas.map((f) => f[k]).filter(Boolean))] as string[];
  const [us, cl, tr] = await Promise.all([
    ids('usuario_id').length + ids('revisada_por').length ? supabase.from('usuarios').select('id, nombre, email, rol').in('id', [...ids('usuario_id'), ...ids('revisada_por')]) : Promise.resolve({ data: [] }),
    ids('cliente_id').length ? supabase.from('clientes').select('id, razon_social').in('id', ids('cliente_id')) : Promise.resolve({ data: [] }),
    ids('transportista_id').length ? supabase.from('transportistas').select('id, razon_social').in('id', ids('transportista_id')) : Promise.resolve({ data: [] }),
  ]);
  const usuario = new Map((us.data ?? []).map((u: { id: string; nombre: string | null; email: string; rol: string }) => [u.id, u]));
  const empresa = new Map([...(cl.data ?? []), ...(tr.data ?? [])].map((x: { id: string; razon_social: string }) => [x.id, x.razon_social]));
  const lista: SugerenciaFila[] = filas.map((f) => {
    const u = f.usuario_id ? usuario.get(f.usuario_id) : undefined;
    const r = f.revisada_por ? usuario.get(f.revisada_por) : undefined;
    return {
      id: f.id, numero: Number(f.numero), texto: f.texto, pagina: f.pagina, navegador: f.navegador,
      estado: f.estado as SugerenciaFila['estado'], nota: f.nota_dynamo, creado_en: f.creado_en, revisada_en: f.revisada_en,
      autor: u?.nombre || null, email: u?.email ?? f.autor_email, rol: u?.rol ?? null,
      empresa: (f.cliente_id && empresa.get(f.cliente_id)) || (f.transportista_id && empresa.get(f.transportista_id)) || null,
      revisor: r ? r.nombre || r.email : null,
    };
  });
  return <Sugerencias filas={lista} verInicial={sp.ver && /^[0-9a-f-]{36}$/i.test(sp.ver) ? sp.ver : null} error={error?.message ?? null} />;
}
