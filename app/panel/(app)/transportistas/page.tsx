import { leerTodo } from '@/lib/leerTodo';
import { sesion, esDynamo } from '@/lib/sesion';
import AvisoCuenta from '@/components/panel/AvisoCuenta';
import Transportistas, { type TransportistaFila } from '@/components/panel/Transportistas';
import { contactosDe } from '@/lib/contactos';
import { notasInternas } from '@/lib/notasInternas';

export const dynamic = 'force-dynamic';

// Catálogo de transportistas (solo Dynamo): diseño de #sec-transportistas de dashboard.html.
export default async function PaginaTransportistas({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const s = await sesion();
  if (!s) return null;
  const { supabase, perfil } = s;
  if (!perfil || perfil.estado !== 'activa') return <AvisoCuenta perfil={perfil} />;
  if (!esDynamo(perfil.rol)) {
    return <section className="section active"><div className="pt-aviso error" style={{ maxWidth: 640 }}><div>Esta sección es solo del equipo de Dynamo.</div></div></section>;
  }

  const [tra, con, veh, env, notas] = await Promise.all([
    leerTodo(supabase.from('transportistas').select('*').order('nombre_visible'), 10000),
    leerTodo(supabase.from('contactos').select('id, transportista_id, nombre, cargo, funcion, telefono, email, recibe_avisos, es_principal, creado_en').not('transportista_id', 'is', null), 50000),
    leerTodo(supabase.from('vehiculos').select('transportista_id, matricula, tipo, adr').eq('activo', true).not('transportista_id', 'is', null), 50000),
    // Envíos hechos con cada transportista (lo que cuenta: no borradores ni cancelados).
    supabase.rpc('envios_por_empresa', { p_campo: 'transportista' }),
    notasInternas(supabase, 'transportistas'),
  ]);

  const porTransportista = new Map<string, any[]>();
  (con.data ?? []).forEach((c) => porTransportista.set(c.transportista_id as string, [...(porTransportista.get(c.transportista_id as string) ?? []), c]));
  const flota = new Map<string, { tractoras: number; rigidos: number; remolques: number; adr: boolean; matriculas: string[] }>();
  (veh.data ?? []).forEach((v) => {
    const k = v.transportista_id as string;
    const x = flota.get(k) ?? { tractoras: 0, rigidos: 0, remolques: 0, adr: false, matriculas: [] };
    if (v.tipo === 'tractora') x.tractoras++; else if (v.tipo === 'rigido') x.rigidos++; else x.remolques++;
    x.adr = x.adr || !!v.adr; x.matriculas.push(v.matricula);
    flota.set(k, x);
  });
  const envios = new Map<string, number>();
  ((env.data ?? []) as { id: string; envios: number }[]).forEach((e) => envios.set(e.id, Number(e.envios)));

  const filas: TransportistaFila[] = (tra.data ?? []).map((t: any) => {
    return {
      ...t,
      anotaciones: notas.get(t.id)?.anotaciones ?? null, anotaciones_incidencias: notas.get(t.id)?.anotaciones_incidencias ?? null,
      contactos: contactosDe(porTransportista.get(t.id) ?? []),
      flota: flota.get(t.id) ?? { tractoras: 0, rigidos: 0, remolques: 0, adr: false, matriculas: [] },
      envios: envios.get(t.id) ?? 0,
    };
  });
  const ver = (await searchParams).ver;
  return <Transportistas filas={filas} error={tra.error?.message ?? null} abrirId={ver && /^[0-9a-f-]{36}$/i.test(ver) ? ver : undefined} />;
}
