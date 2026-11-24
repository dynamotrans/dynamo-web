// Lista de clientes (equipo de Dynamo): el NOMBRE es un enlace que entra en la plataforma
// como ese cliente («Ver como»); el resto de la fila abre su ficha (usuario, 2026-11-24).
import { expect } from '@playwright/test';
import { test, entrar } from './ayudas';

test.describe('clientes', () => {
  test('lista de clientes: el nombre entra en su panel y el resto de la fila abre la ficha', async ({ page }) => {
    await entrar(page, 'dynamo');
    await page.goto('/panel/clientes');
    const fila = page.locator('#sec-clientes table.data tbody tr').first();
    const nombre = fila.locator('.enlace-ver-como');
    const texto = (await nombre.innerText()).trim();
    expect(texto.length).toBeGreaterThan(0);

    // El resto de la fila: la ficha de siempre (y no cambia de vista).
    await fila.locator('td').nth(1).click();
    await expect(page.locator('.dash-modal-card')).toContainText(texto);
    await page.keyboard.press('Escape');
    await expect(page).toHaveURL(/\/panel\/clientes/);

    // El nombre: entra en su panel, con «Viendo como: Cliente <nombre>» arriba.
    await nombre.click();
    await page.waitForURL(/\/panel\/dashboard$/);
    await expect(page.locator('.vista-nombre')).toHaveText(texto);
    // Y no se abrió la ficha por el camino.
    await expect(page.locator('.dash-modal-card')).toHaveCount(0);
  });
});
