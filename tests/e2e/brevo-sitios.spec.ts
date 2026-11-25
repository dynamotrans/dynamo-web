// SITIOS → BREVO (usuario, 2026-11-25): «quiero que esos mails de sitios, de todos los sitios,
// se suban a Brevo… lista 04-SITIOS-DYNAMO». Aquí no hay clave de Brevo (ni debe haberla): se
// comprueba que nace apagado (a mano), que Mantenimiento lo enseña con sus cifras y con la
// lista para revisar, y que, sin encender y sin clave, la puerta del servidor no sube nada.
import { expect } from '@playwright/test';
import { test, entrar, bd } from './ayudas';

test.describe('sitios a Brevo', () => {
  test('nace apagado: Mantenimiento lo enseña y la puerta del servidor no sube nada', async ({ page }) => {
    const sv = bd();
    await entrar(page, 'dynamo');
    await page.goto('/panel/mantenimiento');
    const caja = page.locator('#brevo-sitios');
    await expect(caja).toContainText('Emails de los sitios a Brevo');
    // Aquí no hay clave de Brevo: lo dice, y el botón de subir no se puede pulsar.
    await expect(caja.locator('#brevo-sitios-estado')).toHaveText('Falta la clave');
    // Nace en «a mano»: nada sube solo, se revisa la lista y se pulsa (usuario, 2026-11-25: «OK, reviso»).
    await expect(caja.locator('#brevo-sitios-modo')).toContainText('No sube nada solo');
    await expect(caja).toContainText('04-SITIOS-DYNAMO');
    await expect(caja).toContainText('No envía ningún email');
    // Los datos de prueba traen un sitio con una persona de contacto con email.
    expect(Number(await caja.locator('#brevo-candidatos').innerText())).toBeGreaterThanOrEqual(1);
    await expect(caja.locator('#brevo-subidos')).toHaveText('0');
    await expect(caja.locator('#brevo-subir')).toBeDisabled();
    // La lista para revisar: los mismos que «Por subir», con su email y por qué suben.
    const filas = caja.locator('#brevo-por-subir .brevo-fila');
    expect(await filas.count()).toBeGreaterThanOrEqual(1);
    await expect(filas.first()).toContainText('@');
    await expect(filas.first()).toContainText('Nuevo');
    // La puerta que llama la tarea diaria: contesta siempre lo mismo y, apagado, no hace nada.
    const estado = await page.evaluate(async () => (await fetch('/api/brevo/sitios', { method: 'POST', body: '{}' })).status);
    expect(estado).toBe(204);
    const { count } = await sv.from('brevo_subidas').select('email', { count: 'exact', head: true });
    expect(count).toBe(0);
    // El interruptor está en Parámetros, con su explicación.
    await page.goto('/panel/parametros');
    await expect(page.getByText('Brevo: sitios de la plataforma').first()).toBeVisible();
  });
});
