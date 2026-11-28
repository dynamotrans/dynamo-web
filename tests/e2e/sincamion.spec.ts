// ENVÍO SIN CAMIÓN (usuario, 2026-11-28): si pasa la fecha de carga sin transportista, el
// cliente ve en la ficha «Sin camión · elige nueva fecha» con los dos caminos (otra fecha o
// cancelar sin coste). Y en Nuevo envío, con ventana, la casilla «ampliar automáticamente».
import { expect } from '@playwright/test';
import { test, entrar, ultimoEnvio, bd, crearEnvioDeCliente } from './ayudas';

test.describe('envío sin camión', () => {
  test('la ficha del cliente ofrece elegir otra fecha o cancelar sin coste', async ({ page }) => {
    await entrar(page, 'cliente');
    await crearEnvioDeCliente(page);
    const e = await ultimoEnvio();
    const { error } = await bd().from('envios').update({ sin_camion_desde: new Date().toISOString() }).eq('id', e.id);
    expect(error).toBeNull();
    await page.goto(`/panel/envios?ver=${e.id}`);
    const caja = page.locator('#sin-camion');
    await expect(caja).toContainText('Sin camión · elige nueva fecha');
    await expect(caja.getByRole('link', { name: 'Elegir otra fecha' })).toHaveAttribute('href', `/panel/nuevo-envio?editar=${e.id}`);
    await expect(caja.getByRole('button', { name: 'Cancelar sin coste' })).toBeVisible();
    await bd().from('envios').update({ sin_camion_desde: null }).eq('id', e.id);
  });
});
