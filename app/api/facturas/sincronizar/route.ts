import { ponerAlDiaFacturas } from '@/lib/servidor/facturasCopia';
import { revisarCentimos } from '@/lib/servidor/verificacionBanco';

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

export async function POST(req: Request) {
  try {
    // De noche, con alguien esperando su verificación (2026-11-27): solo la cuenta del céntimo,
    // sin la copia de facturas (una o dos consultas). Lo demás del cuerpo no se mira.
    const cuerpo = await req.json().catch(() => null) as { solo?: unknown } | null;
    if (cuerpo?.solo === 'centimos') {
      await revisarCentimos().catch((e) => console.error('[Holded] céntimos de verificación', e instanceof Error ? e.message : 'fallo'));
      return new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } });
    }
    const r = await ponerAlDiaFacturas();
    if (!r.ok && r.conectado) console.error('[Holded] copia de facturas', r.error);
  } catch (e) { console.error('[Holded] copia de facturas', e instanceof Error ? e.message : 'fallo'); }
  return new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } });
}
