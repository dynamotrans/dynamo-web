import { leerTodo } from '@/lib/leerTodo';
import { sesion, esDynamo } from '@/lib/sesion';
import { vistaDe, filtrarVista } from '@/lib/vista';
import AvisoCuenta from '@/components/panel/AvisoCuenta';
import Penalizaciones, { type PenalizacionFila } from '@/components/panel/Penalizaciones';
import { cargarEnviosLigeros } from '@/lib/enviosLigeros';
import MisPenalizaciones, { type MiPenalizacion } from '@/components/panel/MisPenalizaciones';

export const dynamic = 'force-dynamic';

// Penalizaciones (solo Dynamo en la etapa A): diseño de #sec-penalizaciones de dashboard.html.
// `?nueva=<envío>` abre la ventana de crear con ese envío ya elegido (desde su ficha).
export default async function PaginaPenalizaciones({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const s = await sesion();
  if (!s) return null;
  const { supabase, perfil } = s;
  if (!perfil || perfil.estado !== 'activa') return <AvisoCuenta perfil={perfil} />;
  if (!esDynamo(perfil.rol)) {
    // Etapa B: el cliente ve las suyas (solo su importe). El transportista, en la etapa C.
    if (perfil.rol === 'cliente') {
      const { data, error } = await supabase.rpc('mis_penalizaciones');
      return <MisPenalizaciones filas={(data ?? []) as MiPenalizacion[]} error={error?.message ?? null} />;
    }
    // Etapa C: el transportista, las suyas con SU importe.
    const { data, error } = await supabase.rpc('mis_penalizaciones_transportista');
    const filas = ((data ?? []) as any[]).map((x) => ({ ...x, importe_cliente: x.importe_transportista }));
    return <MisPenalizaciones esTransportista filas={filas as MiPenalizacion[]} error={error?.message ?? null} />;
  }
  const sp = await searchParams;
  const vista = await vistaDe(supabase, perfil.rol);
  const [pen, tipos, envios] = await Promise.all([
    leerTodo(filtrarVista(supabase.from('penalizaciones').select('id, codigo, envio_id, tipo_id, descripcion, importe_cliente, importe_transportista, estado, generada_auto, ' +
      'editada_a_mano, creado_en, modificado_en, tipos_penalizacion(nombre), ' +
      (vista.tipo === 'admin' ? 'envios' : 'envios!inner') + '(referencia_gx, referencia_cliente, cliente_id, transportista_id, clientes(nombre_visible), transportistas(nombre_visible))'),
      vista, { cliente: 'envios.cliente_id', transportista: 'envios.transportista_id' })
      .order('creado_en', { ascending: false }), 5000),
    supabase.from('tipos_penalizacion').select('id, nombre, activo').order('orden'),
    cargarEnviosLigeros(supabase),
  ]);
  const filas: PenalizacionFila[] = (pen.data ?? []).map((p: any) => ({
    id: p.id, codigo: p.codigo, envio_id: p.envio_id, tipo_id: p.tipo_id, tipo: p.tipos_penalizacion?.nombre ?? '—',
    descripcion: p.descripcion, importe_cliente: p.importe_cliente != null ? Number(p.importe_cliente) : null,
    importe_transportista: p.importe_transportista != null ? Number(p.importe_transportista) : null,
    estado: p.estado, generada_auto: p.generada_auto, editada_a_mano: p.editada_a_mano, creado_en: p.creado_en, modificado_en: p.modificado_en,
    envio: p.envios?.referencia_gx ?? '—', referencia_cliente: p.envios?.referencia_cliente ?? null,
    cliente: p.envios?.clientes?.nombre_visible ?? null, transportista: p.envios?.transportistas?.nombre_visible ?? null,
  }));
  return <Penalizaciones filas={filas} tipos={(tipos.data ?? []) as any} envios={envios} nuevaPara={sp.nueva ?? null} error={pen.error?.message ?? null} />;
}
