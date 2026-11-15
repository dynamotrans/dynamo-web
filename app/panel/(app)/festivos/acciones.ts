'use server';

import { revalidatePath } from 'next/cache';
import { soloGestor } from '@/lib/guardia';
import { mensajeError } from '@/lib/mensajeError';
import { comprobarEntrada } from '@/lib/entradas/comprobar';

// Festivos de la plataforma (tabla `festivos`): los usan el corte de cancelación y los
// avisos a sitios (nacionales del país; autonómicos por la comunidad del CP del sitio;
// locales por su población). Alta y baja desde el panel, solo equipo Dynamo.

type Res = { ok: true } | { ok: false; error: string };

export type FestivoNuevo = {
  fecha: string;                                   // YYYY-MM-DD
  nombre: string;
  ambito: 'nacional' | 'comunidad' | 'local';
  comunidad?: string | null;                       // ISO 3166-2 (ES-AN…) si no es nacional
  poblacion?: string | null;                       // solo ámbito local
  pais?: string | null;                            // ISO del país, ES por defecto
  cada_anio: boolean;                              // true = se repite el mismo día cada año
};

export async function crearFestivo(d: FestivoNuevo): Promise<Res> {
  comprobarEntrada("app/panel/(app)/festivos/acciones#crearFestivo", [d]);
  const s = await soloGestor();
  if (!s) return { ok: false, error: 'Solo el equipo de Dynamo gestiona los festivos.' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.fecha)) return { ok: false, error: 'Pon la fecha del festivo.' };
  const nombre = d.nombre.trim();
  if (!nombre) return { ok: false, error: 'Pon el nombre del festivo.' };
  const pais = (d.pais ?? 'ES').trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(pais)) return { ok: false, error: 'El país va en ISO de 2 letras (ES, PT, FR…).' };
  if (d.ambito !== 'nacional' && !d.comunidad) return { ok: false, error: 'Elige la comunidad del festivo.' };
  if (d.ambito === 'local' && !d.poblacion?.trim()) return { ok: false, error: 'Pon la población del festivo local (tal y como está en los sitios).' };
  const { error } = await s.supabase.from('festivos').insert({
    fecha: d.fecha, nombre, pais_codigo_iso: pais,
    region: d.ambito === 'nacional' ? null : d.comunidad,
    poblacion: d.ambito === 'local' ? d.poblacion!.trim() : null,
    repetir: d.cada_anio ? 'cada_anio' : 'no',
  });
  if (error) return { ok: false, error: /duplicate|unique/i.test(error.message) ? 'Ese festivo ya está en la lista.' : mensajeError(error.message) };
  revalidatePath('/panel/festivos');
  return { ok: true };
}

export async function borrarFestivo(id: string): Promise<Res> {
  comprobarEntrada("app/panel/(app)/festivos/acciones#borrarFestivo", [id]);
  const s = await soloGestor();
  if (!s) return { ok: false, error: 'Solo el equipo de Dynamo gestiona los festivos.' };
  const { error } = await s.supabase.from('festivos').delete().eq('id', id);
  if (error) return { ok: false, error: mensajeError(error.message) };
  revalidatePath('/panel/festivos');
  return { ok: true };
}
