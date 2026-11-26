import { ponerAlDiaFacturas } from '@/lib/servidor/facturasCopia';

// POST /api/facturas/sincronizar: «pon al día la copia de facturas emitidas». Lo llama cada 10
// minutos la tarea automática de la base de datos (facturas_avisar).
// Va SIN contraseña a propósito, como /api/brevo/sitios: lo que llega aquí no decide nada. El
// servidor mira en la base de datos qué toca (seguir la primera carga, lo de cada rato o el
// repaso de la noche) y no repite una pasada hecha hace menos de minuto y medio; quien llame
// de más no adelanta nada ni recibe ningún dato: se contesta siempre lo mismo.
// SOLO LECTURA de la facturación.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST() {
  try {
    const r = await ponerAlDiaFacturas();
    if (!r.ok && r.conectado) console.error('[Holded] copia de facturas', r.error);
  } catch (e) { console.error('[Holded] copia de facturas', e instanceof Error ? e.message : 'fallo'); }
  return new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } });
}
