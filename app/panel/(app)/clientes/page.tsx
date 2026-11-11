import { sesion, esDynamo } from '@/lib/sesion';
import AvisoCuenta from '@/components/panel/AvisoCuenta';
import Clientes, { type ClienteFila, type Bienvenida } from '@/components/panel/Clientes';
import { contactosDe, type FilaContacto } from '@/lib/contactos';
import { notasInternas } from '@/lib/notasInternas';
import { paginaDe } from '@/components/panel/Paginador';

export const dynamic = 'force-dynamic';

// Catálogo de clientes (solo Dynamo): diseño de #sec-clientes de dashboard.html.
// Por páginas desde la base de datos (clientes_pagina); buscador y filtro por la URL.
export default async function PaginaClientes({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const ver = sp.ver && /^[0-9a-f-]{36}$/i.test(sp.ver) ? sp.ver : null;
  const s = await sesion();
  if (!s) return null;
  const { supabase, perfil } = s;
  if (!perfil || perfil.estado !== 'activa') return <AvisoCuenta perfil={perfil} />;
  if (!esDynamo(perfil.rol)) {
    return <section className="section active"><div className="pt-aviso error" style={{ maxWidth: 640 }}><div>Esta sección es solo del equipo de Dynamo.</div></div></section>;
  }
  const q = (sp.q ?? '').trim().slice(0, 200);
  const estado = ['activa', 'pendiente_verificacion', 'suspendida'].includes(sp.estado ?? '') ? sp.estado! : '';
  // Orden por USO (usuario, 2026-11-11): consultas de precio (30 días) o cancelaciones con coste.
  const orden = ['consultas', 'canceladas'].includes(sp.orden ?? '') ? sp.orden! : '';
  const { pagina, porPagina } = paginaDe(sp);

  const [{ data: pg, error: ep }, par, emp] = await Promise.all([
    supabase.rpc('clientes_pagina', { p_q: q || null, p_estado: estado || null, p_pagina: pagina, p_por_pagina: porPagina, p_orden: orden || null }),
    supabase.from('parametros').select('clave, valor').in('clave', ['factor_bienvenida_pct', 'factor_bienvenida_envios', 'sectores_cliente']),
    supabase.from('usuarios').select('id, nombre, email').in('rol', ['admin', 'empleado']).order('nombre'),
  ]);
  const ids = (pg ?? []).map((x) => x.id);
  const total = Number(pg?.[0]?.total ?? 0);
  const idsLeer = ver && !ids.includes(ver) ? [...ids, ver] : ids;
  const empleados = (emp.data ?? []).map((u) => ({ id: u.id as string, nombre: (u.nombre || u.email) as string }));
  const p = new Map((par.data ?? []).map((x) => [x.clave as string, Number(x.valor)]));
  const sectores = ((par.data ?? []).find((x) => x.clave === 'sectores_cliente')?.valor ?? []) as string[];
  const bienvenida: Bienvenida = { pct: p.get('factor_bienvenida_pct') ?? -7, envios: p.get('factor_bienvenida_envios') ?? 3 };

  let filas: ClienteFila[] = [];
  let error = ep?.message ?? null;
  if (idsLeer.length) {
    const [cli, con, env, notas, uso] = await Promise.all([
      supabase.from('clientes').select('*').in('id', idsLeer),
      supabase.from('contactos').select('id, cliente_id, nombre, cargo, funcion, telefono, email, recibe_avisos, es_principal, creado_en').in('cliente_id', idsLeer),
      // Envíos que cuentan para el descuento de bienvenida (mismo criterio que la base de datos).
      supabase.rpc('envios_hechos_de', { p_campo: 'cliente', p_ids: idsLeer }),
      notasInternas(supabase, 'clientes', idsLeer),
      // Contadores de uso (consultas / cancelaciones) para la columna «Uso» (usuario, 2026-11-11).
      supabase.rpc('uso_clientes', { p_ids: idsLeer }),
    ]);
    if (cli.error) error = cli.error.message;
    const cuenta = new Map((env.data ?? []).map((e) => [e.id, Number(e.envios)]));
    const usoDe = new Map((uso.data ?? []).map((u) => [u.cliente_id as string, u]));
    const porCliente = new Map<string, FilaContacto[]>();
    (con.data ?? []).forEach((c) => porCliente.set(c.cliente_id as string, [...(porCliente.get(c.cliente_id as string) ?? []), c]));
    const pos = new Map(ids.map((id, i) => [id, i]));
    filas = ((cli.data ?? []) as unknown as Omit<ClienteFila, 'contactos' | 'envios_que_cuentan' | 'uso'>[]).map((c) => ({ ...c, anotaciones: notas.get(c.id)?.anotaciones ?? '', contactos: contactosDe(porCliente.get(c.id) ?? []), envios_que_cuentan: cuenta.get(c.id) ?? 0, uso: usoDe.get(c.id) ?? null }))
      .sort((a, b) => (pos.get(a.id) ?? 1e9) - (pos.get(b.id) ?? 1e9));
  }
  return <Clientes filas={filas} bienvenida={bienvenida} empleados={empleados} error={error} abrir={ver} sectores={Array.isArray(sectores) ? sectores : []}
    lista={{ q, estado, orden, pagina, porPagina, total }} />;
}
