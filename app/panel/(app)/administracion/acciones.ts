'use server';

import { sesion, esDynamo } from '@/lib/sesion';
import { comprobarEntrada } from '@/lib/entradas/comprobar';
import { holdedListo, leerHolded } from '@/lib/servidor/holded';
import { facturasDeHolded } from '@/lib/holdedFacturas';
import type { FacturaFila } from '@/components/panel/FacturasDynamo';

// Administración → Facturas (vista de Dynamo): las facturas EMITIDAS, leídas del programa de
// facturación en el momento. SOLO LECTURA (regla del usuario, 2026-11-24): aquí no se crea ni
// se cambia nada allí. Primer paso de la conexión: las 200 últimas ya aprobadas (una consulta).
// Las recibidas, la copia en nuestra base de datos y la vista del cliente van después.
export type FacturasEmitidas =
  | { ok: true; facturas: FacturaFila[]; hayMas: boolean }
  | { ok: false; conectado: boolean; error: string };

export async function facturasEmitidas(): Promise<FacturasEmitidas> {
  comprobarEntrada("app/panel/(app)/administracion/acciones#facturasEmitidas", []);
  const s = await sesion();
  if (!s?.perfil || s.perfil.estado !== 'activa' || !esDynamo(s.perfil.rol)) return { ok: false, conectado: false, error: 'Solo el equipo de Dynamo.' };
  if (!holdedListo()) return { ok: false, conectado: false, error: 'La facturación no está conectada en este entorno.' };
  const r = await leerHolded('/invoices', { limit: 200, sort: '-date', approval_status: 'approved' });
  if (!r.ok) return { ok: false, conectado: true, error: r.error };
  const hoy = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' });
  const { facturas, hayMas } = facturasDeHolded(r.datos, hoy);
  // Cada fila abre su PDF por nuestra propia ruta (que también es solo para Dynamo).
  return { ok: true, hayMas, facturas: facturas.map((f) => ({ ...f, pdf_url: `/api/facturas/${f.id}/pdf` })) };
}
