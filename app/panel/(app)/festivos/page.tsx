import { sesion, esDynamo, sinAcceso } from '@/lib/sesion';
import AvisoCuenta from '@/components/panel/AvisoCuenta';
import Festivos, { type FestivoFila, type ComunidadOpcion } from '@/components/panel/Festivos';

export const dynamic = 'force-dynamic';

// Festivos (tabla `festivos`, solo equipo Dynamo): nacionales, autonómicos y locales.
// Los usan el corte de cancelación (nacionales) y los avisos a los sitios (los tres
// niveles: la comunidad sale del CP del sitio y el local casa por población).
export default async function PaginaFestivos() {
  const s = await sesion();
  if (!s) return null;
  const { supabase, perfil } = s;
  if (sinAcceso(perfil)) return <AvisoCuenta perfil={perfil} />;
  if (!esDynamo(perfil.rol)) {
    return <section className="section active"><div className="pt-aviso error" style={{ maxWidth: 640 }}><div>Esta sección es solo del equipo de Dynamo.</div></div></section>;
  }
  const [{ data, error }, { data: cc }] = await Promise.all([
    supabase.from('festivos').select('id, fecha, pais_codigo_iso, region, poblacion, nombre, repetir, dias_desde_pascua, vigente_hasta')
      .order('pais_codigo_iso').order('fecha'),
    supabase.from('provincias_comunidades').select('comunidad_iso, comunidad_nombre'),
  ]);
  const vistas = new Map<string, string>();
  for (const c of cc ?? []) if (!vistas.has(c.comunidad_iso)) vistas.set(c.comunidad_iso, c.comunidad_nombre);
  const comunidades: ComunidadOpcion[] = [...vistas.entries()].map(([iso, nombre]) => ({ iso, nombre }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  return <Festivos filas={(data ?? []) as FestivoFila[]} comunidades={comunidades} error={error?.message ?? null} />;
}
