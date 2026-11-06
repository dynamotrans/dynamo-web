// El cliente de Supabase con los tipos de la base de datos (lib/supabase/tipos.ts): así
// TypeScript sabe qué columnas tiene cada tabla y qué devuelve cada función, y avisa si
// algo cambia de nombre en una migración.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './tipos';

export type SB = SupabaseClient<Database>;
