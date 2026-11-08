// Ayudas de las pruebas en navegador: entrar como cada usuario y leer de la base de datos
// local (con la clave de servicio, solo para buscar ids y preparar casos; las acciones que
// se prueban van por la pantalla).
import { expect, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

export const CLAVE = 'Prueba-2026!';
export const EMAIL = { dynamo: 'dynamo@e2e.test', cliente: 'cliente@e2e.test', transportista: 'transportista@e2e.test' } as const;
export const CIF_TRANSPORTISTA = 'B76543214';

const URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
export const bd = () => createClient(URL, process.env.SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
/** Un cliente de Supabase con la sesión de ese usuario (para preparar casos por sus funciones). */
export async function como(quien: keyof typeof EMAIL) {
  const sb = createClient(URL, process.env.ANON_KEY!, { auth: { persistSession: false } });
  const { error } = await sb.auth.signInWithPassword({ email: EMAIL[quien], password: CLAVE });
  if (error) throw error;
  return sb;
}

export async function entrar(page: Page, quien: keyof typeof EMAIL) {
  await page.context().clearCookies();
  await page.goto('/panel/entrar');
  await page.fill('#portal-user', EMAIL[quien]);
  await page.fill('#portal-pass', CLAVE);
  await page.click('button[type=submit]');
  await page.waitForURL((u) => u.pathname.startsWith('/panel') && !u.pathname.startsWith('/panel/entrar'));
  await expect(page.locator('.sidebar, nav').first()).toBeVisible();
}

export async function ultimoEnvio() {
  const { data, error } = await bd().from('envios').select('id, referencia_gx, estado, estado_solicitud, estado_pago_previo, transportista_id, importe_cliente')
    .order('creado_en', { ascending: false }).limit(1).single();
  if (error) throw error;
  return data;
}
