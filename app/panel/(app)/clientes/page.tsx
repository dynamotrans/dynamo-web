import { sesion, esDynamo } from '@/lib/sesion';
import AvisoCuenta from '@/components/panel/AvisoCuenta';
import Clientes, { type ClienteFila, type Bienvenida } from '@/components/panel/Clientes';

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

  const [cli, con, par, env] = await Promise.all([
    supabase.from('clientes').select('*').order('nombre_visible').limit(5000),
    supabase.from('contactos').select('cliente_id, nombre, telefono, email').eq('es_principal', true).not('cliente_id', 'is', null),
    supabase.from('parametros').select('clave, valor').in('clave', ['factor_bienvenida_pct', 'factor_bienvenida_envios']),
    // Envíos que cuentan para el descuento de bienvenida (mismo criterio que la base de datos).
    supabase.from('envios').select('cliente_id').eq('es_manual', false).not('estado', 'in', '(borrador,cancelado)').limit(100000),
  ]);
  const p = new Map((par.data ?? []).map((x) => [x.clave as string, Number(x.valor)]));
  const bienvenida: Bienvenida = { pct: p.get('factor_bienvenida_pct') ?? -7, envios: p.get('factor_bienvenida_envios') ?? 3 };
  const cuenta = new Map<string, number>();
  (env.data ?? []).forEach((e) => cuenta.set(e.cliente_id as string, (cuenta.get(e.cliente_id as string) ?? 0) + 1));
  const contactos = new Map((con.data ?? []).map((c) => [c.cliente_id as string, c]));
  const filas: ClienteFila[] = (cli.data ?? []).map((c: any) => {
    const k = contactos.get(c.id);
    return { ...c, contacto_nombre: k?.nombre ?? '', contacto_telefono: k?.telefono ?? '', contacto_email: k?.email ?? '', envios_que_cuentan: cuenta.get(c.id) ?? 0 };
  });
  return <Clientes filas={filas} bienvenida={bienvenida} error={cli.error?.message ?? null} />;
}
