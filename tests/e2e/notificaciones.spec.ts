// NOTIFICACIONES (usuario, 2026-11-28): pantalla con un interruptor por notificación y sus
// canales (email / WhatsApp). Al activar, vuelve con los dos marcados.
import { expect } from '@playwright/test';
import { test, entrar, bd } from './ayudas';

test.describe('notificaciones', () => {
  test('Dynamo apaga y enciende una notificación y sus canales; las de seguridad no se tocan', async ({ page }) => {
    await entrar(page, 'dynamo');
    await page.goto('/panel/notificaciones');
    await expect(page.getByRole('heading', { name: 'Notificaciones', exact: true })).toBeVisible();
    const fila = page.locator('[data-tipo="vispera"]');
    await expect(fila).toContainText('Víspera de la carga');
    // Quitar el WhatsApp.
    await fila.getByLabel('WhatsApp').uncheck();
    await expect.poll(async () => (await bd().from('notificaciones').select('whatsapp').eq('tipo', 'vispera').single()).data?.whatsapp).toBe(false);
    // Apagarla y volver a encenderla: vuelve con email y WhatsApp.
    await fila.getByRole('switch').uncheck({ force: true });
    await expect.poll(async () => (await bd().from('notificaciones').select('activa').eq('tipo', 'vispera').single()).data?.activa).toBe(false);
    await fila.getByRole('switch').check({ force: true });
    await expect.poll(async () => (await bd().from('notificaciones').select('activa, email, whatsapp').eq('tipo', 'vispera').single()).data).toEqual({ activa: true, email: true, whatsapp: true });
    // «Ver mensaje»: el último email real (o el aviso de que aún no ha salido ninguno) y el WhatsApp.
    await fila.getByRole('button', { name: 'Ver mensaje' }).click();
    const ventana = page.locator('.dash-modal-card');
    await expect(ventana).toContainText('Víspera de la carga');
    await expect(ventana.locator('#ntf-email, .pt-aviso.info').first()).toBeVisible();
    await ventana.getByRole('tab', { name: 'WhatsApp' }).click();
    await expect(ventana.locator('#ntf-whatsapp, .pt-aviso.info').first()).toBeVisible();
    await page.keyboard.press('Escape');
    // La de seguridad: el interruptor no se puede tocar.
    await expect(page.locator('[data-tipo="codigo_firma"]').getByRole('switch')).toBeDisabled();
  });
});
