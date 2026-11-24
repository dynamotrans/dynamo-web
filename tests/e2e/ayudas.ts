// Ayudas de las pruebas en navegador: entrar como cada usuario y leer de la base de datos
// local (con la clave de servicio, solo para buscar ids y preparar casos; las acciones que
// se prueban van por la pantalla).
import { test as base, expect, type Page } from '@playwright/test';

// `test` de las pruebas: el de Playwright, con un `page.goto` que REINTENTA cuando la
// plataforma todavía está terminando una redirección suya (p. ej. /panel → la portada del
// rol nada más entrar). Chrome deja que el `goto` nuevo gane; el motor de Safari lo corta
// con «interrupted by another navigation». Un usuario de verdad no navega mientras la
// página se está redirigiendo, así que reintentar es lo correcto, no un parche.
export const test = base.extend({
  page: async ({ page }, usar) => {
    const ir = page.goto.bind(page);
    page.goto = (async (url: string, opciones?: Parameters<Page['goto']>[1]) => {
      for (let intento = 0; ; intento++) {
        try { return await ir(url, opciones); }
        catch (e) {
          if (intento >= 3 || !/interrupted by another navigation/i.test(String(e))) throw e;
          await page.waitForLoadState('load').catch(() => {});
          await page.waitForTimeout(250);
        }
      }
    }) as Page['goto'];
    await usar(page);
  },
});
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
  // Entrar lleva a /panel y de ahí, con otra redirección, a la portada del rol
  // (/panel/dashboard-admin, /panel/dashboard o /panel/envios): se espera a ESA, no a la de
  // paso, para no navegar a otra pantalla con la redirección a medias.
  await page.waitForURL((u) => /^\/panel\/.+/.test(u.pathname) && !u.pathname.startsWith('/panel/entrar'));
  await page.waitForLoadState('load');
  await expect(page.locator('.sidebar, nav').first()).toBeVisible();
}

export async function ultimoEnvio() {
  const { data, error } = await bd().from('envios').select('id, referencia_gx, estado, estado_solicitud, estado_pago_previo, transportista_id, importe_cliente, fecha_carga_prevista')
    .order('creado_en', { ascending: false }).limit(1).single();
  if (error) throw error;
  return data;
}

// Un envío del transportista de pruebas en «programado», con la carga la semana que viene.
// Los recorridos anteriores le asignan envíos que cargan HOY y que el seguimiento automático
// pasa solo a «Yendo a la carga» según la hora del día: buscar «el último programado» fallaba
// cuando el CI corría a media mañana. Aquí se coge el último y se deja como hace falta.
export async function envioProgramadoDelTransportista(campos = 'id') {
  const sb = bd();
  const { data: t } = await sb.from('transportistas').select('id').eq('cif', CIF_TRANSPORTISTA).single();
  const { data: ult, error } = await sb.from('envios').select('id').eq('transportista_id', t!.id)
    .in('estado', ['programado', 'hacia_la_carga', 'cargando']).order('creado_en', { ascending: false }).limit(1).single();
  if (error) throw error;
  const d = new Date(); d.setDate(d.getDate() + 7);
  if (d.getDay() === 6) d.setDate(d.getDate() + 2); else if (d.getDay() === 0) d.setDate(d.getDate() + 1);
  const dia = d.toISOString().slice(0, 10);
  const sig = new Date(d); sig.setDate(sig.getDate() + (d.getDay() === 5 ? 3 : 1));
  const { error: e2 } = await sb.from('envios').update({
    estado: 'programado', ancla_paso: null, ancla_hora: null,
    fecha_carga_desde: dia, fecha_carga_hasta: dia, fecha_carga_prevista: dia, fecha_entrega_estimada: sig.toISOString().slice(0, 10),
  }).eq('id', ult!.id);
  if (e2) throw e2;
  const { data: e } = await sb.from('envios').select(campos).eq('id', ult!.id).single();
  return { t: t!, e: e as unknown as Record<string, string | null> & { id: string } };
}

// El cliente (ya dentro) crea un envío Sevilla → Madrid con el primer día posible. Ya no hay
// solicitudes de precio: el tarifador pone el precio y el envío nace programado, tras marcar
// las condiciones en la ventana de confirmación.
export async function crearEnvioDeCliente(page: Page, enConfirmar?: () => Promise<void>) {
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
  if (enConfirmar) await enConfirmar();   // lo que haya que mirar en la ventana de confirmar
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

// El código de 6 cifras que daría Google Authenticator para una clave (TOTP, RFC 6238):
// para las pruebas del doble paso.
import { createHmac } from 'node:crypto';
export function codigoDelMovil(clave: string, cuando = Date.now()): string {
  const ABC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const c of clave.replace(/=+$/, '').toUpperCase()) bits += ABC.indexOf(c).toString(2).padStart(5, '0');
  const bytes = Buffer.from((bits.match(/.{8}/g) ?? []).map((b) => parseInt(b, 2)));
  const paso = Buffer.alloc(8); paso.writeBigUInt64BE(BigInt(Math.floor(cuando / 30000)));
  const h = createHmac('sha1', bytes).update(paso).digest();
  const o = h[h.length - 1] & 0xf;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}
