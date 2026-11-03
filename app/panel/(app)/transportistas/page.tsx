import { sesion, esDynamo } from '@/lib/sesion';
import AvisoCuenta from '@/components/panel/AvisoCuenta';
import Transportistas, { type TransportistaFila } from '@/components/panel/Transportistas';

export const dynamic = 'force-dynamic';

// Catálogo de transportistas (solo Dynamo): diseño de #sec-transportistas de dashboard.html.
export default async function PaginaTransportistas() {
  const s = await sesion();
  if (!s) return null;
  const { supabase, perfil } = s;
  if (!perfil || perfil.estado !== 'activa') return <AvisoCuenta perfil={perfil} />;
  if (!esDynamo(perfil.rol)) {
    return <section className="section active"><div className="pt-aviso error" style={{ maxWidth: 640 }}><div>Esta sección es solo del equipo de Dynamo.</div></div></section>;
  }

  const [tra, con, veh, env] = await Promise.all([
    supabase.from('transportistas').select('*').order('nombre_visible').limit(10000),
    supabase.from('contactos').select('transportista_id, funcion, nombre, telefono, email').eq('es_principal', true).not('transportista_id', 'is', null).limit(50000),
    supabase.from('vehiculos').select('transportista_id, matricula, tipo, adr').eq('activo', true).not('transportista_id', 'is', null).limit(50000),
    // Envíos hechos con cada transportista (lo que cuenta: no borradores ni cancelados).
    supabase.from('envios').select('transportista_id').not('transportista_id', 'is', null).not('estado', 'in', '(borrador,cancelado)').limit(200000),
  ]);

  const contactos = new Map<string, { nombre: string; telefono: string; trafico: string; conta: string }>();
  (con.data ?? []).forEach((c) => {
    const k = c.transportista_id as string;
    const x = contactos.get(k) ?? { nombre: '', telefono: '', trafico: '', conta: '' };
    if (c.funcion === 'contabilidad') x.conta = c.email ?? '';
    else if (c.funcion === 'trafico') { x.nombre = c.nombre === 'Tráfico' ? '' : c.nombre ?? ''; x.telefono = c.telefono ?? ''; x.trafico = c.email ?? ''; }
    contactos.set(k, x);
  });
  const flota = new Map<string, { tractoras: number; rigidos: number; remolques: number; adr: boolean; matriculas: string[] }>();
  (veh.data ?? []).forEach((v) => {
    const k = v.transportista_id as string;
    const x = flota.get(k) ?? { tractoras: 0, rigidos: 0, remolques: 0, adr: false, matriculas: [] };
    if (v.tipo === 'tractora') x.tractoras++; else if (v.tipo === 'rigido') x.rigidos++; else x.remolques++;
    x.adr = x.adr || !!v.adr; x.matriculas.push(v.matricula);
    flota.set(k, x);
  });
  const envios = new Map<string, number>();
  (env.data ?? []).forEach((e) => envios.set(e.transportista_id as string, (envios.get(e.transportista_id as string) ?? 0) + 1));

  const filas: TransportistaFila[] = (tra.data ?? []).map((t: any) => {
    const c = contactos.get(t.id);
    return {
      ...t,
      contacto_nombre: c?.nombre ?? '', contacto_telefono: c?.telefono ?? '',
      email_trafico: c?.trafico ?? '', email_contabilidad: c?.conta ?? '',
      flota: flota.get(t.id) ?? { tractoras: 0, rigidos: 0, remolques: 0, adr: false, matriculas: [] },
      envios: envios.get(t.id) ?? 0,
    };
  });
  return <Transportistas filas={filas} error={tra.error?.message ?? null} />;
}
