import { hoyMadrid } from '@/lib/formato';
import { leerTodo } from '@/lib/leerTodo';
import { sesion, esDynamo } from '@/lib/sesion';
import { vistaDe } from '@/lib/vista';
import AvisoCuenta from '@/components/panel/AvisoCuenta';
import CrearVariosEnvios from '@/components/panel/CrearVariosEnvios';
import type { ClienteOpcion, SitioOpcion, ReglasPrecio } from '@/components/panel/NuevoEnvio';
import { CONTACTO } from '@/lib/atencion';

export const dynamic = 'force-dynamic';

// «Crear varios envíos» (usuario, 2026-11-21): una tabla con un envío por fila (hasta 20),
// los mismos datos que Nuevo envío, el precio de cada fila al momento y, al final, crear
// todos de golpe o sacar la proforma con la lista de precios. Manual por ahora; más
// adelante la IA rellenará la tabla desde un Excel o un email.
export default async function PaginaVariosEnvios() {
  const s = await sesion();
  if (!s) return null;
  const { supabase, perfil } = s;
  if (!perfil || perfil.estado !== 'activa') return <AvisoCuenta perfil={perfil} />;
  const hoy = hoyMadrid();
  const hasta = hoyMadrid(400);
  const colsSitio = 'id, cliente_id, nombre_empresa, tipo, direccion, codigo_postal, poblacion, provincia, pais_codigo_iso, horarios, es_almacen_dynamo, disponible';

  if (!esDynamo(perfil.rol)) {
    if (perfil.rol !== 'cliente') {
      return <section className="section active"><div className="pt-aviso info" style={{ maxWidth: 640 }}><div>Esta pantalla es para los clientes.</div></div></section>;
    }
    const [emp, lug, fes, reg] = await Promise.all([
      supabase.rpc('mi_empresa').maybeSingle(),
      leerTodo(supabase.from('sitios').select(colsSitio).eq('borrado', false).eq('es_almacen_dynamo', false).order('nombre_empresa'), 5000),
      supabase.rpc('festivos_entre', { p_desde: hoy, p_hasta: hasta }),
      supabase.rpc('reglas_precio_envio'),
    ]);
    const e = emp.data;
    if (!e) return <section className="section active"><div className="pt-aviso error" style={{ maxWidth: 640 }}><div>Tu usuario aún no está asociado a una empresa. Escríbenos a {CONTACTO.email}.</div></div></section>;
    const { data: prin } = await supabase.rpc('sitio_principal', { p_cliente: e.id });
    const cli: ClienteOpcion = { id: e.id, nombre: e.razon_social, cif: e.cif, principal_id: (prin as string | null) ?? null, iva: e.iva_pct ?? null, nima: !!e.nima_por_defecto };
    return <CrearVariosEnvios esCliente clientes={[cli]} sitios={(lug.data ?? []) as SitioOpcion[]}
      festivos={((fes.data ?? []) as { fecha: string }[]).map((f) => f.fecha)} reglas={(reg.data ?? null) as ReglasPrecio | null}
      error={lug.error?.message ?? null} />;
  }

  const vista = await vistaDe(supabase, perfil.rol);
  if (vista.tipo === 'transportista') {
    return <section className="section active"><div className="pt-aviso" style={{ maxWidth: 640 }}><div>Un transportista no crea envíos: vuelve a la vista de Dynamo o a la de un cliente (arriba, «Ver como»).</div></div></section>;
  }
  const clienteIni = vista.tipo === 'cliente' ? vista.id : null;
  const [cli, lug, fes, reg] = await Promise.all([
    clienteIni ? supabase.from('clientes').select('id, nombre_visible, cif, sitio_principal_id, iva_pct, nima_por_defecto').eq('id', clienteIni) : Promise.resolve({ data: [], error: null }),
    clienteIni ? supabase.from('sitios').select(colsSitio).eq('borrado', false).eq('es_almacen_dynamo', false).eq('cliente_id', clienteIni).order('nombre_empresa').limit(2500)
      : Promise.resolve({ data: [], error: null }),
    supabase.rpc('festivos_entre', { p_desde: hoy, p_hasta: hasta }),
    supabase.rpc('reglas_precio_envio'),
  ]);
  const clientes: ClienteOpcion[] = (cli.data ?? []).map((c) => ({ id: c.id, nombre: c.nombre_visible ?? '', cif: c.cif, principal_id: c.sitio_principal_id, iva: c.iva_pct, nima: !!c.nima_por_defecto }));
  return <CrearVariosEnvios clientes={clientes} clienteFijo={!!clienteIni} sitios={(lug.data ?? []) as SitioOpcion[]}
    festivos={((fes.data ?? []) as { fecha: string }[]).map((f) => f.fecha)} reglas={(reg.data ?? null) as ReglasPrecio | null}
    error={cli.error?.message || lug.error?.message || null} />;
}
