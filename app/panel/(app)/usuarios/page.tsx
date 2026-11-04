import { sesion, esDynamo } from '@/lib/sesion';
import AvisoCuenta from '@/components/panel/AvisoCuenta';
import Usuarios, { type UsuarioFila, type Empresa } from '@/components/panel/Usuarios';
import { notasInternas } from '@/lib/notasInternas';

export const dynamic = 'force-dynamic';

// Catálogo de usuarios (solo Dynamo): diseño de #sec-usuarios de dashboard.html.
export default async function PaginaUsuarios() {
  const s = await sesion();
  if (!s) return null;
  const { supabase, perfil } = s;
  if (!perfil || perfil.estado !== 'activa') return <AvisoCuenta perfil={perfil} />;
  if (!esDynamo(perfil.rol)) {
    return <section className="section active"><div className="pt-aviso error" style={{ maxWidth: 640 }}><div>Esta sección es solo del equipo de Dynamo.</div></div></section>;
  }

  const [usu, cli, tra, con, env, met, notas] = await Promise.all([
    supabase.from('usuarios').select('*').order('email').limit(10000),
    supabase.from('clientes').select('id, nombre_visible, cif').order('nombre_visible').limit(5000),
    supabase.from('transportistas').select('id, nombre_visible, cif').order('nombre_visible').limit(10000),
    supabase.rpc('conexiones_usuarios'),
    // Para las métricas de uso: quién creó cada envío y en qué quedó.
    supabase.from('envios').select('creado_por, estado, creado_en').not('creado_por', 'is', null).neq('estado', 'borrador').order('creado_en', { ascending: false }).limit(200000),
    // Consultas de precio y tiempo conectado (migración usuarios_metricas).
    supabase.rpc('metricas_usuarios'),
    notasInternas(supabase, 'usuarios'),
  ]);
  const metr = new Map(((met.data ?? []) as { id: string; consultas: number; min_dia: number; min_semana: number; ultimo_latido: string | null }[]).map((x) => [x.id, x]));

  const conexiones = new Map(((con.data ?? []) as { id: string; ultima_conexion: string | null; email_confirmado: boolean }[]).map((c) => [c.id, c]));
  const uso = new Map<string, { envios: number; cancelados: number; ult10: number; vistos: number }>();
  (env.data ?? []).forEach((e) => {
    const k = e.creado_por as string;
    const x = uso.get(k) ?? { envios: 0, cancelados: 0, ult10: 0, vistos: 0 };
    x.envios++;
    if (e.estado === 'cancelado') { x.cancelados++; if (x.vistos < 10) x.ult10++; }
    x.vistos++;                       // vienen del más nuevo al más viejo
    uso.set(k, x);
  });
  const clientes: Empresa[] = (cli.data ?? []).map((c) => ({ id: c.id, nombre: c.nombre_visible, cif: c.cif }));
  const transportistas: Empresa[] = (tra.data ?? []).map((t) => ({ id: t.id, nombre: t.nombre_visible, cif: t.cif }));
  const filas: UsuarioFila[] = (usu.data ?? []).map((u: any) => {
    const c = conexiones.get(u.id); const m = uso.get(u.id); const t = metr.get(u.id);
    // Última conexión: lo último entre entrar (login) y estar con el panel abierto.
    const ult = [c?.ultima_conexion, t?.ultimo_latido].filter(Boolean).sort().pop() ?? null;
    return {
      ...u, nombre: u.nombre ?? '', documento: u.documento ?? '', telefono: u.telefono ?? '', cargo: u.cargo ?? '',
      anotaciones: notas.get(u.id)?.anotaciones ?? '', cliente_id: u.cliente_id ?? '', transportista_id: u.transportista_id ?? '',
      ultima_conexion: ult, email_confirmado: c?.email_confirmado ?? false,
      envios: m?.envios ?? 0, cancelados: m?.cancelados ?? 0, cancelados_ult10: m?.ult10 ?? 0,
      consultas: Number(t?.consultas ?? 0), min_dia: t?.min_dia ?? 0, min_semana: t?.min_semana ?? 0,
      copias: (u.copias_avisos ?? []).join(', '), sin_autosuspension: !!u.sin_autosuspension,
      suspension_motivo: u.suspension_motivo ?? null, suspendida_en: u.suspendida_en ?? null,
    };
  });
  return <Usuarios filas={filas} clientes={clientes} transportistas={transportistas}
                   yo={{ id: perfil.id, rol: perfil.rol }} error={usu.error?.message ?? null} />;
}
