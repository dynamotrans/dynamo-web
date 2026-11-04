'use server';

import { sesion } from '@/lib/sesion';
import { supabaseServicio } from '@/lib/supabase/servicio';

// Archivos sueltos del almacén privado (subidas que se cortaron antes de registrar su
// fila). Solo el Admin Master, y con la clave de servicio: desde la web no se borra
// ningún fichero. Lo que se lista lo decide la base de datos (archivos_sueltos(): sin
// ninguna fila que lo nombre y con más de 24 horas).
type Res<T> = ({ ok: true } & T) | { ok: false; error: string };
const SIN_CLAVE = 'Falta conectar la clave de servicio de Supabase en Vercel (SUPABASE_SERVICE_ROLE_KEY).';

async function adminMaster() {
  const s = await sesion();
  return !!s?.perfil && s.perfil.estado === 'activa' && s.perfil.rol === 'admin';
}

export async function contarArchivosSueltos(): Promise<Res<{ n: number; bytes: number }>> {
  if (!(await adminMaster())) return { ok: false, error: 'Solo el administrador puede hacer esto.' };
  const sv = supabaseServicio();
  if (!sv) return { ok: false, error: SIN_CLAVE };
  const { data, error } = await sv.rpc('archivos_sueltos', { p_horas: 24 });
  if (error) return { ok: false, error: error.message };
  const filas = (data ?? []) as { bytes: number }[];
  return { ok: true, n: filas.length, bytes: filas.reduce((a, f) => a + Number(f.bytes || 0), 0) };
}

export async function borrarArchivosSueltos(): Promise<Res<{ borrados: number }>> {
  if (!(await adminMaster())) return { ok: false, error: 'Solo el administrador puede hacer esto.' };
  const sv = supabaseServicio();
  if (!sv) return { ok: false, error: SIN_CLAVE };
  const { data, error } = await sv.rpc('archivos_sueltos', { p_horas: 24 });
  if (error) return { ok: false, error: error.message };
  const rutas = ((data ?? []) as { ruta: string }[]).map((f) => f.ruta);
  let borrados = 0;
  for (let i = 0; i < rutas.length; i += 100) {
    const { data: r, error: e } = await sv.storage.from('documentos').remove(rutas.slice(i, i + 100));
    if (e) return { ok: false, error: `Se han borrado ${borrados} y luego ha fallado: ${e.message}` };
    borrados += r?.length ?? 0;
  }
  return { ok: true, borrados };
}
