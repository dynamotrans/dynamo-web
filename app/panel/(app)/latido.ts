'use server';

import { supabaseServidor } from '@/lib/supabase/server';

// «Sigo aquí» del panel (cada 5 minutos con la pestaña a la vista): suma el tiempo
// conectado del usuario. La base de datos no cuenta más de uno cada 4 minutos.
export async function latido(): Promise<void> {
  const supabase = await supabaseServidor();
  if (!supabase) return;
  await supabase.rpc('latido');
}
