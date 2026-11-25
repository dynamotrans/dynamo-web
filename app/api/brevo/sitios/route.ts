import { subirSitiosABrevo } from '@/lib/servidor/brevoSitios';

// POST /api/brevo/sitios: «sube a Brevo los emails de sitios que toquen». Lo llama cada mañana
// la tarea automática de la base de datos (brevo_sitios_avisar).
// Va SIN contraseña a propósito, como /api/stripe/caducar: lo que llega aquí no decide nada.
// El servidor mira en la base de datos si la subida está encendida y qué emails tocan; quien
// llame de más solo adelanta un trabajo que se iba a hacer igual (cada email sube una vez), y
// no recibe ningún dato: se contesta siempre lo mismo.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST() {
  try { await subirSitiosABrevo(); } catch (e) { console.error('[Brevo] subida de sitios', e); }
  return new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } });
}
