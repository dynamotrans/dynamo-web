'use server';

import { supabasePublico } from '@/lib/supabase/publico';
import { comprobarEntrada } from '@/lib/entradas/comprobar';

// Página «Proporcionar matrículas» (usuario, 2026-11-19): el transportista pone matrículas,
// conductor y teléfono desde el botón del email de la orden (cuando faltan las matrículas). La llave es la
// del enlace de la orden: el token del CMR del envío y su clave (el id del transportista).
// Al guardar con todas las matrículas, se le manda sola la orden COMPLETA (una vez) y se
// archiva el DeCA; al cliente le avisa la base de datos («Matrículas asignadas»).
export async function guardarMatriculas(token: string, clave: string, d: { camion: string; remolque: string; conductor: string; telefono: string; dia?: string | null }):
  Promise<{ resultado: string; completas?: boolean; conductor?: string | null; telefono?: string | null }> {
  comprobarEntrada("app/matriculas/[token]/acciones#guardarMatriculas", [token, clave, d]);
  const sb = supabasePublico();
  if (!sb || !/^[0-9a-f-]{36}$/i.test(token) || !/^[0-9a-f-]{36}$/i.test(clave)) return { resultado: 'error' };
  const { data: mant } = await sb.rpc('mantenimiento_activo');
  if (mant) return { resultado: 'mantenimiento' };
  const { data, error } = await sb.rpc('guardar_matriculas_enlace', {
    p_token: token, p_clave: clave, p_matricula_camion: d.camion, p_matricula_remolque: d.remolque,
    p_conductor_nombre: d.conductor, p_telefono: d.telefono, p_fecha_carga_prevista: d.dia || undefined,
  });
  if (error) return { resultado: 'error' };
  const r = data as { resultado: string; envio_id?: string; completas?: boolean; conductor?: string | null; telefono?: string | null };
  if (r.resultado === 'guardado' && r.envio_id) {
    try {
      const { programarCopiaDeca } = await import('@/lib/servidor/archivoDeca');
      await programarCopiaDeca({ token });
      if (r.completas) {
        const { avisoOrdenCompletaAhora } = await import('@/lib/servidor/avisosEnvio');
        await avisoOrdenCompletaAhora(r.envio_id);
      }
    } catch { /* el email nunca rompe el guardado */ }
  }
  return { resultado: r.resultado, completas: r.completas, conductor: r.conductor ?? null, telefono: r.telefono ?? null };
}
