import { sesion, esDynamo, sinAcceso } from '@/lib/sesion';
import AvisoCuenta from '@/components/panel/AvisoCuenta';
import Exportaciones from '@/components/panel/Exportaciones';
import { FICHEROS, type Fichero, type FilaExport } from '@/lib/exportaciones';
import type { FilaControl, FilaCuadre } from '@/components/panel/ControlFacturacion';
import { leerTodo } from '@/lib/leerTodo';

export const dynamic = 'force-dynamic';
const TOPE = 5000;   // filas por fichero que se traen a la pantalla
// ORDEN de cada fichero. Hace falta por dos cosas (usuario, 2026-11-24: «hay más de 1.000
// envíos entregados y limita a 1.000»): la API de Supabase da como mucho 1.000 filas por
// consulta, así que se lee por tandas y las tandas necesitan un orden fijo para no pisarse;
// y, si un fichero pasa del tope, lo que se ve tiene que ser lo PENDIENTE (lo que aún no está
// en Holded) y lo más reciente, no un trozo cualquiera. Los nombres van entre comillas porque
// llevan espacios, paréntesis o interrogación.
const ORDEN: Record<Fichero, [string, boolean][]> = {
  venta: [['EN HOLDED?', true], ['Num Pedido (referencia_gx_carga)', false], ['Concepto', true], ['Descripción del producto', true]],
  compra: [['EN HOLDED?', true], ['Num Pedido (referencia_gx_carga)', false], ['Concepto', true], ['Descripción del producto', true]],
  bolsa: [['REF.', false]],
};

// Exportaciones (solo Dynamo): los ficheros para importar en Holded (pedidos de venta y
// de compra) y para subir a la bolsa de Wtransnet, columna a columna como las plantillas.
export default async function PaginaExportaciones({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const s = await sesion();
  if (!s) return null;
  const { supabase, perfil } = s;
  if (sinAcceso(perfil)) return <AvisoCuenta perfil={perfil} />;
  if (!esDynamo(perfil.rol)) {
    return <section className="section active"><div className="pt-aviso error" style={{ maxWidth: 640 }}><div>Esta sección es solo del equipo de Dynamo.</div></div></section>;
  }
  const sp = await searchParams;
  const claves = Object.keys(FICHEROS) as Fichero[];
  // El control de facturación va a la vez que los ficheros: su contador sale en la tarjeta.
  const [res, tot, pen, ctl, cua, des] = await Promise.all([
    Promise.all(claves.map((k) => {
      let q = supabase.from(FICHEROS[k].vista).select('*');
      for (const [col, asc] of ORDEN[k]) q = q.order(`"${col}"`, { ascending: asc });
      return leerTodo<FilaExport>(q, TOPE, false);
    })),
    // Cuántas filas tiene de verdad cada fichero y, en los de Holded, cuántos PEDIDOS siguen
    // pendientes: lo que dicen las tarjetas, aunque en pantalla solo quepa el tope.
    Promise.all(claves.map((k) => supabase.from(FICHEROS[k].vista).select('*', { count: 'exact', head: true }))),
    Promise.all((['venta', 'compra'] as const).map((k) => supabase.from(FICHEROS[k].vista).select('*', { count: 'exact', head: true }).eq('"EN HOLDED?"' as never, 'NO').ilike('"Concepto"' as never, 'porte'))),
    supabase.rpc('control_facturacion', { p_limite: 300 }),
    supabase.rpc('cuadre_facturacion', { p_meses: 6 }),
    supabase.from('parametros').select('valor').eq('clave', 'control_facturacion_desde').maybeSingle(),
  ]);
  const desdeTxt = typeof des.data?.valor === 'string' ? des.data.valor : '';
  const datos = {} as Record<Fichero, FilaExport[]>;
  const errores: string[] = [];
  claves.forEach((k, i) => { datos[k] = (res[i].data ?? []) as FilaExport[]; if (res[i].error) errores.push(`${FICHEROS[k].titulo}: ${res[i].error!.message}`); });

  // Lo ya hecho: en Holded lo dice su columna «EN HOLDED?»; en la bolsa, la hora de publicación.
  const hecho: Record<Fichero, string[]> = { venta: [], compra: [], bolsa: [] };
  for (const k of ['venta', 'compra'] as const) hecho[k] = datos[k].filter((f) => f['EN HOLDED?'] === 'SI').map((f) => String(f[FICHEROS[k].ref]));
  const refsBolsa = datos.bolsa.map((f) => String(f['REF.']));
  if (refsBolsa.length) {
    // Publicado y sin cambios desde entonces (si se modificó después, vuelve a pendiente).
    const { data } = await supabase.from('envios').select('referencia_gx, publicado_en_bolsa_en, modificado_en').in('referencia_gx', refsBolsa).not('publicado_en_bolsa_en', 'is', null);
    hecho.bolsa = (data ?? []).filter((e) => !e.modificado_en || e.modificado_en <= e.publicado_en_bolsa_en).map((e) => e.referencia_gx as string);
  }
  const columnas = {} as Record<Fichero, string[]>;
  claves.forEach((k) => { columnas[k] = datos[k][0] ? Object.keys(datos[k][0]) : []; });

  const control = {
    filas: (ctl.data ?? []) as FilaControl[], cuadre: (cua.data ?? []) as FilaCuadre[],
    error: [ctl.error?.message, cua.error?.message].filter(Boolean).join(' · ') || null,
    desde: /^\d{4}-\d{2}-\d{2}$/.test(desdeTxt) ? desdeTxt : null,
  };
  const totales = {} as Record<Fichero, number>;
  claves.forEach((k, i) => { totales[k] = tot[i].count ?? datos[k].length; });
  const pendientes: Partial<Record<Fichero, number>> = {};
  (['venta', 'compra'] as const).forEach((k, i) => { if (pen[i].count != null && !pen[i].error) pendientes[k] = pen[i].count!; });
  return <Exportaciones datos={datos} columnas={columnas} hecho={hecho} totales={totales} pendientesTotales={pendientes} error={errores.join(' · ') || null}
    control={control} inicio={sp.ver === 'cuadre' ? 'cuadre' : undefined} />;
}
