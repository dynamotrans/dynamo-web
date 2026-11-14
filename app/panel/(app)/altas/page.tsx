import { hoyMadrid } from '@/lib/formato';
import { leerTodo } from '@/lib/leerTodo';
import { sesion, esDynamo, sinAcceso } from '@/lib/sesion';
import AvisoCuenta from '@/components/panel/AvisoCuenta';
import Altas, { type AltaFila, type AltaTransportista } from '@/components/panel/Altas';
import type { Tabla } from '@/lib/supabase/tipos';

export const dynamic = 'force-dynamic';
type ReservaAlta = {
  id: string; envio_id: string; precio_propuesto: number | null;
  transportistas: (Pick<Tabla<'transportistas'>, 'id' | 'cif' | 'pais_codigo_iso' | 'bolsa' | 'codigo_bolsa' | 'tags' | 'estado_operativo' | 'creado_en'>
    & { nombre_visible: string; contactos: { telefono: string | null }[] | null }) | null;
  envios: Pick<Tabla<'envios'>, 'referencia_gx' | 'poblacion_origen' | 'poblacion_destino' | 'fecha_carga_desde' | 'fecha_carga_hasta' | 'importe_transportista'> | null;
};

// Altas pendientes (solo Dynamo): diseño de #sec-altas de dashboard.html.
export default async function PaginaAltas() {
  const s = await sesion();
  if (!s) return null;
  const { supabase, perfil } = s;
  if (sinAcceso(perfil)) return <AvisoCuenta perfil={perfil} />;
  if (!esDynamo(perfil.rol)) {
    return <section className="section active"><div className="pt-aviso error" style={{ maxWidth: 640 }}><div>Esta sección es solo del equipo de Dynamo.</div></div></section>;
  }
  // Festivos nacionales del último mes y el próximo (el contador no corre en festivo).
  const hace = hoyMadrid(-31), luego = hoyMadrid(31);
  const [altas, clientes, reservas, fes] = await Promise.all([
    supabase.rpc('altas_pendientes'),
    leerTodo(supabase.from('clientes').select('id, nombre_visible, cif').order('nombre_visible'), 10000),
    // Transportistas dados de alta online desde el enlace de una carga, esperando a Dynamo.
    supabase.from('envio_reservas').select('id, envio_id, precio_propuesto, ' +
      'transportistas!inner(id, nombre_visible, cif, pais_codigo_iso, bolsa, codigo_bolsa, tags, estado_operativo, creado_en, contactos(telefono)), ' +
      'envios(referencia_gx, poblacion_origen, poblacion_destino, fecha_carga_desde, fecha_carga_hasta, importe_transportista)')
      .eq('estado', 'pendiente_revision').limit(500).overrideTypes<ReservaAlta[], { merge: false }>(),
    supabase.rpc('festivos_entre', { p_desde: hace, p_hasta: luego }),
  ]);
  const BOLSA: Record<string, string> = { wtransnet: 'Wtransnet', teleroute: 'Teleroute', bursa_transport: 'Bursa Transport', '123cargo': '123cargo' };
  const transportistas: AltaTransportista[] = (reservas.data ?? [])
    .filter((r) => (r.transportistas?.tags ?? []).includes('alta_online'))
    .map((r) => {
      const t = r.transportistas!, e: Partial<NonNullable<ReservaAlta['envios']>> = r.envios ?? {};
      return {
        reserva: r.id, envio_id: r.envio_id, id: t.id, nombre: t.nombre_visible, cif: t.cif, pais: t.pais_codigo_iso ?? '',
        bolsa: BOLSA[t.bolsa ?? ''] ?? t.bolsa ?? '', codigo_bolsa: t.codigo_bolsa ?? '', verificado: t.estado_operativo === 'activo',
        telefono: (t.contactos ?? []).map((c) => c.telefono).find(Boolean) ?? '', solicitada_en: t.creado_en,
        envio: e.referencia_gx ?? '', ruta: [e.poblacion_origen, e.poblacion_destino].filter(Boolean).join(' → '),
        fecha_desde: e.fecha_carga_desde ?? null, fecha_hasta: e.fecha_carga_hasta ?? null,
        precio: r.precio_propuesto != null ? Number(r.precio_propuesto) : null, precio_base: e.importe_transportista != null ? Number(e.importe_transportista) : null,
      };
    });
  const festivos = ((fes.data ?? []) as { fecha: string; region?: string | null }[]).filter((f) => !f.region).map((f) => f.fecha);
  const filas: AltaFila[] = (altas.data ?? []).map((a) => {
    const m = (a.datos ?? {}) as Record<string, unknown>;
    const t = (k: string) => (typeof m[k] === 'string' ? m[k] : '') as string;
    return {
      id: a.id, email: a.email, nombre: a.nombre ?? t('nombre'), telefono: a.telefono ?? t('telefono'), documento: a.documento ?? t('dni'), documento_pais: t('dni_pais'),
      solicitada_en: a.solicitada_en, confirmado_email: a.confirmado_email,
      empresa: t('empresa') || t('razon_social'), cif: t('cif'), direccion: t('direccion'), codigo_postal: t('codigo_postal'),
      poblacion: t('poblacion'), provincia: t('provincia'), pais: t('pais') || 'ES',
    };
  });
  return <Altas filas={filas} transportistas={transportistas} festivos={festivos} clientes={clientes.data ?? []} error={altas.error?.message ?? reservas.error?.message ?? null} />;
}
