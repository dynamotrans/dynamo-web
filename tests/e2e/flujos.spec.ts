// Los 5 flujos clave de la plataforma, de punta a punta en un navegador:
//   1. el cliente pide un envío · 2. Dynamo pone precio, el cliente acepta y paga (transferencia)
//   3. Dynamo asigna transportista · 4. un transportista acepta una carga por el enlace
//   5. se firma el CMR digital · 6. la plataforma en vivo: lo nuevo aparece sin refrescar.
import { test, expect, type Page } from '@playwright/test';
import { entrar, ultimoEnvio, bd, CIF_TRANSPORTISTA } from './ayudas';

// El cliente (ya dentro) pide un envío Sevilla → Madrid con el primer día posible.
async function pedirEnvio(page: Page) {
  await page.goto('/panel/nuevo-envio');
  const sitio = page.locator('.ptar-route-row input[type=text]');
  await sitio.nth(0).fill('Sevilla'); await page.locator('.ptar-sug li').first().click();
  await sitio.nth(1).fill('Madrid'); await page.locator('.ptar-sug li').first().click();
  await page.getByRole('button', { name: /Siguiente/ }).click();
  await page.getByRole('button', { name: /Siguiente/ }).click();
  await page.locator('select').filter({ has: page.locator('option', { hasText: 'Elige la fecha de recogida' }) }).selectOption({ index: 1 });
  await page.getByRole('button', { name: /Ver resumen/ }).click();
  await page.getByRole('button', { name: 'Enviar solicitud' }).click();
  await expect(page.getByText(/Solicitud #?\S+ enviada/)).toBeVisible();
}

// Pide un envío como cliente, le pone precio Dynamo, el cliente lo acepta y Dynamo da el pago
// por recibido: queda programado, pagado y sin transportista. Devuelve su id.
async function envioListo(page: Page): Promise<string> {
  await entrar(page, 'cliente');
  await pedirEnvio(page);
  const id = (await ultimoEnvio()).id;
  await entrar(page, 'dynamo');
  await page.goto(`/panel/envios?ver=${id}`);
  await page.getByRole('button', { name: 'Poner precio' }).click();
  await page.fill('#pp-pc', '1.200'); await page.fill('#pp-pt', '1.000');
  await page.getByRole('button', { name: 'Enviar precio al cliente' }).click();
  await expect.poll(async () => (await ultimoEnvio()).estado_solicitud).toBe('precio_propuesto');
  await entrar(page, 'cliente');
  await page.goto(`/panel/envios?ver=${id}`);
  const condiciones = page.locator('input[type=checkbox]');
  if (await condiciones.count()) await condiciones.first().check();
  await page.getByRole('button', { name: 'Aceptar precio y confirmar envío' }).click();
  await expect.poll(async () => (await ultimoEnvio()).estado).toBe('programado');
  if ((await ultimoEnvio()).estado_pago_previo === 'pendiente') {
    await entrar(page, 'dynamo');
    await page.goto(`/panel/envios?ver=${id}`);
    await page.getByRole('button', { name: 'Ha llegado la transferencia' }).click();
    await expect.poll(async () => (await ultimoEnvio()).estado_pago_previo).toBe('pagado');
  }
  return id;
}

test.describe.serial('flujos clave', () => {
  let envio = '';
  let envioAceptado = '';

  test('1 · el cliente pide un envío', async ({ page }) => {
    await entrar(page, 'cliente');
    await pedirEnvio(page);
    const e = await ultimoEnvio();
    expect(e.estado_solicitud).toBe('pendiente_precio');
    envio = e.id;
  });

  test('2 · Dynamo pone precio, el cliente lo acepta y paga por transferencia', async ({ page }) => {
    await entrar(page, 'dynamo');
    await page.goto(`/panel/envios?ver=${envio}`);
    await page.getByRole('button', { name: 'Poner precio' }).click();
    await page.fill('#pp-pc', '1.200');
    await page.fill('#pp-pt', '1.000');
    await page.getByRole('button', { name: 'Enviar precio al cliente' }).click();
    await expect(page.getByText(/precio/i).first()).toBeVisible();

    await entrar(page, 'cliente');
    await page.goto(`/panel/envios?ver=${envio}`);
    const condiciones = page.locator('input[type=checkbox]').filter({ hasNot: page.locator('[disabled]') });
    if (await condiciones.count()) await condiciones.first().check();
    await page.getByRole('button', { name: 'Aceptar precio y confirmar envío' }).click();
    await expect.poll(async () => (await ultimoEnvio()).estado).toBe('programado');
    expect((await ultimoEnvio()).estado_pago_previo).toBe('pendiente');   // primer envío: pago previo

    await entrar(page, 'dynamo');
    await page.goto(`/panel/envios?ver=${envio}`);
    await page.getByRole('button', { name: 'Ha llegado la transferencia' }).click();
    await expect.poll(async () => (await ultimoEnvio()).estado_pago_previo).toBe('pagado');
  });

  test('3 · Dynamo asigna transportista', async ({ page }) => {
    await entrar(page, 'dynamo');
    await page.goto(`/panel/envios?ver=${envio}`);
    await page.getByRole('button', { name: /Asignar transportista/ }).click();
    const tra = await page.locator('#as-tra option', { hasText: 'Transportes Prueba' }).getAttribute('value');
    await page.locator('#as-tra').selectOption(tra!);
    // Con ventana de carga, el día en que carga es obligatorio (lo usa el seguimiento automático).
    if (await page.locator('select#as-dia').count()) await page.locator('select#as-dia').selectOption({ index: 1 });
    await page.fill('#as-camion', '1234BCD');
    await page.fill('#as-conductor', 'Juan Prueba');
    await page.getByRole('button', { name: 'Guardar asignación' }).click();
    await expect.poll(async () => (await ultimoEnvio()).transportista_id).not.toBeNull();

    // Seguimiento: se marca a mano «Yendo a la carga» desde el cambiador de etapas.
    await page.reload();
    await page.getByRole('button', { name: 'Cambiar estado' }).click();
    await page.getByRole('radio', { name: /Yendo a la carga/ }).check();
    await page.getByRole('button', { name: 'Marcar esta etapa' }).click();
    await expect.poll(async () => (await ultimoEnvio()).estado).toBe('hacia_la_carga');
  });

  test('4 · un transportista acepta una carga por el enlace', async ({ page, browser }) => {
    const id = await envioListo(page);
    await entrar(page, 'dynamo');
    await page.goto(`/panel/envios?ver=${id}`);
    await page.getByRole('button', { name: 'Ofrecer envío' }).click();
    await page.locator('#of-para').selectOption('bolsa');
    await page.getByRole('button', { name: 'Crear oferta y enlace' }).click();
    const enlace = await page.locator('#of-enlace').inputValue();
    expect(enlace).toMatch(/\/carga\//);

    // El transportista, sin cuenta, desde el enlace de la bolsa.
    const t = await (await browser.newContext({ locale: 'es-ES' })).newPage();
    await t.goto(enlace);
    await t.getByRole('button', { name: 'Reservar y aceptar este envío' }).click();
    await t.fill('#f-cif', CIF_TRANSPORTISTA);
    await t.fill('#f-tractora', '5678CDF');
    await t.fill('#f-chofer', 'Ana Conductora');
    await t.getByRole('button', { name: 'ACEPTAR envío' }).click();
    await expect(t.getByText('¡Envío aceptado!')).toBeVisible();
    await expect.poll(async () => (await ultimoEnvio()).transportista_id).not.toBeNull();
    envioAceptado = id;
  });
  test('5 · se firma el CMR digital', async ({ page, browser }) => {
    expect(envioAceptado).not.toBe('');
    await entrar(page, 'dynamo');
    await page.goto(`/panel/envios?ver=${envioAceptado}`);
    await page.getByRole('button', { name: 'Crear enlace para firmar' }).click();
    const href = await page.locator('a[href^="/cmr/"]').first().getAttribute('href');
    expect(href).toBeTruthy();

    // Firma el cargador (remitente) con el dedo, sin cuenta, desde el enlace.
    const f = await (await browser.newContext({ locale: 'es-ES', hasTouch: true })).newPage();
    await f.goto(href!);
    await f.getByRole('button', { name: 'Firmar' }).first().click();
    await f.fill('#sigNombre', 'Pedro Cargador');
    await f.fill('#sigDni', '12345678Z');
    const lienzo = await f.locator('#sigCanvas').boundingBox();
    expect(lienzo).not.toBeNull();
    const { x, y, width: w, height: h } = lienzo!;
    await f.mouse.move(x + w * 0.2, y + h * 0.5); await f.mouse.down();
    for (let k = 1; k <= 12; k++) await f.mouse.move(x + w * (0.2 + k * 0.05), y + h * (0.5 + Math.sin(k) * 0.25));
    await f.mouse.up();
    await f.getByRole('button', { name: 'Aceptar firma' }).click();
    await expect.poll(async () => {
      const { count } = await bd().from('firmas_cmr').select('*', { count: 'exact', head: true }).eq('envio_id', envioAceptado);
      return count;
    }).toBe(1);
  });

  test('6 · en vivo: el envío que pide un cliente le aparece a Dynamo sin refrescar', async ({ page, browser }) => {
    await entrar(page, 'dynamo');
    await page.goto('/panel/envios');
    // La solicitud nueva entra en «Solicitudes de precio» (la pestaña no sale si está vacía).
    const pestana = page.locator('a.tab').filter({ hasText: /^Solicitudes de precio \(\d+\)$/ });
    const cuantas = async () => (await pestana.count()) ? Number(/\((\d+)\)/.exec((await pestana.first().textContent()) ?? '')?.[1]) : 0;
    const antes = await cuantas();
    expect(antes).toBeGreaterThanOrEqual(0);

    const cli = await (await browser.newContext({ locale: 'es-ES' })).newPage();
    await entrar(cli, 'cliente');
    await pedirEnvio(cli);

    // Sin recargar la página de Dynamo: el contador se mueve solo.
    await expect.poll(cuantas, { timeout: 20_000 }).toBe(antes + 1);
  });
});
