import { sesion, esDynamo, sinAcceso } from '@/lib/sesion';
import AvisoCuenta from '@/components/panel/AvisoCuenta';
import Usuarios, { type UsuarioFila, type Conteos } from '@/components/panel/Usuarios';
import { notasInternas } from '@/lib/notasInternas';
import { paginaDe } from '@/components/panel/Paginador';

export const dynamic = 'force-dynamic';

// Catálogo de usuarios (solo Dynamo): diseño de #sec-usuarios de dashboard.html.
// Por páginas desde la base de datos (usuarios_pagina): antes mandaba ~700 KB (todos los
// usuarios + todos los clientes + todos los transportistas). Buscador y filtros por la URL.
export default async function PaginaUsuarios({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const s = await sesion();
  if (!s) return null;
  const { supabase, perfil } = s;
  if (sinAcceso(perfil)) return <AvisoCuenta perfil={perfil} />;
  if (!esDynamo(perfil.rol)) {
    return <section className="section active"><div className="pt-aviso error" style={{ maxWidth: 640 }}><div>Esta sección es solo del equipo de Dynamo.</div></div></section>;
  }
  const sp = await searchParams;
  const q = (sp.q ?? '').trim().slice(0, 200);
  const rol = ['admin', 'empleado', 'admin_lectura', 'empleado_lectura', 'cliente', 'transportista'].includes(sp.rol ?? '') ? sp.rol! : '';
  const estado = ['activa', 'pendiente_verificacion', 'suspendida', 'suspendida_auto', 'suspendida_total', 'invitacion'].includes(sp.estado ?? '') ? sp.estado! : '';
  const { pagina, porPagina } = paginaDe(sp, 50);

  const [pg, cnt, con, env, met, cTotal] = await Promise.all([
    supabase.rpc('usuarios_pagina', { p_q: q || null, p_rol: rol || null, p_estado: estado || null, p_pagina: pagina, p_por_pagina: porPagina }),
    supabase.rpc('usuarios_conteos'),
    supabase.rpc('conexiones_usuarios'),
    supabase.rpc('uso_envios_usuarios'),
    supabase.rpc('metricas_usuarios'),
    // Conteo de la suspensión total (usuario, 2026-11-14): usuarios_conteos no la trae.
    supabase.from('usuarios').select('id', { count: 'exact', head: true }).eq('estado', 'suspendida_total'),
  ]);
  const ids = (pg.data ?? []).map((x) => x.id);
  const total = Number(pg.data?.[0]?.total ?? 0);
  const empresaDe = new Map((pg.data ?? []).map((x) => [x.id, (x.empresa ?? '') as string]));
  const metr = new Map(((met.data ?? []) as { id: string; consultas: number; min_dia: number; min_semana: number; ultimo_latido: string | null }[]).map((x) => [x.id, x]));
  const conexiones = new Map(((con.data ?? []) as { id: string; ultima_conexion: string | null; email_confirmado: boolean }[]).map((c) => [c.id, c]));
  const uso = new Map<string, { envios: number; cancelados: number; ult10: number }>();
  ((env.data ?? []) as { usuario_id: string; envios: number; cancelados: number; cancelados_ult10: number }[]).forEach((e) => {
    uso.set(e.usuario_id, { envios: Number(e.envios), cancelados: Number(e.cancelados), ult10: Number(e.cancelados_ult10) });
  });

  let filas: UsuarioFila[] = [];
  let error = pg.error?.message ?? null;
  if (ids.length) {
    const [usu, notas] = await Promise.all([
      supabase.from('usuarios').select('*').in('id', ids),
      notasInternas(supabase, 'usuarios', ids),
    ]);
    if (usu.error) error = usu.error.message;
    const pos = new Map(ids.map((id, i) => [id, i]));
    filas = (usu.data ?? []).map((u) => {
      const c = conexiones.get(u.id); const m = uso.get(u.id); const t = metr.get(u.id);
      const ult = [c?.ultima_conexion, t?.ultimo_latido].filter(Boolean).sort().pop() ?? null;
      return {
        ...u, nombre: u.nombre ?? '', documento: u.documento ?? '', telefono: u.telefono ?? '', cargo: u.cargo ?? '',
        anotaciones: notas.get(u.id)?.anotaciones ?? '', cliente_id: u.cliente_id ?? '', transportista_id: u.transportista_id ?? '',
        empresa: empresaDe.get(u.id) ?? '',
        ultima_conexion: ult, email_confirmado: c?.email_confirmado ?? false,
        envios: m?.envios ?? 0, cancelados: m?.cancelados ?? 0, cancelados_ult10: m?.ult10 ?? 0,
        consultas: Number(t?.consultas ?? 0), min_dia: t?.min_dia ?? 0, min_semana: t?.min_semana ?? 0,
        copias: (u.emails_copia_avisos ?? []).join(', '), exento_autosuspension: !!u.exento_autosuspension,
        suspension_motivo: u.suspension_motivo ?? null, suspendida_en: u.suspendida_en ?? null,
      };
    }).sort((a, b) => (pos.get(a.id) ?? 1e9) - (pos.get(b.id) ?? 1e9)) as unknown as UsuarioFila[];
  }
  const c0 = (cnt.data ?? [])[0] as Conteos | undefined;
  const conteos: Conteos = {
    total: Number(c0?.total ?? 0), activa: Number(c0?.activa ?? 0), pendiente: Number(c0?.pendiente ?? 0),
    suspendida: Number(c0?.suspendida ?? 0), suspendida_auto: Number(c0?.suspendida_auto ?? 0), suspendida_total: Number(cTotal?.count ?? 0), invitacion: Number(c0?.invitacion ?? 0),
  };
  return <Usuarios filas={filas} yo={{ id: perfil.id, rol: perfil.rol }} error={error}
    conteos={conteos} lista={{ q, rol, estado, pagina, porPagina, total }} />;
}
