import 'server-only';
import { supabaseServicio } from '@/lib/supabase/servicio';

// CESCE (aseguradora de crédito): consulta del CIF al dar de alta una empresa (usuario,
// 2026-11-26). Se guarda el resultado (positivo / cero / denegado) y el importe aunque la
// empresa no esté verificada; el cliente NUNCA lo ve. La API todavía no está conectada
// (TODO #144: el usuario crea la aplicación en el portal de CESCE y pone las credenciales en
// Vercel). Hasta entonces no hace nada y la empresa queda «sin consultar»: Dynamo puede poner
// el importe a mano en Riesgos y el resultado sale solo.
export function cesceConectado(): boolean {
  return !!(process.env.CESCE_API_URL && process.env.CESCE_CLIENT_ID && process.env.CESCE_CLIENT_SECRET);
}

export async function consultarCesce(clienteId: string): Promise<'sin_api' | 'hecho' | 'error'> {
  if (!cesceConectado()) return 'sin_api';
  const sb = supabaseServicio();
  if (!sb) return 'error';
  // Cuando llegue la API: pedir la clasificación del CIF y guardar riesgo_cesce_euros,
  // riesgo_cesce_plazo_dias y cesce_resultado (positivo / cero / denegado) en clientes.
  console.error('[CESCE] API configurada pero la consulta aún no está programada; cliente', clienteId);
  return 'error';
}
