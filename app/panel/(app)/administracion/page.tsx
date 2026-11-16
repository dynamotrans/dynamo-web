import { ALMACENAMIENTOS } from '@/lib/modulos';
import { leerTodo } from '@/lib/leerTodo';
import { sesion, esDynamo, esGestor, sinAcceso } from '@/lib/sesion';
import { vistaDe, filtrarVista } from '@/lib/vista';
import AvisoCuenta from '@/components/panel/AvisoCuenta';
import Administracion, { type ProformaFila, type AlbaranFila } from '@/components/panel/Administracion';
import { fecha } from '@/lib/formato';

type EnvioRuta = { id: string; referencia_gx: string; poblacion_origen: string | null; poblacion_destino: string | null; creado_en: string; confirmado_en: string | null };
export const dynamic = 'force-dynamic';

// Administración (diseño de #sec-facturas / #sec-albaranes de dashboard.html, con una pestaña
// más): PROFORMAS (el pago por adelantado de los ENVÍOS —pagos_envio(), que ya filtra por
// empresa— y de los almacenamientos), ALBARANES (los albaranes y CMR firmados subidos a los
// envíos) y FACTURAS (viven en Holded: llegarán al conectarlo).
// Dynamo ve todo; el cliente, lo suyo (la seguridad por filas hace el filtro).
export default async function PaginaAdministracion({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const s = await sesion();
  if (!s) return null;
  const { supabase, perfil } = s;
  if (sinAcceso(perfil)) return <AvisoCuenta perfil={perfil} />;
  const dynamo = esDynamo(perfil.rol);
  if (!dynamo && perfil.rol !== 'cliente') {
    return <section className="section active"><div className="pt-aviso error" style={{ maxWidth: 640 }}><div>Esta sección es de los clientes y del equipo de Dynamo.</div></div></section>;
  }

  const vista = await vistaDe(supabase, perfil.rol);
  const [alm, docs, pagos] = await Promise.all([
    // Proformas de almacenamiento: módulo apagado hasta la v4 (lib/modulos.ts) → no se cargan.
    !ALMACENAMIENTOS ? Promise.resolve({ data: [], error: null }) : leerTodo(filtrarVista(supabase.from('almacenamientos').select('id, codigo, referencia_cliente, estado, fecha_entrada, fecha_salida, importe_total, iva_pct, pagado_en, creado_en, clientes(nombre_visible)'), vista, { transportista: null })
      .eq('requiere_pago_previo', true).neq('estado', 'cancelado').order('creado_en', { ascending: false }), 5000),
    leerTodo(filtrarVista(supabase.from('documentos').select(vista.tipo === 'admin' ? 'id, tipo, nombre_archivo, envio_id, creado_en, visible_cliente' : 'id, tipo, nombre_archivo, envio_id, creado_en, visible_cliente, envios!inner(cliente_id, transportista_id)'),
      vista, { cliente: 'envios.cliente_id', transportista: 'envios.transportista_id' })
      .in('tipo', ['albaran', 'cmr_firmado']).not('envio_id', 'is', null).eq('borrado', false)
      .order('creado_en', { ascending: false }), 5000),
    // Proformas de los ENVÍOS con pago previo: la misma puerta que la ficha y el PDF.
    supabase.rpc('pagos_envio'),
  ]);
  // La proforma de un envío cancelado SIN pagar ya no se debe (anulada); una pagada se
  // conserva (justificante del cobro).
  const pagosFilas = (pagos.data ?? []).filter((pg) => pg.pagado_en || pg.estado !== 'cancelado');

  // Número y ruta del envío de cada albarán y de cada proforma de envío. El cliente no
  // lee la tabla de envíos (regla de la plataforma): para él, desde mis_envios().
  const ids = [...new Set([...(docs.data ?? []).map((d) => d.envio_id as string), ...pagosFilas.map((pg) => pg.envio_id)])];
  const envios = new Map<string, { gx: string; ruta: string; emitida: string }>();
  if (ids.length) {
    // Por tandas de 200 ids: una lista enorme en `.in()` no cabe en la dirección de la
    // consulta y se perdían envíos sin avisar. El cliente, solo los suyos y solo esos ids.
    const tandas: string[][] = [];
    for (let i = 0; i < ids.length; i += 200) tandas.push(ids.slice(i, i + 200));
    const lista: EnvioRuta[] = (await Promise.all(tandas.map((t) => dynamo
      ? supabase.from('envios').select('id, referencia_gx, poblacion_origen, poblacion_destino, creado_en, confirmado_en').in('id', t)
      : supabase.rpc('mis_envios_por_ids', { p_ids: t }))))
      .flatMap((r) => (r.data ?? []) as EnvioRuta[]);
    for (const e of lista) envios.set(e.id, { gx: e.referencia_gx, ruta: [e.poblacion_origen, e.poblacion_destino].filter(Boolean).join(' → '), emitida: e.confirmado_en ?? e.creado_en });
  }

  // El nombre del cliente de cada envío con proforma (columna Cliente, solo Dynamo).
  const clientesEnvio = new Map<string, string>();
  if (dynamo && pagosFilas.length) {
    const { data } = await supabase.from('envios').select('id, clientes(nombre_visible)').in('id', pagosFilas.map((pg) => pg.envio_id).slice(0, 1000));
    for (const e of data ?? []) if (e.clientes?.nombre_visible) clientesEnvio.set(e.id, e.clientes.nombre_visible);
  }

  const proformas: ProformaFila[] = [
    ...(alm.data ?? []).map((a): ProformaFila => {
      const base = Number(a.importe_total ?? 0), iva = a.iva_pct != null ? Number(a.iva_pct) : 21;
      return {
        id: a.id, tipo: 'almacenamiento', codigo: a.codigo, referencia_cliente: a.referencia_cliente ?? '', cliente: a.clientes?.nombre_visible ?? null,
        concepto: `Almacenamiento · ${fecha(a.fecha_entrada)} – ${fecha(a.fecha_salida)}`,
        base, total: Math.round(base * (1 + iva / 100) * 100) / 100, pagado_en: a.pagado_en ?? null, creado_en: a.creado_en,
      };
    }),
    ...pagosFilas.map((pg): ProformaFila => ({
      id: pg.envio_id, tipo: 'envio', codigo: pg.referencia_gx, referencia_cliente: pg.referencia_cliente ?? '', cliente: clientesEnvio.get(pg.envio_id) ?? null,
      concepto: ['Transporte', envios.get(pg.envio_id)?.ruta].filter(Boolean).join(' · '),
      base: Number(pg.base ?? 0), total: Number(pg.total ?? 0), pagado_en: pg.pagado_en ?? null,
      creado_en: envios.get(pg.envio_id)?.emitida ?? null,
    })),
  ].sort((a, b) => (b.creado_en ?? '').localeCompare(a.creado_en ?? ''));
  const albaranes: AlbaranFila[] = (docs.data ?? []).map((d) => ({
    id: d.id, tipo: d.tipo, nombre: d.nombre_archivo, envio_id: d.envio_id, creado_en: d.creado_en, visible_cliente: d.visible_cliente,
    gx: envios.get(d.envio_id)?.gx ?? null, ruta: envios.get(d.envio_id)?.ruta ?? '',
  }));
  const tab = (await searchParams).tab;
  return (
    <Administracion proformas={proformas} albaranes={albaranes} dynamo={dynamo} gestor={esGestor(perfil.rol)}
      pestanaInicial={tab === 'albaranes' || tab === 'facturas' ? tab : 'proformas'}
      error={alm.error?.message ?? docs.error?.message ?? null} />
  );
}
