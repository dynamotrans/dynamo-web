// WHATSAPP, PARTE 1 (usuario, 2026-11-25): Meta entrega los mensajes en /api/whatsapp (solo si van
// firmados con la clave secreta de la app), se guardan enteros y el equipo los ve en la bandeja
// «WhatsApp», con quién escribe. Sin las claves de Meta (como aquí) no se puede contestar y la
// pantalla lo dice. Y cada usuario da o quita su permiso para los avisos por WhatsApp.
// Las claves de aquí (WHATSAPP_APP_SECRET, WHATSAPP_VERIFY_TOKEN) son SOLO de pruebas.
import { expect } from '@playwright/test';
import { createHmac } from 'node:crypto';
import { test, entrar, bd, EMAIL } from './ayudas';

const SECRETO = process.env.WHATSAPP_APP_SECRET ?? '';
const VERIFICAR = process.env.WHATSAPP_VERIFY_TOKEN ?? '';
const firma = (c: string) => 'sha256=' + createHmac('sha256', SECRETO).update(c, 'utf8').digest('hex');

test.describe('WhatsApp', () => {
  test('Meta entrega un mensaje firmado, el equipo lo ve en la bandeja y sin claves no se contesta', async ({ page, request }) => {
    test.skip(!SECRETO || !VERIFICAR, 'Faltan las claves de prueba de WhatsApp');
    const sv = bd();
    const { data: u } = await sv.from('usuarios').select('id, telefono').eq('email', EMAIL.cliente).single();
    const tel = '600' + String(Date.now()).slice(-6);
    await sv.from('usuarios').update({ telefono: '+34' + tel }).eq('id', u!.id);
    try {
      // Meta comprueba la URL una vez.
      const ok = await request.get(`/api/whatsapp?hub.mode=subscribe&hub.verify_token=${VERIFICAR}&hub.challenge=reto123`);
      expect(ok.status()).toBe(200);
      expect(await ok.text()).toBe('reto123');
      expect((await request.get('/api/whatsapp?hub.mode=subscribe&hub.verify_token=mala&hub.challenge=x')).status()).toBe(403);

      const wa = `wamid.e2e.${Date.now()}`;
      const cuerpo = JSON.stringify({ object: 'whatsapp_business_account', entry: [{ id: '1', changes: [{ field: 'messages', value: {
        messaging_product: 'whatsapp', contacts: [{ wa_id: '34' + tel, profile: { name: 'Cliente E2E' } }],
        messages: [{ from: '34' + tel, id: wa, timestamp: String(Math.floor(Date.now() / 1000)), type: 'text', text: { body: '¿Mi camión de Sevilla ya ha salido?' } }],
      } }] }] });
      // Sin firma (o con otra), fuera.
      expect((await request.post('/api/whatsapp', { data: cuerpo, headers: { 'content-type': 'application/json' } })).status()).toBe(401);
      const r = await request.post('/api/whatsapp', { data: cuerpo, headers: { 'content-type': 'application/json', 'x-hub-signature-256': firma(cuerpo) } });
      expect(r.status()).toBe(200);
      // Meta repite el aviso: no se guarda dos veces.
      await request.post('/api/whatsapp', { data: cuerpo, headers: { 'content-type': 'application/json', 'x-hub-signature-256': firma(cuerpo) } });
      const { count } = await sv.from('whatsapp_mensajes').select('id', { count: 'exact', head: true }).eq('wa_id', wa);
      expect(count).toBe(1);

      // El equipo: la conversación en la bandeja, con quién es y sin leer.
      await entrar(page, 'dynamo');
      await page.goto('/panel/whatsapp');
      const conv = page.locator('#wa-lista .wa-conv', { hasText: '¿Mi camión de Sevilla ya ha salido?' });
      await expect(conv).toBeVisible();
      await expect(conv).toContainText('Cliente');
      await expect(conv.locator('.sb-red')).toHaveText('1');
      await expect(page.locator('#wa-sin-conectar')).toBeVisible();
      // Al abrirla: el mensaje, se marca leída y sin claves de Meta no se puede contestar.
      await conv.click();
      await expect(page.locator('#wa-mensajes .wa-msg.entrada')).toContainText('¿Mi camión de Sevilla ya ha salido?');
      await expect(page.locator('#wa-no-contestar')).toContainText('no está conectado');
      await expect(page.locator('#wa-texto')).toHaveCount(0);
      await expect.poll(async () => (await sv.from('whatsapp_conversaciones').select('sin_leer').eq('telefono', '+34' + tel).single()).data?.sin_leer).toBe(0);
      // El cliente no entra en la bandeja.
      await entrar(page, 'cliente');
      await page.goto('/panel/whatsapp');
      await expect(page.locator('#sec-whatsapp')).toHaveCount(0);
    } finally {
      await sv.from('whatsapp_conversaciones').delete().eq('telefono', '+34' + tel);
      await sv.from('avisos').delete().eq('tipo', 'whatsapp');
      await sv.from('usuarios').update({ telefono: u!.telefono }).eq('id', u!.id);
    }
  });

  test('el usuario da y quita su permiso para los avisos por WhatsApp en Mi cuenta', async ({ page }) => {
    const sv = bd();
    const { data: u } = await sv.from('usuarios').select('id, telefono, avisos_whatsapp, avisos_whatsapp_en, avisos_whatsapp_preguntado_en').eq('email', EMAIL.cliente).single();
    await sv.from('usuarios').update({ telefono: '+34600365365', avisos_whatsapp: false, avisos_whatsapp_preguntado_en: null }).eq('id', u!.id);
    try {
      await entrar(page, 'cliente');
      // La pregunta única, arriba del panel.
      await page.goto('/panel/mi-cuenta');
      await expect(page.locator('#pregunta-whatsapp')).toContainText('¿Quieres recibir también por WhatsApp');
      const tarjeta = page.locator('#mc-whatsapp');
      await expect(tarjeta.locator('#mc-whatsapp-estado')).toHaveText('Desactivados');
      await tarjeta.getByRole('button', { name: 'Recibirlos también por WhatsApp' }).click();
      await expect(tarjeta.locator('#mc-whatsapp-estado')).toContainText('Activados');
      await expect(tarjeta.locator('#mc-whatsapp-estado')).toContainText('600 365 365');
      // Ya ha contestado: la pregunta no vuelve.
      await expect(page.locator('#pregunta-whatsapp')).toHaveCount(0);
      const yo = (await sv.from('usuarios').select('avisos_whatsapp, avisos_whatsapp_en').eq('id', u!.id).single()).data;
      expect(yo?.avisos_whatsapp).toBe(true);
      expect(yo?.avisos_whatsapp_en).toBeTruthy();
      await tarjeta.getByRole('button', { name: 'Quitar los avisos por WhatsApp' }).click();
      await expect(tarjeta.locator('#mc-whatsapp-estado')).toHaveText('Desactivados');
    } finally {
      await sv.from('usuarios').update({ telefono: u!.telefono, avisos_whatsapp: u!.avisos_whatsapp, avisos_whatsapp_en: u!.avisos_whatsapp_en,
        avisos_whatsapp_preguntado_en: u!.avisos_whatsapp_preguntado_en }).eq('id', u!.id);
    }
  });

  test('«Tomo yo» y «Que conteste Claude» en la bandeja, y qué se reenvía al móvil en Parámetros', async ({ page }) => {
    const sv = bd();
    const tel = '+34699' + String(Date.now()).slice(-6);
    const { data: c } = await sv.from('whatsapp_conversaciones').insert({ telefono: tel, nombre_perfil: 'Posible cliente E2E', quien: 'desconocido',
      ultima_entrada_en: new Date().toISOString(), ultimo_mensaje_en: new Date().toISOString(), ultimo_texto: '¿Hacéis portes a Oporto?' }).select('id').single();
    const { data: modo } = await sv.from('parametros').select('valor').eq('clave', 'whatsapp_reenvio_modo').single();
    try {
      await entrar(page, 'dynamo');
      await page.goto(`/panel/whatsapp?ver=${c!.id}`);
      await expect(page.locator('#wa-lleva-estado')).toHaveText('La lleva Claude');
      await page.locator('#wa-tomo').click();
      await expect(page.locator('#wa-lleva-estado')).toContainText('La lleva el equipo');
      await expect.poll(async () => (await sv.from('whatsapp_conversaciones').select('tomada_desde').eq('id', c!.id).single()).data?.tomada_desde).toBe('panel');
      await page.locator('#wa-devolver').click();
      await expect(page.locator('#wa-lleva-estado')).toHaveText('La lleva Claude');

      // Parámetros: qué se reenvía, con botones (no se escribe a mano).
      await page.goto('/panel/parametros');
      // Las secciones vienen plegadas (2026-11-28): se abre WhatsApp desde su apartado.
      await page.locator('.prm-apartado', { hasText: /^WhatsApp$/ }).click();
      const grupo = page.getByRole('radiogroup', { name: /qué se reenvía/i });
      await expect(grupo.locator('[data-valor="todo"]')).toHaveAttribute('aria-checked', 'true');
      await grupo.locator('[data-valor="importante"]').click();
      await expect(grupo.locator('[data-valor="importante"]')).toHaveAttribute('aria-checked', 'true');
      await expect.poll(async () => (await sv.from('parametros').select('valor').eq('clave', 'whatsapp_reenvio_modo').single()).data?.valor).toBe('importante');
    } finally {
      await sv.from('whatsapp_conversaciones').delete().eq('id', c!.id);
      await sv.from('parametros').update({ valor: modo!.valor }).eq('clave', 'whatsapp_reenvio_modo');
    }
  });
});
