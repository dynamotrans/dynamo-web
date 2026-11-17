// Lo que se ha ido añadiendo a la plataforma y conviene que no se rompa sin enterarnos
// (usuario, 2026-11-17: «amplía las pruebas automáticas y, si ves fallos, me lo dices»).
// Van después de los flujos clave (orden alfabético de ficheros, un solo trabajador) y
// usan los mismos datos de prueba. Cada prueba prepara lo suyo.
import { test, expect } from '@playwright/test';
import { entrar, ultimoEnvio, bd, como, crearEnvioDeCliente } from './ayudas';

const CIF_CLIENTE = 'B12345674';

// Un envío del cliente con SU transportista (sin Dynamo), creado por su función.
async function envioPropio(): Promise<{ id: string; ref: string }> {
  const { data: cli } = await bd().from('clientes').select('id').eq('cif', CIF_CLIENTE).single();
  const sb = await como('cliente');
  const { data: o, error: eo } = await sb.from('operadores').insert({ cliente_id: cli!.id, razon_social: `Transportes Propios ${Date.now()}` }).select('id').single();
  if (eo) throw eo;
  const lunes = new Date(); lunes.setDate(lunes.getDate() + ((8 - lunes.getDay()) % 7 || 7) + 7);
  const { data, error } = await sb.rpc('crear_envio_manual', {
    p_datos: { operador_id: o!.id, metros_lineales: 5, fecha_carga_desde: lunes.toISOString().slice(0, 10), precio_acordado_operador: 300 },
    p_paradas: [
      { tipo: 'carga', nombre_empresa: 'Mi nave', codigo_postal: '41001', poblacion: 'Sevilla' },
      { tipo: 'descarga', nombre_empresa: 'Mi cliente', codigo_postal: '29001', poblacion: 'Málaga' },
    ],
  });
  if (error) throw error;
  const fila = (data as { id: string; referencia_gx: string }[])[0];
  return { id: fila.id, ref: fila.referencia_gx };
}

