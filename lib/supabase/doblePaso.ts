// DOBLE PASO (verificación en dos pasos) del equipo de Dynamo (usuario, 2026-11-18).
// Supabase guarda en el token de la sesión si el segundo paso está hecho: «aal2» en vez de
// «aal1». Aquí se lee ese nivel y se decide si a una sesión le falta el código.
//   · Con el parámetro `doble_paso_equipo` encendido, se le exige a todo usuario de Dynamo
//     (y la base de datos, además, no le reconoce sin él: migración doble_paso_equipo).
//   · Quien lo haya activado por su cuenta lo tiene que pasar siempre, se exija o no.
import type { SB } from '@/lib/supabase/cliente';
import { esDynamo } from '@/lib/roles';

export type Nivel = 'aal1' | 'aal2';

/** El nivel que lleva el token de la sesión. Sin token legible, «aal1». */
export function nivelDelToken(token: string | null | undefined): Nivel {
  try {
    const cuerpo = (token ?? '').split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const datos = JSON.parse(atob(cuerpo + '='.repeat((4 - (cuerpo.length % 4)) % 4)));
    return datos?.aal === 'aal2' ? 'aal2' : 'aal1';
  } catch {
    return 'aal1';
  }
}

type Factor = { id: string; status?: string; factor_type?: string };
/** Los móviles ya dados de alta (y comprobados) de un usuario. */
export const movilesDe = (user: { factors?: Factor[] | null } | null | undefined): Factor[] =>
  (user?.factors ?? []).filter((f) => f.status === 'verified' && (f.factor_type ?? 'totp') === 'totp');

export type EstadoDoblePaso = { nivel: Nivel; tieneMovil: boolean; obligatorio: boolean; falta: boolean };

/** ¿Le falta a esta sesión el segundo paso? */
export async function estadoDoblePaso(sb: SB, user: { factors?: Factor[] | null }, rol: string | null | undefined): Promise<EstadoDoblePaso> {
  const { data: { session } } = await sb.auth.getSession();
  const nivel = nivelDelToken(session?.access_token);
  const tieneMovil = movilesDe(user).length > 0;
  let obligatorio = false;
  // Solo se pregunta a la base de datos cuando hace falta: a un usuario de Dynamo.
  if (esDynamo(rol)) {
    const { data } = await sb.rpc('doble_paso_obligatorio');
    obligatorio = data === true;
  }
  return { nivel, tieneMovil, obligatorio, falta: nivel !== 'aal2' && (tieneMovil || obligatorio) };
}
