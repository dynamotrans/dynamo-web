'use server';

import { mensajeError } from '@/lib/mensajeError';
import { supabaseServicio } from '@/lib/supabase/servicio';
import { soloAdminMaster } from '@/lib/guardia';
import { comprobarEntrada } from '@/lib/entradas/comprobar';

// Archivos sueltos del almacén privado (subidas que se cortaron antes de registrar su
// fila). Solo el Admin Master, y con la clave de servicio: desde la web no se borra
// ningún fichero. Lo que se lista lo decide la base de datos (archivos_sueltos(): sin
// ninguna fila que lo nombre y con más de 24 horas).
type Res<T> = ({ ok: true } & T) | { ok: false; error: string };
const SIN_CLAVE = 'Falta conectar la clave de servicio de Supabase en Vercel (SUPABASE_SERVICE_ROLE_KEY).';

const adminMaster = async () => !!(await soloAdminMaster());

export async function contarArchivosSueltos(): Promise<Res<{ n: number; bytes: number }>> {
  comprobarEntrada("app/panel/(app)/mantenimiento/acciones#contarArchivosSueltos", []);
  if (!(await adminMaster())) return { ok: false, error: 'Solo el administrador puede hacer esto.' };
  const sv = supabaseServicio();
  if (!sv) return { ok: false, error: SIN_CLAVE };
  const { data, error } = await sv.rpc('archivos_sueltos', { p_horas: 24 });
  if (error) return { ok: false, error: mensajeError(error.message) };
  const filas = (data ?? []) as { bytes: number }[];
  return { ok: true, n: filas.length, bytes: filas.reduce((a, f) => a + Number(f.bytes || 0), 0) };
}

export async function borrarArchivosSueltos(): Promise<Res<{ borrados: number }>> {
  comprobarEntrada("app/panel/(app)/mantenimiento/acciones#borrarArchivosSueltos", []);
  if (!(await adminMaster())) return { ok: false, error: 'Solo el administrador puede hacer esto.' };
  const sv = supabaseServicio();
  if (!sv) return { ok: false, error: SIN_CLAVE };
  const { data, error } = await sv.rpc('archivos_sueltos', { p_horas: 24 });
  if (error) return { ok: false, error: mensajeError(error.message) };
  const rutas = ((data ?? []) as { ruta: string }[]).map((f) => f.ruta);
  let borrados = 0;
  for (let i = 0; i < rutas.length; i += 100) {
    const { data: r, error: e } = await sv.storage.from('documentos').remove(rutas.slice(i, i + 100));
    if (e) return { ok: false, error: `Se han borrado ${borrados} y luego ha fallado: ${e.message}` };
    borrados += r?.length ?? 0;
  }
  return { ok: true, borrados };
}

// Sitios → Brevo (usuario, 2026-11-25): «Subir ahora» desde Mantenimiento, para no esperar a
// la tarea de la mañana y para probarlo. Hace lo mismo que la tarea; solo el Admin Master. Si
// la subida está apagada en Parámetros, no sube nada y lo dice.
export async function subirSitiosABrevoAhora(): Promise<Res<{ aviso: string }>> {
  comprobarEntrada("app/panel/(app)/mantenimiento/acciones#subirSitiosABrevoAhora", []);
  if (!(await adminMaster())) return { ok: false, error: 'Solo el administrador puede hacer esto.' };
  const { subirSitiosABrevo } = await import('@/lib/servidor/brevoSitios');
  // El botón es la subida A MANO (tras revisar la lista): no depende del interruptor, que solo
  // decide si además suben solos cada mañana (usuario, 2026-11-25: «OK, reviso»).
  const r = await subirSitiosABrevo({ aunqueApagado: true });
  switch (r.estado) {
    case 'apagado': return { ok: false, error: 'No se ha podido subir. Inténtalo de nuevo.' };
    case 'sin_clave': return { ok: false, error: 'Falta la clave de Brevo en Vercel (BREVO_API_KEY).' };
    case 'sin_servicio': return { ok: false, error: SIN_CLAVE };
    case 'error': return { ok: false, error: r.error };
    default:
      return { ok: true, aviso: `${r.listaCreada ? `Lista «${r.lista}» creada en Brevo. ` : ''}Subidos a «${r.lista}»: ${r.subidos}.${r.errores ? ` Con fallo: ${r.errores} (se reintentan mañana).` : ''}${r.quedan ? ' Quedan más: vuelve a pulsar.' : ''}${r.subidos + r.errores === 0 ? ' No había ninguno nuevo.' : ''}` };
  }
}
