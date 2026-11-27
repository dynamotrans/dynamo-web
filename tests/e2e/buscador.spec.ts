// Buscador del panel (usuario, 2026-11-27): en Safari del iPhone, el ✓ que cierra el teclado quita
// el foco del campo, y la lista se cerraba con él: no se podía elegir un resultado. Ahora la lista
// solo se cierra al pulsar fuera, al elegir o con Escape.
import { expect } from '@playwright/test';
import { test, entrar } from './ayudas';

test.describe('buscador del panel', () => {
  test('al cerrar el teclado (el campo pierde el foco) la lista sigue abierta y se puede elegir', async ({ page }) => {
    // Un sitio que siempre está en los datos de prueba.
    const ref = 'Nave Madrid';
    await entrar(page, 'dynamo');
    await page.goto('/panel/dashboard-admin');
    const campo = page.getByLabel('Buscar en toda la plataforma');
    await campo.click();
    await campo.fill(ref);
    const lista = page.locator('.bgq-drop');
    await expect(lista.locator('.bgq-item').first()).toBeVisible({ timeout: 15_000 });
    // Lo que hace el ✓ del teclado del iPhone: quitar el foco, sin pulsar en ningún sitio.
    await campo.evaluate((el) => (el as HTMLInputElement).blur());
    await page.waitForTimeout(400);
    await expect(lista).toBeVisible();
    // Se elige un resultado y lleva a él.
    await lista.locator('.bgq-item').first().click();
    await expect(lista).toHaveCount(0);
    await expect(page).not.toHaveURL(/dashboard-admin$/);
    // Pulsar fuera sí la cierra.
    await page.goto('/panel/dashboard-admin');
    await campo.click();
    await expect(page.locator('.bgq-drop')).toBeVisible();
    await page.locator('h2, h1').first().click();
    await expect(page.locator('.bgq-drop')).toHaveCount(0);
  });
});
