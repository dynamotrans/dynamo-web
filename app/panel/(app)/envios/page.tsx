import { sesion, esDynamo } from '@/lib/sesion';
import type { EnvioFila, Parada } from '@/lib/envios';
import TablaEnvios from '@/components/panel/TablaEnvios';
import AvisoCuenta from '@/components/panel/AvisoCuenta';

export const dynamic = 'force-dynamic';
export default async function PaginaEnvios({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const s = await sesion();
  if (!s) return null;
  const { supabase, perfil } = s;
  if (!perfil || perfil.estado !== 'activa') return <AvisoCuenta perfil={perfil} />;

  const rol = perfil.rol;
  const dynamo = esDynamo(rol);
  const sp = await searchParams;
  const q = (sp.q ?? '').trim();

  // ---- Datos, según el rol (Dynamo lee la tabla; cliente y transportista, sus funciones)
  let filas: EnvioFila[] = [];
  let error: string | null = null;
  if (dynamo) {
    const { data, error: e } = await supabase.from('envios').select(
      'id, referencia_gx, referencia_cliente, estado, estado_asignacion, es_manual, transportista_id, ' +
      'fecha_carga_desde, fecha_carga_hasta, fecha_carga_real, fecha_entrega_estimada, descripcion_mercancia, ' +
      'toneladas, metros_lineales, tipo_carga, paletizado, poblacion_origen, codigo_postal_origen, poblacion_destino, codigo_postal_destino, ' +
      'importe_cliente, importe_transportista, precio_acordado_operador, precio_fijado_a_mano, matricula_camion, ' +
      'matricula_remolque, creado_en, modificado_en, creado_por, clientes(nombre_visible, cif), operadores(razon_social), ' +
      'envio_paradas(orden, tipo, nombre_empresa, direccion, codigo_postal, poblacion, provincia, pais_codigo_iso)')
      .order('creado_en', { ascending: false }).limit(1000);
    if (e) error = e.message;
    filas = ((data ?? []) as any[]).map((x) => ({
      ...x, cliente: x.clientes?.nombre_visible ?? null, cliente_cif: x.clientes?.cif ?? null,
      operador: x.operadores?.razon_social ?? null, transportista_asignado: !!x.transportista_id,
      paradas: (x.envio_paradas ?? []) as Parada[],
    }));
  } else {
    const { data, error: e } = await supabase.rpc(rol === 'transportista' ? 'mis_viajes' : 'mis_envios').limit(1000);
    if (e) error = e.message;
    filas = ((data ?? []) as any[]).map((x) => ({
      ...x, cliente: null, cliente_cif: null, operador: null, creado_por: x.creado_por ?? null,
      transportista_asignado: !!x.asignado_en || x.estado_asignacion === 'confirmada',
      paradas: (x.paradas ?? []) as Parada[],
    }));
    // Nombre del operador de los envíos manuales del cliente (su propio catálogo).
    const ids = [...new Set(filas.map((f: any) => f.operador_id).filter(Boolean))];
    if (ids.length) {
      const { data: ops } = await supabase.from('operadores').select('id, razon_social').in('id', ids);
      const mapa = new Map((ops ?? []).map((o) => [o.id, o.razon_social]));
      filas.forEach((f: any) => { f.operador = mapa.get(f.operador_id) ?? null; });
    }
  }
  filas.sort((a, b) => (b.creado_en ?? '').localeCompare(a.creado_en ?? ''));

  // Quién creó cada envío (columna "Creado por"). Dynamo ve a todos los usuarios.
  const nombres = new Map<string, string>();
  if (dynamo) {
    const ids = [...new Set(filas.map((f) => f.creado_por).filter(Boolean))] as string[];
    if (ids.length) {
      const { data: us } = await supabase.from('usuarios').select('id, nombre, email').in('id', ids);
      (us ?? []).forEach((u) => nombres.set(u.id, u.nombre || u.email));
    }
  }

  return <TablaEnvios filas={filas} nombres={Object.fromEntries(nombres)} rol={rol} f={sp.f} q={q} p={sp.p} error={error} nuevo={sp.nuevo} />;
}
