import Link from 'next/link';
import BajasSolicitadas, { type BajaFila } from '@/components/panel/BajasSolicitadas';
import { hoyMadrid, fechaHora } from '@/lib/formato';
import { leerTodo } from '@/lib/leerTodo';
import { sesion, esDynamo, sinAcceso } from '@/lib/sesion';
import AvisoCuenta from '@/components/panel/AvisoCuenta';
import Altas, { type AltaFila, type AltaTransportista, type ParaCliente } from '@/components/panel/Altas';
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
  const [altas, clientes, reservas, fes, par, emp] = await Promise.all([
    supabase.rpc('altas_pendientes'),
    leerTodo(supabase.from('clientes').select('id, nombre_visible, cif').order('nombre_visible'), 10000),
    // Transportistas dados de alta online desde el enlace de una carga, esperando a Dynamo.
    supabase.from('envio_reservas').select('id, envio_id, precio_propuesto, ' +
      'transportistas!inner(id, nombre_visible, cif, pais_codigo_iso, bolsa, codigo_bolsa, tags, estado_operativo, creado_en, contactos(telefono)), ' +
      'envios(referencia_gx, poblacion_origen, poblacion_destino, fecha_carga_desde, fecha_carga_hasta, importe_transportista)')
      .eq('estado', 'pendiente_revision').limit(500).overrideTypes<ReservaAlta[], { merge: false }>(),
    supabase.rpc('festivos_entre', { p_desde: hace, p_hasta: luego }),
    // Para el formulario completo de «Nuevo cliente» que se abre desde «Verificar alta».
    supabase.from('parametros').select('clave, valor').in('clave', ['factor_bienvenida_pct', 'factor_bienvenida_envios', 'sectores_cliente']),
    supabase.from('usuarios').select('id, nombre, email').in('rol', ['admin', 'empleado']).order('nombre'),
  ]);
  const pm = new Map((par.data ?? []).map((x) => [x.clave as string, Number(x.valor)]));
  const sectores = (par.data ?? []).find((x) => x.clave === 'sectores_cliente')?.valor;
  const paraCliente: ParaCliente = {
    bienvenida: { pct: pm.get('factor_bienvenida_pct') ?? -7, envios: pm.get('factor_bienvenida_envios') ?? 3 },
    empleados: (emp.data ?? []).map((u) => ({ id: u.id as string, nombre: (u.nombre || u.email) as string })),
    sectores: Array.isArray(sectores) ? (sectores as string[]) : [],
  };
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
  // Móvil verificado por WhatsApp o validado por Dynamo (usuario, 2026-11-25): para aprobar con seguridad.
  const idsAltas = (altas.data ?? []).map((a) => a.id);
  const { data: movs } = idsAltas.length
    ? await supabase.from('usuarios').select('id, telefono_verificado_en, telefono_verificado_como').in('id', idsAltas)
    : { data: [] as { id: string; telefono_verificado_en: string | null; telefono_verificado_como: string | null }[] };
  const mMov = new Map((movs ?? []).map((u) => [u.id, u]));
  const filas: AltaFila[] = (altas.data ?? []).map((a) => {
    const m = (a.datos ?? {}) as Record<string, unknown>;
    const t = (k: string) => (typeof m[k] === 'string' ? m[k] : '') as string;
    return {
      id: a.id, email: a.email, nombre: a.nombre ?? t('nombre'), telefono: a.telefono ?? t('telefono'), documento: a.documento ?? t('dni'), documento_pais: t('dni_pais'),
      solicitada_en: a.solicitada_en, confirmado_email: a.confirmado_email,
      movil: mMov.get(a.id)?.telefono_verificado_en ? (mMov.get(a.id)?.telefono_verificado_como === 'dynamo' ? 'dynamo' : 'verificado') : 'pendiente',
      empresa: t('empresa') || t('razon_social'), cif: t('cif'), direccion: t('direccion'), codigo_postal: t('codigo_postal'),
      poblacion: t('poblacion'), provincia: t('provincia'), pais: t('pais') || 'ES',
      empresa_telefono: t('empresa_telefono'), empresa_email: t('empresa_email'),
      camino: t('alta_paso') === 'existente' ? 'existente' : t('alta_paso') === 'nueva' ? 'nueva' : '',
    };
  });
  // Empresas que han pedido verificarse (usuario, 2026-11-26): la revisión se hace en su ficha.
  const { data: porVerificar } = await supabase.from('clientes')
    .select('id, nombre_visible, cif, verificacion_solicitada, verificacion_solicitada_en')
    .not('verificacion_solicitada', 'is', null).eq('estado_verificacion', 'no_verificada')
    .order('verificacion_solicitada_en', { ascending: true }).limit(100);
  // Bajas pedidas por un compañero (usuario, 2026-11-26): la cuenta ya está sin acceso.
  const { data: bajasR } = await supabase.from('solicitudes_baja')
    .select('id, motivo, creada_en, usuario:usuarios!solicitudes_baja_usuario_id_fkey(nombre, email, cliente_id, transportista_id), por:usuarios!solicitudes_baja_solicitada_por_fkey(nombre, email), clientes(nombre_visible), transportistas(nombre_visible)')
    .eq('estado', 'pendiente').order('creada_en').limit(100)
    .overrideTypes<{ id: string; motivo: string; creada_en: string; usuario: { nombre: string | null; email: string | null } | null;
      por: { nombre: string | null; email: string | null } | null; clientes: { nombre_visible: string | null } | null; transportistas: { nombre_visible: string | null } | null }[], { merge: false }>();
  const bajas: BajaFila[] = (bajasR ?? []).map((b) => ({
    id: b.id, motivo: b.motivo, creada_en: b.creada_en, usuario: b.usuario?.nombre || b.usuario?.email || '', email: b.usuario?.email ?? '',
    empresa: b.clientes?.nombre_visible || b.transportistas?.nombre_visible || '', por: b.por?.nombre || b.por?.email || '',
  }));
  return (
    <>
      {/* Resumen arriba (usuario, 2026-11-27): lo que espera al equipo, separado en empresas y
          usuarios (y bajas si las hay), cada bloque con su título debajo. */}
      <section className="section active" style={{ paddingBottom: 0 }}>
        <div className="sec-header"><h2>Altas pendientes ({(porVerificar ?? []).length + filas.length})</h2></div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', margin: '0 0 0.4rem' }} id="altas-resumen">
          <a href="#empresas-por-verificar" className="badge badge-orange">Empresas por verificar · {(porVerificar ?? []).length}</a>
          <a href="#usuarios-pendientes" className="badge badge-blue">Usuarios por dar de alta · {filas.length}</a>
          {bajas.length > 0 && <a href="#bajas-solicitadas" className="badge badge-red">Bajas pedidas · {bajas.length}</a>}
        </div>
      </section>
      <BajasSolicitadas filas={bajas} />
      <section className="section active" id="empresas-por-verificar" style={{ paddingBottom: 0 }}>
        <div className="sec-header"><h2>Empresas por verificar ({(porVerificar ?? []).length})</h2></div>
        {(porVerificar ?? []).length === 0 ? (
          <p style={{ color: 'var(--gray-500)', margin: '0 0 0.6rem' }}>Ninguna empresa esperando. Aquí salen las que han pedido verificarse (transferencia de 0,01 € con su CIF en el concepto).</p>
        ) : (
          <>
            <p style={{ color: 'var(--gray-600)', margin: '0 0 0.6rem', fontSize: 'var(--fs-s)' }}>Sin verificar trabajan con pago previo. Ábrelas para verificar o rechazar.</p>
            <div className="table-wrap"><table className="data">
              <thead><tr><th>Empresa</th><th>CIF</th><th>Vía</th><th>Pedida</th></tr></thead>
              <tbody>
                {(porVerificar ?? []).map((c) => (
                  <tr key={c.id}>
                    <td><Link href={`/panel/clientes?ver=${c.id}`}>{c.nombre_visible}</Link></td>
                    <td>{c.cif}</td>
                    <td>{c.verificacion_solicitada === 'transferencia' ? 'Transferencia de 0,01 €' : 'Documento'}</td>
                    <td>{c.verificacion_solicitada_en ? fechaHora(c.verificacion_solicitada_en) : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          </>
        )}
      </section>
      <Altas filas={filas} transportistas={transportistas} festivos={festivos} clientes={clientes.data ?? []} paraCliente={paraCliente} error={altas.error?.message ?? reservas.error?.message ?? null} />
    </>
  );
}
