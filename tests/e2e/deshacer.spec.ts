// DESHACER EN INCIDENCIAS Y PENALIZACIONES (usuario, 2026-11-25): «E INCLUYE: incidencias,
// penalizaciones — 60 segundos». Abrir una incidencia o confirmar una penalización deja un
// contador en su pantalla; al pulsarlo y anular, vuelve atrás y no se avisa a nadie.
import { expect } from '@playwright/test';
import { test, entrar, ultimoEnvio, bd, crearEnvioDeCliente } from './ayudas';

test.describe('deshacer en incidencias y penalizaciones', () => {
  test('el cliente abre una incidencia y la deshace: queda retirada y sin emails', async ({ page }) => {
    await entrar(page, 'cliente');
    await crearEnvioDeCliente(page);
    const e = await ultimoEnvio();
    await page.goto(`/panel/incidencias?nueva=${e.id}`);
    await page.selectOption('#inc-tipo', { index: 1 });
    const detalle = `Prueba de deshacer ${Date.now()}`;
    await page.fill('#inc-det', detalle);
    await page.getByRole('button', { name: 'Enviar incidencia', exact: true }).click();
    // El contador sale arriba de la lista, con el nombre de lo que corre.
    const barra = page.locator('#sec-incidencias .cc-barra');
    await expect(barra).toContainText('Incidencia recién abierta');
    const sv = bd();
    const { data: inc } = await sv.from('incidencias').select('id, estado').eq('detalle', detalle).single();
    expect(inc?.estado).toBe('abierto');
    await barra.click();
    await expect(page.getByRole('heading', { name: '¿Deseas anular el cambio realizado?' })).toBeVisible();
    await page.getByRole('button', { name: 'Sí, anular', exact: true }).click();
    await expect(page.getByText(/Incidencia retirada: no se ha avisado a nadie/)).toBeVisible();
    await expect.poll(async () => (await sv.from('incidencias').select('estado').eq('id', inc!.id).single()).data?.estado).toBe('cancelado');
    const { data: mails } = await sv.from('emails_enviados').select('estado').like('clave', `%${inc!.id}%`);
    expect((mails ?? []).filter((m) => m.estado === 'pendiente')).toEqual([]);
    await page.getByRole('button', { name: 'Entendido', exact: true }).click();
    await expect(page.locator('#sec-incidencias .cc-barra')).toHaveCount(0);
  });

  test('Dynamo confirma una penalización y lo deshace: vuelve a pendiente de confirmar', async ({ page }) => {
    const sv = bd();
    const e = await ultimoEnvio();
    const { data: tipo } = await sv.from('tipos_penalizacion').select('id').limit(1).single();
    const { data: pen, error } = await sv.from('penalizaciones').insert({ envio_id: e.id, tipo_id: tipo!.id, importe_cliente: 50, descripcion: `Deshacer ${Date.now()}` }).select('id, codigo, estado').single();
    expect(error).toBeNull();
    expect(pen!.estado).toBe('pendiente_confirmar');
    await entrar(page, 'dynamo');
    await page.goto(`/panel/penalizaciones?q=${encodeURIComponent(pen!.codigo)}`);
    await page.locator('tr', { hasText: pen!.codigo }).first().click();
    await page.getByRole('button', { name: 'Confirmar penalización', exact: true }).click();
    const barra = page.locator('#sec-penalizaciones .cc-barra');
    await expect(barra).toContainText('Cambio en la penalización');
    await expect.poll(async () => (await sv.from('penalizaciones').select('estado').eq('id', pen!.id).single()).data?.estado).toBe('confirmada');
    await barra.click();
    await page.getByRole('button', { name: 'Sí, anular', exact: true }).click();
    await expect(page.getByText(/la penalización vuelve a como estaba/)).toBeVisible();
    // La ventana con el resultado se queda hasta que se cierra, aunque la página se refresque.
    await page.getByRole('button', { name: 'Entendido', exact: true }).click();
    await expect(page.locator('#sec-penalizaciones .cc-barra')).toHaveCount(0);
    await expect.poll(async () => (await sv.from('penalizaciones').select('estado').eq('id', pen!.id).single()).data?.estado).toBe('pendiente_confirmar');
    const { data: mails } = await sv.from('emails_enviados').select('estado').like('clave', `%${pen!.id}%`);
    expect((mails ?? []).filter((m) => m.estado === 'pendiente')).toEqual([]);
  });
});
