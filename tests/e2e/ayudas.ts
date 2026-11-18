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
  const { data, error } = await bd().from('envios').select('id, referencia_gx, estado, estado_solicitud, estado_pago_previo, transportista_id, importe_cliente, fecha_carga_prevista')
    .order('creado_en', { ascending: false }).limit(1).single();
  if (error) throw error;
  return data;
}

// El cliente (ya dentro) crea un envío Sevilla → Madrid con el primer día posible. Ya no hay
// solicitudes de precio: el tarifador pone el precio y el envío nace programado, tras marcar
// las condiciones en la ventana de confirmación.
export async function crearEnvioDeCliente(page: Page) {
  await page.goto('/panel/nuevo-envio');
  const sitio = page.locator('.ptar-route-row input[type=text]');
  await sitio.nth(0).fill('Sevilla'); await page.locator('.ptar-sug li').first().click();
  await sitio.nth(1).fill('Madrid'); await page.locator('.ptar-sug li').first().click();
  await page.getByRole('button', { name: /Siguiente/ }).click();
  await page.getByRole('button', { name: /Siguiente/ }).click();
  await page.locator('select').filter({ has: page.locator('option', { hasText: 'Elige la fecha de recogida' }) }).selectOption({ index: 1 });
  await page.getByRole('button', { name: /Ver resumen/ }).click();
  // El tarifador ya ha calculado: la caja de importes (en Revisión va en modo solo
  // importes, sin la línea «Camión completo · km» de antes — usuario, 2026-11-14).
  await expect(page.locator('.ptar-sug-card .alm-price-base')).toBeVisible();
  await page.getByRole('button', { name: 'Crear envío' }).click();
  await page.locator('.dash-modal-card input[type=checkbox]').check();   // condiciones + cancelación
  await page.getByRole('button', { name: 'Confirmar envío' }).click();
  await expect(page.getByText(/Envío #?\S+ creado/)).toBeVisible();
}

// El cliente crea un envío (nace programado, con el precio del tarifador) y, si su cuenta paga
// por adelantado, Dynamo da la transferencia por recibida: programado, pagado y sin
// transportista. Devuelve su id.
export async function envioListo(page: Page): Promise<string> {
  await entrar(page, 'cliente');
  await crearEnvioDeCliente(page);
  const id = (await ultimoEnvio()).id;
  if ((await ultimoEnvio()).estado_pago_previo === 'pendiente') {
    await entrar(page, 'dynamo');
    await page.goto(`/panel/envios?ver=${id}`);
    await page.getByRole('button', { name: 'Ha llegado la transferencia' }).click();
    // Marcarla pide banco, concepto y fecha (el concepto y la fecha ya vienen puestos).
    await page.selectOption('#tr-banco', 'CaixaBank');
    await page.locator('#tr-confirmar').click();
    await expect.poll(async () => (await ultimoEnvio()).estado_pago_previo).toBe('pagado');
  }
  return id;
}
