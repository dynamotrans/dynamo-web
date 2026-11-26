'use server';

import { sesion, esDynamo } from '@/lib/sesion';
import { comprobarEntrada } from '@/lib/entradas/comprobar';
import { ponerAlDiaFacturas } from '@/lib/servidor/facturasCopia';

// «CESCE - Riesgos»: volver a leer de la facturación lo que debe cada cliente. Es la misma
// puesta al día de la copia de facturas emitidas (Administración → Facturas). SOLO LECTURA allí.
export type LecturaDeuda = { ok: true } | { ok: false; conectado: boolean; error: string };

export async function actualizarDeuda(): Promise<LecturaDeuda> {
  comprobarEntrada("app/panel/(app)/riesgos/acciones#actualizarDeuda", []);
  const s = await sesion();
  if (!s?.perfil || s.perfil.estado !== 'activa' || !esDynamo(s.perfil.rol)) return { ok: false, conectado: false, error: 'Solo el equipo de Dynamo.' };
  const r = await ponerAlDiaFacturas({ forzar: true });
  return r.ok ? { ok: true } : r;
}
