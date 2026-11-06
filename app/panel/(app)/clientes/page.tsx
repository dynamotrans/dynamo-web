import { leerTodo } from '@/lib/leerTodo';
import { sesion, esDynamo } from '@/lib/sesion';
import AvisoCuenta from '@/components/panel/AvisoCuenta';
import Clientes, { type ClienteFila, type Bienvenida } from '@/components/panel/Clientes';
import { contactosDe, type FilaContacto } from '@/lib/contactos';
import { notasInternas } from '@/lib/notasInternas';

export const dynamic = 'force-dynamic';

// Catálogo de clientes (solo Dynamo): diseño de #sec-clientes de dashboard.html.
export default async function PaginaClientes({ searchParams }: { searchParams: Promise<{ ver?: string }> }) {
  const ver = (await searchParams).ver ?? null;
  const s = await sesion();
  if (!s) return null;
  const { supabase, perfil } = s;
  if (!perfil || perfil.estado !== 'activa') return <AvisoCuenta perfil={perfil} />;
  if (!esDynamo(perfil.rol)) {
    return <section className="section active"><div className="pt-aviso error" style={{ maxWidth: 640 }}><div>Esta sección es solo del equipo de Dynamo.</div></div></section>;
  }

  const [cli, con, par, env, emp, notas] = await Promise.all([
    leerTodo(supabase.from('clientes').select('*').order('nombre_visible'), 5000),
    leerTodo(supabase.from('contactos').select('id, cliente_id, nombre, cargo, funcion, telefono, email, recibe_avisos, es_principal, creado_en').not('cliente_id', 'is', null), 50000),
    supabase.from('parametros').select('clave, valor').in('clave', ['factor_bienvenida_pct', 'factor_bienvenida_envios']),
    // Envíos que cuentan para el descuento de bienvenida (mismo criterio que la base de datos).
    supabase.rpc('envios_por_empresa', { p_campo: 'cliente' }),
    supabase.from('usuarios').select('id, nombre, email').in('rol', ['admin', 'empleado']).order('nombre'),
    notasInternas(supabase, 'clientes'),
  ]);
  const empleados = (emp.data ?? []).map((u) => ({ id: u.id as string, nombre: (u.nombre || u.email) as string }));
  const p = new Map((par.data ?? []).map((x) => [x.clave as string, Number(x.valor)]));
  const bienvenida: Bienvenida = { pct: p.get('factor_bienvenida_pct') ?? -7, envios: p.get('factor_bienvenida_envios') ?? 3 };
  const cuenta = new Map<string, number>();
  ((env.data ?? []) as { id: string; envios: number }[]).forEach((e) => cuenta.set(e.id, Number(e.envios)));
  const porCliente = new Map<string, FilaContacto[]>();
  (con.data ?? []).forEach((c) => porCliente.set(c.cliente_id as string, [...(porCliente.get(c.cliente_id as string) ?? []), c]));
  const filas: ClienteFila[] = (cli.data ?? []).map((c) => {
    return { ...c, anotaciones: notas.get(c.id)?.anotaciones ?? null, contactos: contactosDe(porCliente.get(c.id) ?? []), envios_que_cuentan: cuenta.get(c.id) ?? 0 };
  });
  return <Clientes filas={filas} bienvenida={bienvenida} empleados={empleados} error={cli.error?.message ?? null} abrir={ver} />;
}
