import { supabaseServidor } from '@/lib/supabase/server';

// «Sigo aquí» del panel (cada 5 minutos con la pestaña a la vista): suma el tiempo
// conectado del usuario. Es una petición normal y no una acción de servidor: una acción
// lanzada al cargar la página puede chocar con el arranque del enrutador de Next.js y
// dejar la pantalla en «Application error» un instante. La base de datos no cuenta más
// de un latido cada 4 minutos; sin sesión no hace nada.
export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const supabase = await supabaseServidor();
    if (supabase) await supabase.rpc('latido');
  } catch { /* el tiempo conectado nunca debe romper nada */ }
  return new Response(null, { status: 204 });
}
