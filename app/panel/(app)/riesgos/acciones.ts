'use server';

import { sesion, esDynamo } from '@/lib/sesion';
import { comprobarEntrada } from '@/lib/entradas/comprobar';
import { refrescarDeuda, type LecturaDeuda } from '@/lib/servidor/holdedDeuda';

// «CESCE - Riesgos»: volver a leer de la facturación lo que debe cada cliente (facturas
// emitidas con algo pendiente de cobro). SOLO LECTURA allí; aquí se guarda la foto.
export async function actualizarDeuda(): Promise<LecturaDeuda> {
  comprobarEntrada("app/panel/(app)/riesgos/acciones#actualizarDeuda", []);
  const s = await sesion();
  if (!s?.perfil || s.perfil.estado !== 'activa' || !esDynamo(s.perfil.rol)) return { ok: false, conectado: false, error: 'Solo el equipo de Dynamo.' };
  return refrescarDeuda();
}
