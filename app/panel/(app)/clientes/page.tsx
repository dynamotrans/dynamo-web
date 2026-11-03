import { sesion, esDynamo } from '@/lib/sesion';
import AvisoCuenta from '@/components/panel/AvisoCuenta';
import Clientes, { type ClienteFila } from '@/components/panel/Clientes';

export const dynamic = 'force-dynamic';

// Catálogo de clientes (solo Dynamo): diseño de #sec-clientes de dashboard.html.
export default async function PaginaClientes() {
  const s = await sesion();
  if (!s) return null;
  const { supabase, perfil } = s;
  if (!perfil || perfil.estado !== 'activa') return <AvisoCuenta perfil={perfil} />;
  if (!esDynamo(perfil.rol)) {
    return <section className="section active"><div className="pt-aviso error" style={{ maxWidth: 640 }}><div>Esta sección es solo del equipo de Dynamo.</div></div></section>;
  }

  const [cli, con] = await Promise.all([
    supabase.from('clientes').select('*').order('nombre_visible').limit(5000),
    supabase.from('contactos').select('cliente_id, nombre, telefono, email').eq('es_principal', true).not('cliente_id', 'is', null),
  ]);
  const contactos = new Map((con.data ?? []).map((c) => [c.cliente_id as string, c]));
  const filas: ClienteFila[] = (cli.data ?? []).map((c: any) => {
    const k = contactos.get(c.id);
    return { ...c, contacto_nombre: k?.nombre ?? '', contacto_telefono: k?.telefono ?? '', contacto_email: k?.email ?? '' };
  });
  return <Clientes filas={filas} error={cli.error?.message ?? null} />;
}
