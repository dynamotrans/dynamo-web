import { sesion, esDynamo } from '@/lib/sesion';
import AvisoCuenta from '@/components/panel/AvisoCuenta';
import Exportaciones from '@/components/panel/Exportaciones';
import { FICHEROS, type Fichero, type FilaExport } from '@/lib/exportaciones';

export const dynamic = 'force-dynamic';
const TOPE = 5000;   // filas por fichero que se traen a la pantalla

// Exportaciones (solo Dynamo): los ficheros para importar en Holded (pedidos de venta y
// de compra) y para subir a la bolsa de Wtransnet, columna a columna como las plantillas.
export default async function PaginaExportaciones() {
  const s = await sesion();
  if (!s) return null;
  const { supabase, perfil } = s;
  if (!perfil || perfil.estado !== 'activa') return <AvisoCuenta perfil={perfil} />;
  if (!esDynamo(perfil.rol)) {
    return <section className="section active"><div className="pt-aviso error" style={{ maxWidth: 640 }}><div>Esta sección es solo del equipo de Dynamo.</div></div></section>;
  }
  const claves = Object.keys(FICHEROS) as Fichero[];
  const res = await Promise.all(claves.map((k) => supabase.from(FICHEROS[k].vista).select('*').range(0, TOPE - 1)));
  const datos = {} as Record<Fichero, FilaExport[]>;
  const errores: string[] = [];
  claves.forEach((k, i) => { datos[k] = (res[i].data ?? []) as FilaExport[]; if (res[i].error) errores.push(`${FICHEROS[k].titulo}: ${res[i].error!.message}`); });

  // Lo ya hecho: en Holded lo dice su columna «EN HOLDED?»; en la bolsa, la hora de publicación.
  const hecho: Record<Fichero, string[]> = { venta: [], compra: [], bolsa: [] };
  for (const k of ['venta', 'compra'] as const) hecho[k] = datos[k].filter((f) => f['EN HOLDED?'] === 'SI').map((f) => String(f[FICHEROS[k].ref]));
  const refsBolsa = datos.bolsa.map((f) => String(f['REF.']));
  if (refsBolsa.length) {
    const { data } = await supabase.from('envios').select('referencia_gx').in('referencia_gx', refsBolsa).not('publicado_en_bolsa_en', 'is', null);
    hecho.bolsa = (data ?? []).map((e: any) => e.referencia_gx as string);
  }
  const columnas = {} as Record<Fichero, string[]>;
  claves.forEach((k) => { columnas[k] = datos[k][0] ? Object.keys(datos[k][0]) : []; });

  return <Exportaciones datos={datos} columnas={columnas} hecho={hecho} tope={TOPE} error={errores.join(' · ') || null} />;
}
