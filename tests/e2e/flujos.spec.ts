// Los 5 flujos clave de la plataforma, de punta a punta en un navegador:
//   1. el cliente crea un envío (el precio lo pone el tarifador automático) · 2. nace pendiente
//   de pago y Dynamo da la transferencia por recibida · 3. Dynamo asigna transportista
//   4. un transportista acepta una carga por el enlace · 5. se firma el CMR digital
//   6. la plataforma en vivo: lo nuevo aparece sin refrescar.
import { expect } from '@playwright/test';
import { test, entrar, ultimoEnvio, bd, CIF_TRANSPORTISTA, crearEnvioDeCliente, envioListo } from './ayudas';

test.describe.serial('flujos clave', () => {
  let envio = '';
  let envioAceptado = '';

  test('1 · el cliente crea un envío con el precio del tarifador', async ({ page }) => {
    await entrar(page, 'cliente');
    await crearEnvioDeCliente(page);
    const e = await ultimoEnvio();
    expect(e.estado).toBe('programado');                          // nace programado, sin solicitud
    expect(Number(e.importe_cliente)).toBeGreaterThan(0);         // el precio lo puso el tarifador
    envio = e.id;
  });

  test('2 · el envío nace pendiente de pago y Dynamo da la transferencia por recibida', async ({ page }) => {
    expect((await ultimoEnvio()).estado_pago_previo).toBe('pendiente');   // primer envío: pago previo
    await entrar(page, 'dynamo');
    await page.goto(`/panel/envios?ver=${envio}`);
    await page.getByRole('button', { name: 'Ha llegado la transferencia' }).click();
    // Marcarla pide banco, concepto y fecha (el concepto y la fecha ya vienen puestos).
    await page.selectOption('#tr-banco', 'CaixaBank');
    await page.locator('#tr-confirmar').click();
    await expect.poll(async () => (await ultimoEnvio()).estado_pago_previo).toBe('pagado');
  });

  test('3 · Dynamo asigna transportista', async ({ page }) => {
    await entrar(page, 'dynamo');
    await page.goto(`/panel/envios?ver=${envio}`);
    await page.getByRole('button', { name: /Asignar transportista/ }).click();
    // El transportista se elige con el buscador (escribir → elegir en la lista), ya no con un desplegable.
    await page.fill('#as-tra', 'Transportes Prueba');
    await page.locator('.buscador-lista button', { hasText: 'Transportes Prueba' }).first().click();
    await expect(page.locator('.buscador-elegido')).toContainText('Transportes Prueba');
    // Con ventana de carga, el día en que carga es obligatorio (lo usa el seguimiento automático).
    if (await page.locator('select#as-dia').count()) {
      // El primer día que se puede elegir (sábado y domingo salen sin poder elegirse: no se circula).
      const dia = await page.locator('select#as-dia option:not([disabled])').nth(1).getAttribute('value');
      await page.locator('select#as-dia').selectOption(dia!);
    }
    // Día de entrega (estimado): obligatorio al asignar (usuario, 2026-11-09).
    const ent = await page.locator('select#as-ent option:not([disabled])').nth(1).getAttribute('value');
    await page.locator('select#as-ent').selectOption(ent!);
    // El precio del transportista es obligatorio y mayor que 0 (usuario, 2026-11-15: nunca
    // una asignación —ni una orden de carga— a precio 0). El envío del cliente nace sin él.
    await page.fill('#as-precio', '600');
    await page.fill('#as-camion', '1234BCD');
    await page.fill('#as-conductor', 'Juan Prueba');
    await page.getByRole('button', { name: 'Guardar asignación' }).click();
    await expect.poll(async () => (await ultimoEnvio()).transportista_id).not.toBeNull();

    // Seguimiento: se marca a mano «Yendo a la carga» desde el cambiador de etapas, que
    // vive DENTRO de la sección unificada «Envío y seguimiento» (acordeón, plegada al abrir).
    await page.reload();
    const secSeg = page.getByRole('button', { name: /Envío y seguimiento/ }).first();
    if ((await secSeg.getAttribute('aria-expanded')) !== 'true') await secSeg.click();
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
    // El enlace de la oferta nace con el envío: el modal suele abrirse ya en la pantalla de
    // compartir. Si el envío no traía precio del transportista, se crea aquí (precio prefilado).
    await expect(page.locator('#of-enlace').or(page.getByRole('button', { name: 'Crear oferta y enlace' })).first()).toBeVisible();
    if (await page.getByRole('button', { name: 'Crear oferta y enlace' }).isVisible()) {
      await page.getByRole('button', { name: 'Crear oferta y enlace' }).click();
    }
    const enlace = await page.locator('#of-enlace').inputValue();
    expect(enlace).toMatch(/\/carga\//);

    // El transportista, sin cuenta, desde el enlace de la bolsa.
    const t = await (await browser.newContext({ locale: 'es-ES' })).newPage();
    await t.goto(enlace);
    await t.getByRole('button', { name: 'Reservar y aceptar este envío' }).click();
    await t.fill('#f-cif', CIF_TRANSPORTISTA);
    await t.fill('#f-tractora', '5678CDF');
    await t.fill('#f-chofer', 'Ana Conductora');
    // Con ventana de carga, el día se elige YA al aceptar (usuario, 2026-11-10).
    if (await t.locator('select#f-dia').count()) {
      const dia = await t.locator('select#f-dia option:not([disabled])').nth(1).getAttribute('value');
      await t.locator('select#f-dia').selectOption(dia!);
    }
    await t.getByRole('button', { name: 'ACEPTAR envío' }).click();
    await expect(t.getByText('¡Envío aceptado!')).toBeVisible();
    await expect.poll(async () => (await ultimoEnvio()).transportista_id).not.toBeNull();
    // Con ventana, el día elegido al aceptar queda guardado en el envío.
    if (await t.locator('select#ok-dia').count()) {
      await expect.poll(async () => (await ultimoEnvio()).fecha_carga_prevista).not.toBeNull();
    }
    // Y el editor de vehículo FUNCIONA después de aceptar (usuario, 2026-11-10:
    // guardar devolvía el error genérico): se añade el remolque y se guarda.
    await t.fill('#ok-remolque', 'R1234BCD');
    await t.getByRole('button', { name: /(Guardar|Actualizar) vehículo y conductor/ }).click();
    await expect(t.getByText('Vehículo y conductor guardados.')).toBeVisible();
    envioAceptado = id;
  });
  test('5 · se firma el CMR digital', async ({ page, browser }) => {
    expect(envioAceptado).not.toBe('');
    await entrar(page, 'dynamo');
    await page.goto(`/panel/envios?ver=${envioAceptado}`);
    // TODO lo del CMR vive detrás del botón «eCMR» de la ficha (vista propia
    // con la página de firma, compartir el enlace y el PDF relleno).
    await page.getByRole('button', { name: /eCMR/ }).first().click();
    const href = await page.locator('a[href^="/cmr/"]').first().getAttribute('href');
    expect(href).toBeTruthy();

    // Firma el cargador (remitente) con el dedo, sin cuenta, desde el enlace.
    const f = await (await browser.newContext({ locale: 'es-ES', hasTouch: true })).newPage();
    await f.goto(href!);
    await f.getByRole('button', { name: 'Firmar' }).first().click();
    // Aviso previo con tono de alerta (quién firma y que el dispositivo queda registrado):
    // su botón también se llama «Firmar», así que se busca dentro del propio aviso.
    await f.getByRole('alertdialog').getByRole('button', { name: 'Firmar' }).click();
    await f.fill('#sigNombre', 'Pedro Cargador');
    await f.fill('#sigDni', '12345678Z');
    // El email es obligatorio desde 2026-11-14: a esa dirección va la copia del firmado.
    await f.fill('#sigEmail', 'pedro.cargador@prueba.invalid');
    // Antes de firmar puede añadir fotos de otros documentos (misma ventana de subir, contra
    // el almacén de verdad): una página, y queda en los documentos del envío.
    const pagina = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
    await f.locator('#btn-cmr-doc').click();
    await f.locator('#cmr-doc-galeria').setInputFiles([{ name: 'albaran.png', mimeType: 'image/png', buffer: pagina }]);
    await expect(f.locator('#cmr-doc-cuenta')).toHaveText('1 de 10 páginas');
    await f.locator('#btn-cmr-doc-finalizar').click();
    await expect(f.locator('#cmr-doc-hecho')).toBeVisible({ timeout: 20_000 });
    await f.locator('#cmr-doc-hecho').getByRole('button', { name: 'Cerrar' }).click();
    await expect.poll(async () => {
      const { count } = await bd().from('documentos').select('*', { count: 'exact', head: true })
        .eq('envio_id', envioAceptado).eq('tipo', 'otro').like('storage_ruta', 'cmr/%/doc-%');
      return count;
    }).toBe(1);
    const lienzo = await f.locator('#sigCanvas').boundingBox();
    expect(lienzo).not.toBeNull();
    const { x, y, width: w, height: h } = lienzo!;
    await f.mouse.move(x + w * 0.2, y + h * 0.5); await f.mouse.down();
    for (let k = 1; k <= 12; k++) await f.mouse.move(x + w * (0.2 + k * 0.05), y + h * (0.5 + Math.sin(k) * 0.25));
    await f.mouse.up();
    await f.getByRole('button', { name: 'Aceptar firma' }).click();
    // Primero sale NUESTRO aviso de ubicación (el del sistema es obligatorio y solo
    // salta si se acepta): aquí se firma sin ubicación.
    await f.getByRole('button', { name: 'Firmar sin ubicación' }).click();
    await expect.poll(async () => {
      const { count } = await bd().from('firmas_cmr').select('*', { count: 'exact', head: true }).eq('envio_id', envioAceptado);
      return count;
    }).toBe(1);

    // Y quien no quiere firmar en el móvil sube el CMR en papel desde la misma hoja: se
    // añaden dos páginas, se quita una con su miniatura y se finaliza. Va contra el almacén
    // de verdad: prueba también que su norma de rutas deja subir «papel-<uuid>.<ext>».
    await f.locator('#btn-cmr-papel').click();
    const punto = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
    await f.locator('#cmr-papel-galeria').setInputFiles([
      { name: 'cmr-1.png', mimeType: 'image/png', buffer: punto },
      { name: 'cmr-2.png', mimeType: 'image/png', buffer: punto },
    ]);
    await expect(f.locator('#cmr-papel-cuenta')).toHaveText('2 de 10 páginas');
    await f.getByRole('button', { name: 'Quitar la página 2' }).click();
    await expect(f.locator('#cmr-papel-cuenta')).toHaveText('1 de 10 páginas');
    await f.locator('#btn-cmr-papel-finalizar').click();
    await expect(f.locator('#cmr-papel-hecho')).toBeVisible({ timeout: 20_000 });
    await expect.poll(async () => {
      const { count } = await bd().from('documentos').select('*', { count: 'exact', head: true })
        .eq('envio_id', envioAceptado).eq('tipo', 'cmr_firmado').like('storage_ruta', 'cmr/%/papel-%');
      return count;
    }).toBe(1);
  });

  test('6 · en vivo: el envío que crea un cliente le aparece a Dynamo sin refrescar', async ({ page, browser }) => {
    await entrar(page, 'dynamo');
    await page.goto('/panel/envios');
    // El envío nuevo del cliente nace programado: sube el contador de la pestaña «Todas».
    const pestana = page.locator('a.tab').filter({ hasText: /^Todas \(\d+\)$/ });
    const cuantas = async () => (await pestana.count()) ? Number(/\((\d+)\)/.exec((await pestana.first().textContent()) ?? '')?.[1]) : 0;
    const antes = await cuantas();
    expect(antes).toBeGreaterThanOrEqual(0);

    const cli = await (await browser.newContext({ locale: 'es-ES' })).newPage();
    await entrar(cli, 'cliente');
    await crearEnvioDeCliente(cli);

    // Sin recargar la página de Dynamo: el contador se mueve solo.
    await expect.poll(cuantas, { timeout: 20_000 }).toBe(antes + 1);
  });
});
