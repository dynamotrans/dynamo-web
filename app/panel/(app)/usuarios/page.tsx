import { sesion, esDynamo } from '@/lib/sesion';
import AvisoCuenta from '@/components/panel/AvisoCuenta';
import Usuarios, { type UsuarioFila, type Empresa } from '@/components/panel/Usuarios';

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

  const [usu, cli, tra, con, env] = await Promise.all([
    supabase.from('usuarios').select('*').order('email').limit(10000),
    supabase.from('clientes').select('id, nombre_visible, cif').order('nombre_visible').limit(5000),
    supabase.from('transportistas').select('id, nombre_visible, cif').order('nombre_visible').limit(10000),
    supabase.rpc('conexiones_usuarios'),
    // Para las métricas de uso: quién creó cada envío y en qué quedó.
    supabase.from('envios').select('creado_por, estado, creado_en').not('creado_por', 'is', null).neq('estado', 'borrador').order('creado_en', { ascending: false }).limit(200000),
  ]);

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
    const c = conexiones.get(u.id); const m = uso.get(u.id);
    return {
      ...u, nombre: u.nombre ?? '', documento: u.documento ?? '', telefono: u.telefono ?? '', cargo: u.cargo ?? '',
      anotaciones: u.anotaciones ?? '', cliente_id: u.cliente_id ?? '', transportista_id: u.transportista_id ?? '',
      ultima_conexion: c?.ultima_conexion ?? null, email_confirmado: c?.email_confirmado ?? false,
      envios: m?.envios ?? 0, cancelados: m?.cancelados ?? 0, cancelados_ult10: m?.ult10 ?? 0,
    };
  });
  return <Usuarios filas={filas} clientes={clientes} transportistas={transportistas}
                   yo={{ id: perfil.id, rol: perfil.rol }} error={usu.error?.message ?? null} />;
}