test.describe('novedades', () => {
  test('envío con transportista propio: un botón «Orden de carga (PDF)» con su ventana, el PDF sale y no hay incidencias', async ({ page }) => {
    const e = await envioPropio();
    await entrar(page, 'cliente');
    await page.goto(`/panel/envios?ver=${e.id}`);
    // Un solo botón; abre la ventana con el PDF y el envío por email.
    const boton = page.getByRole('button', { name: 'Orden de carga (PDF)' });
    await expect(boton).toHaveCount(1);
    // En un envío propio Dynamo no interviene: no se reportan incidencias.
    await expect(page.getByRole('link', { name: 'Reportar incidencia' })).toHaveCount(0);
    await boton.click();
    await expect(page.getByText(`Orden de carga #${e.ref}`)).toBeVisible();
    await expect(page.getByRole('link', { name: 'Abrir el PDF de la orden de carga' })).toBeVisible();
    await expect(page.locator('#eo-para')).toBeVisible();
    await expect(page.getByText('se guarda en su ficha')).toBeVisible();   // el transportista aún no tiene email
    // El PDF se genera (con los logos si los hubiera) y es un PDF de verdad.
    const pdf = await page.request.get(`/panel/envios/${e.id}/orden-de-carga`);
    expect(pdf.status()).toBe(200);
    expect(pdf.headers()['content-type']).toContain('application/pdf');
    expect((await pdf.body()).subarray(0, 4).toString()).toBe('%PDF');
  });

  test('la base de datos no deja abrir una incidencia en un envío con transportista propio', async () => {
    const e = await envioPropio();
    const sb = await como('cliente');
    const { data: tipo } = await bd().from('tipos_incidencia').select('id').limit(1).single();
    const { error } = await sb.from('incidencias').insert({ envio_id: e.id, tipo_id: tipo!.id, titulo: 'Prueba', detalle: 'No debería entrar' });
    expect(error).not.toBeNull();
  });

  test('pestañas de envíos: un pendiente de pago no sale en «Programados»', async ({ page }) => {
    await entrar(page, 'cliente');
    await crearEnvioDeCliente(page);
    const e = await ultimoEnvio();
    await entrar(page, 'dynamo');
    const enTabla = (ref: string) => page.locator('table.data').getByText(ref, { exact: false });
    if (e.estado_pago_previo === 'pendiente') {
      await page.goto('/panel/envios?f=programada');
      await expect(page.locator('table.data, .empty, .pt-aviso').first()).toBeVisible();
      await expect(enTabla(e.referencia_gx)).toHaveCount(0);
      await page.goto('/panel/envios?f=sin-pagar');
      await expect(enTabla(e.referencia_gx).first()).toBeVisible();
    } else {
      await page.goto('/panel/envios?f=programada');
      await expect(enTabla(e.referencia_gx).first()).toBeVisible();
    }
  });

  test('Nuevo envío: la línea de medidas dice alto y ancho, y el rígido va a 2,40 m', async ({ page }) => {
    await entrar(page, 'cliente');
    await page.goto('/panel/nuevo-envio');
    const sitio = page.locator('.ptar-route-row input[type=text]');
    await sitio.nth(0).fill('Sevilla'); await page.locator('.ptar-sug li').first().click();
    await sitio.nth(1).fill('Madrid'); await page.locator('.ptar-sug li').first().click();
    await page.getByRole('button', { name: /Siguiente/ }).click();
    const linea = page.getByRole('button', { name: /Altura máxima: 2,70 m \/ Ancho máximo: 2,40 m/ });
    await expect(linea).toBeVisible();
    await linea.click();
    await expect(page.getByText('Medidas y peso máximo')).toBeVisible();
    await page.getByRole('tab', { name: /Rígido/ }).click();
    const filaAltura = page.locator('tr', { hasText: 'Altura máxima de la mercancía' });
    await expect(filaAltura).toContainText('2,40 m');
  });

  test('código de 6 cifras: al escribir la última cifra se comprueba solo, sin pulsar el botón', async ({ page }) => {
    await page.context().clearCookies();
    await page.goto('/panel/olvido/codigo?email=nadie-e2e%40prueba.invalid');
    const cajas = page.locator('.otp-box');
    await expect(cajas).toHaveCount(6);
    await cajas.first().click();
    await page.keyboard.type('000000', { delay: 40 });
    // Sin tocar «Verificar y continuar»: sale la respuesta del servidor y las cajitas se vacían.
    await expect(page.locator('.pt-aviso.error')).toBeVisible();
    await expect(cajas.first()).toHaveValue('');
  });

  test('código de aceptación: la casilla «Aceptar carga» lleva a la carga y no sirve con un código inventado', async ({ page, browser }) => {
    // Un envío de Dynamo libre y con precio para el transportista (como en el flujo 4).
    await entrar(page, 'cliente');
    await crearEnvioDeCliente(page);
    const e = await ultimoEnvio();
    await entrar(page, 'dynamo');
    await page.goto(`/panel/envios?ver=${e.id}`);
    if (e.estado_pago_previo === 'pendiente') {
      await page.getByRole('button', { name: 'Ha llegado la transferencia' }).click();
      await expect.poll(async () => (await ultimoEnvio()).estado_pago_previo).toBe('pagado');
    }
    const { data: fila } = await bd().from('envios').select('codigo_aceptacion, token_publico, referencia_gx').eq('id', e.id).single();
    expect(fila!.codigo_aceptacion).toMatch(/^[1-9]\d{5}$/);
    const cod = fila!.codigo_aceptacion as string;
    // Dynamo lo ve en la ficha, para ponerlo en la bolsa.
    await expect(page.locator('#codigo-aceptacion')).toHaveText(`${cod.slice(0, 3)} ${cod.slice(3)}`);
    await page.getByRole('button', { name: 'Ofrecer envío' }).click();
    await expect(page.locator('#of-enlace').or(page.getByRole('button', { name: 'Crear oferta y enlace' })).first()).toBeVisible();
    if (await page.getByRole('button', { name: 'Crear oferta y enlace' }).isVisible()) {
      await page.getByRole('button', { name: 'Crear oferta y enlace' }).click();
      await expect(page.locator('#of-enlace')).toBeVisible();
    }

    // El transportista, sin cuenta: ve la carga en la bolsa y teclea su código en la web.
    const t = await (await browser.newContext({ locale: 'es-ES' })).newPage();
    // En la bolsa no caben direcciones web: entra por la portada y pulsa el botón naranja.
    await t.goto('/');
    await t.locator('#btn-aceptar-carga').click();
    await expect(t).toHaveURL(/\/carga$/);
    // Seis cajitas, como las del código de recuperar la contraseña: al completarlas se
    // comprueba solo, sin pulsar el botón; si el código no vale, se vacían.
    await expect(t.locator('.otp-box')).toHaveCount(6);
    const teclear = (texto: string) => Promise.all([
      t.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/carga'),
      t.fill('#codigo-carga', texto),
    ]);
    await teclear(cod === '999998' ? '999997' : '999998');
    await expect(t.getByText(/ya no está disponible, o el código no es correcto/)).toBeVisible();
    await expect(t.locator('.otp-box.filled')).toHaveCount(0);
    // No caben más de 6 cifras ni letras: de «12ab345678» se quedan «123456».
    const [envio] = await Promise.all([
      t.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/carga'),
      t.locator('.otp-box').nth(0).pressSequentially('12ab345678'),
    ]);
    expect(envio.request().postData() ?? '').toContain('123456');
    expect(envio.request().postData() ?? '').not.toContain('1234567');
    await expect(t.getByText(/ya no está disponible, o el código no es correcto/)).toBeVisible();
    await expect(t.locator('.otp-box.filled')).toHaveCount(0);
    // Con el código bueno (pegado con un espacio en medio), a la pantalla de aceptar esa carga.
    await t.fill('#codigo-carga', `${cod.slice(0, 3)} ${cod.slice(3)}`);
    await t.waitForURL(new RegExp(`/carga/${fila!.token_publico}`));
    await expect(t.getByRole('button', { name: 'Reservar y aceptar este envío' })).toBeVisible();
    await t.context().close();
  });

  test('ningún sitio queda marcado «sin medios de carga» sin que nadie lo ponga', async () => {
    const { count, error } = await bd().from('sitios').select('id', { count: 'exact', head: true }).eq('tiene_medios_carga', false);
    expect(error).toBeNull();
    expect(count).toBe(0);
  });
});
