// Lo que se ha ido añadiendo a la plataforma y conviene que no se rompa sin enterarnos
// (usuario, 2026-11-17: «amplía las pruebas automáticas y, si ves fallos, me lo dices»).
// Van después de los flujos clave (orden alfabético de ficheros, un solo trabajador) y
// usan los mismos datos de prueba. Cada prueba prepara lo suyo.
import { expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { tarifaDeEnvio, type DatosPrecioEnvio } from '../../lib/tarifador';
import { primerDia, sumarHabiles } from '../../lib/fechasCarga';
import { hoyMadrid } from '../../lib/formato';
import { PACKS_GRUPAJE } from '../../lib/modulos';
import { test, entrar, ultimoEnvio, bd, como, crearEnvioDeCliente, envioListo, envioProgramadoDelTransportista, CIF_TRANSPORTISTA, EMAIL, CLAVE, codigoDelMovil } from './ayudas';

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

  // Plazo para pagar (usuario, 2026-11-19): temporizador a la vista en la ficha, en la lista y en
  // la proforma; el cliente avisa de su transferencia y el plazo se para; Dynamo, si no le
  // consta el cobro, pulsa «Pago no recibido» y el envío queda anulado.
  test('pendiente de pago: temporizador, «Ya he hecho la transferencia» para el plazo y Dynamo rechaza el pago', async ({ page }) => {
    await entrar(page, 'cliente');
    await crearEnvioDeCliente(page);
    const e = await ultimoEnvio();
    const sv = bd();
    if (e.estado_pago_previo !== 'pendiente') {
      const { error } = await sv.from('envios').update({ estado_pago_previo: 'pendiente', pago_motivo: 'Pedido por Dynamo', pago_pendiente_en: new Date().toISOString() }).eq('id', e.id);
      expect(error).toBeNull();
    }
    // El cliente: en su ficha, la banda con lo que le queda y hasta cuándo; en Administración, su proforma.
    await page.goto(`/panel/envios?ver=${e.id}`);
    await expect(page.locator('#pago-plazo .cuenta-atras-grande')).toContainText(/Te quedan .*\d.* para pagar/);
    await expect(page.locator('#pago-plazo')).toContainText('Paga antes del');
    // La caja del pago va la primera de la ficha, por delante del resumen del envío (usuario, 2026-11-23).
    expect(await page.evaluate(() => {
      const pago = document.querySelector('#pago-plazo'), resumen = document.querySelector('.pen-envio-sum');
      return !!pago && !!resumen && !!(pago.compareDocumentPosition(resumen) & Node.DOCUMENT_POSITION_FOLLOWING);
    })).toBe(true);
    // Lo que pasa si no se paga ya no ocupa la caja: sale en su globo de ayuda (usuario, 2026-11-24).
    const globoPlazo = page.locator('#tip-pago-plazo [role=tooltip]');
    await expect(globoPlazo).toBeHidden();
    await page.locator('#tip-pago-plazo .tip-i-btn').click();
    await expect(globoPlazo).toContainText('tendrás que crear un envío nuevo');
    // El «¿Cómo pagar?» ya no está en la ventana (usuario, 2026-11-25): el botón de la proforma dice para qué es.
    await expect(page.locator('#pago-como')).toHaveCount(0);
    await expect(page.locator('#pago-proforma')).toHaveText('Por transferencia inmediata (Ver proforma)');
    // Los botones van DESPUÉS de la caja de pago y en una sola fila: «CMR digital» a la izquierda
    // y «Acciones» a la derecha, que despliega el resto (usuario, 2026-11-25).
    expect(await page.evaluate(() => {
      const pago = document.querySelector('#pago-proforma'), barra = document.querySelector('#ficha-acciones'), resumen = document.querySelector('.pen-envio-sum');
      const F = Node.DOCUMENT_POSITION_FOLLOWING;
      return !!pago && !!barra && !!resumen && !!(pago.compareDocumentPosition(barra) & F) && !!(barra.compareDocumentPosition(resumen) & F);
    })).toBe(true);
    const cmr = await page.locator('#ficha-cmr').boundingBox(), acc = await page.locator('#ficha-acciones-btn').boundingBox();
    expect(cmr && acc && Math.abs(cmr.y - acc.y) < 4 && cmr.x < acc.x && Math.abs(cmr.width - acc.width) < 4).toBe(true);
    await expect(page.locator('#ficha-acciones').getByRole('button')).toHaveCount(2);
    await page.locator('#ficha-acciones-btn').click();
    const menu = page.locator('.ficha-mas-menu');
    await expect(menu).toContainText('Acciones del envío');
    await expect(menu.locator('.fm-item')).toHaveText([/Mapa/, /Modificar envío/, /Cancelar envío/, /Reportar incidencia/, /Repetir envío/]);
    // El mapa se abre desde ahí y el desplegable se cierra.
    await menu.locator('.fm-item', { hasText: 'Mapa' }).click();
    await expect(menu).toHaveCount(0);
    await expect(page.getByRole('heading', { name: `Mapa del envío #${e.referencia_gx}` })).toBeVisible();
    await page.keyboard.press('Escape');
    // Administración abre en Albaranes (usuario, 2026-11-25); las proformas, en su pestaña.
    await page.goto('/panel/administracion');
    await expect(page.locator('#sec-facturas .tabs .tab.active')).toContainText('Albaranes');
    await page.goto('/panel/administracion?tab=proformas');
    await expect(page.locator('#sec-facturas .tabs .tab.active')).toContainText('Proformas');
    const proforma = page.locator('#sec-facturas table.data tbody tr', { hasText: e.referencia_gx });
    await expect(proforma.locator('.pago-plazo .cuenta-atras')).toBeVisible();
    // Avisa de su transferencia (con una pregunta antes): el temporizador desaparece y queda «validando».
    await page.goto(`/panel/envios?ver=${e.id}`);
    await page.locator('#pago-avisar').click();
    // Antes de decir que sí: la pregunta habla de transferencia inmediata y pide el concepto (usuario, 2026-11-25).
    await expect(page.locator('#pago-avisar-confirmar')).toContainText(/¿Ya has hecho la transferencia inmediata de .*€\?.*con el concepto PRO-GX.*si no nos consta, el envío se anula/s);
    await expect(page.locator('#pago-avisar-fechas')).toHaveCount(0);
    await page.getByRole('button', { name: /Sí, ya la he hecho/ }).click();
    await expect(page.locator('#pago-avisado')).toContainText('La estamos validando');
    await expect(page.locator('#pago-plazo')).toHaveCount(0);
    await expect(page.locator('#pago-avisar')).toHaveCount(0);
    await expect.poll(async () => (await sv.from('envios').select('pago_avisado_en').eq('id', e.id).single()).data?.pago_avisado_en ?? null).not.toBeNull();
    await page.goto('/panel/administracion?tab=proformas');
    await expect(proforma).toContainText('Validando tu transferencia');
    // Dynamo: lo ve en la lista y en la ficha, con el plazo parado.
    await entrar(page, 'dynamo');
    await page.goto('/panel/envios?f=sin-pagar');
    await expect(page.locator('table.data tbody tr', { hasText: e.referencia_gx })).toContainText('Transferencia avisada · validar');
    // En el Dashboard, la caja «Aviso de pago» (usuario, 2026-11-25): en grande, los que han
    // avisado; debajo, cuántos esperan el pago en total. Las dos cifras a la vista.
    await page.goto('/panel/dashboard-admin');
    const caja = page.locator('.stat-card', { hasText: 'Aviso de pago' });
    const avisados = Number(await caja.locator('.stat-card-value').innerText());
    expect(avisados).toBeGreaterThanOrEqual(1);
    await expect(caja.locator('.stat-card-trend')).toHaveText(/^Esperando el pago · \d+$/);
    expect(Number((await caja.locator('.stat-card-trend').innerText()).replace(/\D/g, ''))).toBeGreaterThanOrEqual(avisados);
    await caja.click();
    await expect(page.locator('.ph-fila', { hasText: e.referencia_gx })).toContainText('Transferencia avisada · validar');
    await page.goto(`/panel/envios?ver=${e.id}`);
    await expect(page.locator('#pago-avisado')).toContainText('El cliente avisó de su transferencia');
    await expect(page.getByRole('button', { name: 'Ha llegado la transferencia' })).toBeVisible();
    // En Proformas, «por validar»; no le consta el cobro: «Pago no recibido» anula el envío.
    await page.goto('/panel/administracion?tab=proformas');
    const fila = page.locator('#sec-facturas table.data tbody tr', { hasText: e.referencia_gx });
    await expect(fila).toContainText('Transferencia avisada · validar');
    await fila.locator('.pago-no-recibido').click();
    await page.locator('#adm-rechazo').fill('no aparece en el banco');
    await page.getByRole('button', { name: 'Sí, anular el envío' }).click();
    await expect.poll(async () => (await sv.from('envios').select('estado').eq('id', e.id).single()).data?.estado).toBe('cancelado');
    await expect(fila).toHaveCount(0);
  });

  // Aviso del tráiler en el paso 2, antes de «Siguiente» (usuario, 2026-11-24): el enlace
  // «añádela en opciones» abre el desplegable y lleva hasta «Plataforma elevadora»; al
  // activarla, el aviso desaparece. En el paso 3, con fecha fija, el aviso del corte ya no
  // lleva la coletilla de «Lo más barato y seguro…».
  test('Nuevo envío: el aviso del tráiler del paso 2 lleva a la plataforma elevadora', async ({ page }) => {
    await entrar(page, 'cliente');
    await page.goto('/panel/nuevo-envio');
    const sitio = page.locator('.ptar-route-row input[type=text]');
    await sitio.nth(0).fill('Sevilla'); await page.locator('.ptar-sug li').first().click();
    await sitio.nth(1).fill('Madrid'); await page.locator('.ptar-sug li').first().click();
    await page.getByRole('button', { name: /Siguiente/ }).click();
    const aviso = page.locator('#aviso-trailer-paso2');
    await expect(aviso).toContainText('Envío en tráiler');
    await expect(page.locator('#ne-plataforma')).toHaveCount(0);   // las opciones nacen plegadas
    await aviso.getByRole('button', { name: 'añádela en opciones' }).click();
    const plataforma = page.locator('#ne-plataforma');
    await expect(plataforma).toBeInViewport();
    await plataforma.locator('.ptar-tramp-box').click();
    await expect(aviso).toHaveCount(0);
    await plataforma.locator('.ptar-tramp-box').click();
    await expect(aviso).toBeVisible();
    // Paso 3 con fecha fija: solo hasta cuándo pedir y el primer día de carga. (La plataforma
    // recortó la mercancía a 8 m; se vuelve al tráiler completo, que es el que admite fecha fija.)
    await page.selectOption('#ne-ml', '13.3');
    await page.getByRole('button', { name: /Siguiente/ }).click();
    await page.getByRole('button', { name: 'Días de recogida' }).click();
    await page.getByRole('option', { name: /Fecha fija/ }).click();
    const corte = page.locator('.ptar-cutoff-note');
    await expect(corte).toContainText('El primer día de carga posible es');
    await expect(corte).not.toContainText('Lo más barato y seguro');
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
      // Marcarla pide banco, concepto y fecha (el concepto y la fecha ya vienen puestos).
      await page.selectOption('#tr-banco', 'CaixaBank');
      await page.locator('#tr-confirmar').click();
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
    // (En pantallas estrechas el botón del menú se cambia por una franja naranja bajo la cabecera.)
    await t.locator('#btn-aceptar-carga:visible, #franja-aceptar-carga:visible').first().click();
    await expect(t).toHaveURL(/\/carga$/);
    // Seis cajitas, como las del código de recuperar la contraseña: al completarlas se
    // comprueba solo, sin pulsar el botón; si el código no vale, se vacían.
    await expect(t.locator('.otp-box')).toHaveCount(6);
    // La página ya está viva cuando la primera cajita coge el foco (lo hace ella sola al
    // arrancar): teclear antes se perdía y la prueba fallaba de vez en cuando.
    await expect(t.locator('#codigo-carga')).toBeFocused({ timeout: 20_000 });
    const teclear = (texto: string) => Promise.all([
      t.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/carga'),
      t.fill('#codigo-carga', texto),
    ]);
    // Con un código que no es de ninguna carga: pasa a la pantalla de comprobación y ahí le
    // dice la razón («El código no es correcto»); «Volver a escribirlo» devuelve a las cajitas.
    const codigoIncorrecto = async () => {
      await expect(t.locator('#carga-resultado')).toContainText('El código no es correcto');
      await expect(t.locator('#codigo-carga')).toBeHidden();
      await t.getByRole('button', { name: 'Volver a escribirlo' }).click();
      await expect(t.locator('#carga-resultado')).toHaveCount(0);
      await expect(t.locator('#codigo-carga')).toBeFocused();
      await expect(t.locator('.otp-box.filled')).toHaveCount(0);
    };
    await teclear(cod === '999998' ? '999997' : '999998');
    await codigoIncorrecto();
    // No caben más de 6 cifras ni letras: de «12ab345678» se quedan «123456».
    const [envio] = await Promise.all([
      t.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/carga'),
      t.locator('.otp-box').nth(0).pressSequentially('12ab345678'),
    ]);
    expect(envio.request().postData() ?? '').toContain('123456');
    expect(envio.request().postData() ?? '').not.toContain('1234567');
    await codigoIncorrecto();
    // Un código que SÍ fue de una carga pero ya no vale (aquí, uno retirado): la razón es otra,
    // «ya no está disponible», y no le pide que lo escriba mejor.
    const retirado = cod === '777123' ? '777124' : '777123';
    expect((await bd().from('codigos_carga_retirados').upsert({ codigo: retirado })).error).toBeNull();
    await teclear(retirado);
    await expect(t.locator('#carga-resultado')).toContainText('Esta carga ya no está disponible');
    await expect(t.locator('#carga-resultado')).not.toContainText('El código no es correcto');
    await t.getByRole('button', { name: 'Probar con otro código' }).click();
    await expect(t.locator('#codigo-carga')).toBeFocused();
    // Con el código bueno (pegado con un espacio en medio), a la pantalla de aceptar esa carga.
    await t.fill('#codigo-carga', `${cod.slice(0, 3)} ${cod.slice(3)}`);
    await t.waitForURL(new RegExp(`/carga/${fila!.token_publico}`));
    await expect(t.getByRole('button', { name: 'Reservar y aceptar este envío' })).toBeVisible();
    await t.context().close();
  });

  test('asignar transportista: una sugerencia de cualquier campo rellena los cuatro, y después se cambian a mano', async ({ page }) => {
    // Un viaje anterior de ese transportista con su camión completo (apuntado directo en la
    // base de datos: aquí se prueba la pantalla de asignar, no cómo llegó ese viaje).
    const { data: tr } = await bd().from('transportistas').select('id').eq('cif', CIF_TRANSPORTISTA).single();
    const anterior = await envioListo(page);
    const { error } = await bd().from('envios').update({
      transportista_id: tr!.id, importe_transportista: 500, matricula_camion: '7777JKL', matricula_remolque: 'R7777JKL',
      conductor_nombre: 'Marta Rueda', conductor_telefono: '+34611222333',
    }).eq('id', anterior);
    expect(error).toBeNull();

    const id = await envioListo(page);
    await entrar(page, 'dynamo');
    await page.goto(`/panel/envios?ver=${id}`);
    await page.getByRole('button', { name: /Asignar transportista/ }).click();
    await page.fill('#as-tra', 'Transportes Prueba');
    await page.locator('.buscador-lista button', { hasText: 'Transportes Prueba' }).first().click();
    await expect(page.locator('.buscador-elegido')).toContainText('Transportes Prueba');

    // Se busca por el REMOLQUE: la sugerencia trae la tractora, el conductor y su móvil.
    await page.locator('#as-remolque').click();
    await page.locator('#as-remolque').pressSequentially('R77');
    await page.locator('.buscador-lista.flotante button', { hasText: 'R7777JKL' }).first().click();
    await expect(page.locator('#as-camion')).toHaveValue('7777JKL');
    await expect(page.locator('#as-remolque')).toHaveValue('R7777JKL');
    await expect(page.locator('#as-conductor')).toHaveValue('Marta Rueda');
    await expect(page.locator('#as-tel')).toHaveValue(/611\s?222\s?333/);
    // Con todo ya puesto, la lista no se queda abierta ofreciendo lo mismo.
    await expect(page.locator('.buscador-lista.flotante')).toHaveCount(0);

    // Y por el MÓVIL del conductor también: se vacía todo y se teclea el número.
    for (const c of ['#as-camion', '#as-remolque', '#as-conductor', '#as-tel']) await page.fill(c, '');
    await page.locator('#as-tel').click();
    await page.locator('#as-tel').pressSequentially('611222');
    await page.locator('.buscador-lista.flotante button', { hasText: 'Marta Rueda' }).first().click();
    await expect(page.locator('#as-camion')).toHaveValue('7777JKL');
    await expect(page.locator('#as-remolque')).toHaveValue('R7777JKL');
    await expect(page.locator('#as-conductor')).toHaveValue('Marta Rueda');

    // Después del autorrelleno se cambia a mano lo que haga falta (aquí, el conductor: hoy
    // lleva el camión otro chófer) y se guarda tal cual queda.
    await page.fill('#as-conductor', 'Luis Suplente');
    await page.locator('#as-conductor').press('Tab');
    if (await page.locator('select#as-dia').count()) {
      const dia = await page.locator('select#as-dia option:not([disabled])').nth(1).getAttribute('value');
      await page.locator('select#as-dia').selectOption(dia!);
    }
    const ent = await page.locator('select#as-ent option:not([disabled])').nth(1).getAttribute('value');
    await page.locator('select#as-ent').selectOption(ent!);
    await page.fill('#as-precio', '600');
    await page.getByRole('button', { name: 'Guardar asignación' }).click();
    await expect.poll(async () => {
      const { data } = await bd().from('envios').select('matricula_camion, matricula_remolque, conductor_nombre').eq('id', id).single();
      return data;
    }).toEqual({ matricula_camion: '7777JKL', matricula_remolque: 'R7777JKL', conductor_nombre: 'Luis Suplente' });
  });

  test('cuenta suspendida: la banda roja sale sola al suspender y se quita sola al reactivar, sin recargar', async ({ page }) => {
    const { data: u } = await bd().from('usuarios').select('id').eq('rol', 'cliente').limit(1).single();
    const poner = async (estado: 'activa' | 'suspendida') => {
      const { error } = await bd().from('usuarios').update({ estado }).eq('id', u!.id);
      expect(error).toBeNull();
    };
    try {
      await poner('suspendida');
      await entrar(page, 'cliente');
      const banda = page.locator('#banda-suspension');
      await expect(banda).toBeVisible();
      // Se reactiva la cuenta (como hace Dynamo desde Usuarios) y el cliente NO toca nada:
      // la banda desaparece sola, y sigue sin estar al pasar a otra pantalla.
      await poner('activa');
      await expect(banda).toHaveCount(0, { timeout: 30_000 });
      await page.goto('/panel/sitios');
      await expect(page.locator('.sidebar, nav').first()).toBeVisible();
      await expect(banda).toHaveCount(0);
    } finally {
      await poner('activa');   // pase lo que pase, la cuenta de pruebas queda activa para lo demás
    }
  });

  test('editar empresa: el cliente cambia sus personas de contacto y ve en gris los datos fiscales', async ({ page }) => {
    await entrar(page, 'cliente');
    await page.goto('/panel/mi-cuenta');
    await page.locator('#btn-editar-empresa').click();
    const v = page.locator('.dash-modal.open');
    await expect(v.getByText('Editar empresa')).toBeVisible();
    // Empresa y domicilio fiscal: en gris, solo lectura.
    for (const id of ['#emp-razon', '#emp-cif', '#emp-sector', '#emp-dir', '#emp-cp', '#emp-pob', '#emp-prov', '#emp-pais']) {
      await expect(v.locator(id)).toHaveAttribute('readonly', '');
    }
    await expect(v.locator('#emp-razon')).not.toHaveValue('');
    // Nada de lo que es privado de Dynamo.
    await expect(v.getByText(/crédito|CESCE|Holded|pagos tardíos|Estado/i)).toHaveCount(0);
    // Añade una persona de contacto de Contabilidad que recibe los avisos, y guarda.
    const antes = await v.locator('input[type=email]').count();
    // (Sin ningún contacto el botón se llama «Añadir contacto»; con alguno, «…adicional».)
    await v.getByRole('button', { name: /^Añadir contacto( adicional)?$/ }).click();
    const email = `contacto.e2e.${Date.now()}@empresa.prueba`;
    await v.locator(`#ct-${antes}-nombre`).fill('Contacto de la prueba');
    await v.locator(`#ct-${antes}-email`).fill(email);
    await v.locator(`#ct-${antes}-rol`).selectOption('contabilidad');
    await v.locator('#btn-guardar-empresa').click();
    await expect(page.locator('.dash-modal.open')).toHaveCount(0);
    const { data: c } = await bd().from('contactos').select('funcion, recibe_avisos, cliente_id, nombre').eq('email', email).single();
    expect(c).toMatchObject({ funcion: 'contabilidad', recibe_avisos: true, nombre: 'Contacto de la prueba' });
    expect(c!.cliente_id).toBeTruthy();
    // Al volver a abrir, ahí está; lo quita y se borra.
    await page.locator('#btn-editar-empresa').click();
    await expect(page.locator(`.dash-modal.open #ct-${antes}-email`)).toHaveValue(email);
    await page.locator('.dash-modal.open').getByRole('button', { name: 'Quitar', exact: true }).nth(antes).click();
    await page.locator('#btn-guardar-empresa').click();
    await expect(page.locator('.dash-modal.open')).toHaveCount(0);
    await expect.poll(async () => (await bd().from('contactos').select('id', { count: 'exact', head: true }).eq('email', email)).count).toBe(0);
  });

  // DOBLE PASO del equipo de Dynamo (usuario, 2026-11-18): con el interruptor encendido, tras
  // la contraseña se pide el código del móvil; la primera vez, con su QR. Y sin el código la
  // base de datos no enseña nada, aunque se tenga la contraseña.
  test('doble paso: alta con el QR, código al entrar, y sin él la base de datos no enseña nada', async ({ page }) => {
    const sv = bd();
    const { data: yo } = await sv.from('usuarios').select('id').eq('email', EMAIL.dynamo).single();
    const limpiar = async () => {
      await sv.from('parametros').update({ valor: false }).eq('clave', 'doble_paso_equipo');
      const { data } = await sv.auth.admin.mfa.listFactors({ userId: yo!.id });
      for (const f of data?.factors ?? []) await sv.auth.admin.mfa.deleteFactor({ id: f.id, userId: yo!.id });
    };
    await limpiar();
    const entrarSinEsperarPanel = async () => {
      await page.context().clearCookies();
      await page.goto('/panel/entrar');
      await page.fill('#portal-user', EMAIL.dynamo); await page.fill('#portal-pass', CLAVE);
      await page.click('button[type=submit]');
    };
    try {
      await sv.from('parametros').update({ valor: true }).eq('clave', 'doble_paso_equipo');
      // 1 · Solo con la contraseña, la BASE DE DATOS no le reconoce: no lee ni un cliente.
      const soloClave = await como('dynamo');
      const { data: clientes } = await soloClave.from('clientes').select('id').limit(5);
      expect(clientes ?? []).toHaveLength(0);
      // 2 · Al entrar: no llega al panel, se le pide dar de alta su móvil (QR).
      await entrarSinEsperarPanel();
      await page.waitForURL(/\/panel\/doble-paso/);
      await expect(page.getByRole('heading', { name: 'Activa el doble paso' })).toBeVisible();
      await expect(page.locator('#doble-paso-qr')).toBeVisible();
      // Ir a otra pantalla del panel sin hacerlo devuelve aquí.
      await page.goto('/panel/usuarios');
      await page.waitForURL(/\/panel\/doble-paso/);
      // Desde el mismo móvil no se puede escanear: la clave se copia de un toque (y hay un
      // enlace que abre la aplicación de códigos con todo puesto).
      await expect(page.locator('#doble-paso-copiar')).toBeVisible();
      await expect(page.locator('#doble-paso-enlace')).toHaveAttribute('href', /^otpauth:\/\/totp\//);
      await page.getByRole('button', { name: 'Ver la clave' }).click();
      const clave = (await page.locator('#doble-paso-clave').innerText()).trim();
      // Un código cualquiera no vale.
      await page.locator('#doble-paso-codigo').fill(codigoDelMovil(clave) === '000000' ? '111111' : '000000');
      await expect(page.getByText('Ese código no vale')).toBeVisible();
      // Con el de su móvil, entra.
      const usado = codigoDelMovil(clave);
      await page.locator('#doble-paso-codigo').fill(usado);
      await page.waitForURL(/\/panel\/dashboard-admin/);
      await expect(page.locator('.sidebar, nav').first()).toBeVisible();
      await page.goto('/panel/usuarios');
      await expect(page.getByText(EMAIL.cliente).first()).toBeVisible();
      // 3 · Mi cuenta lo enseña activo y obligatorio.
      await page.goto('/panel/mi-cuenta');
      await expect(page.locator('#mi-doble-paso')).toContainText('Activo');
      await expect(page.locator('#mi-doble-paso')).toContainText('obligatorio');
      await expect(page.locator('#mdp-quitar')).toHaveCount(0);   // obligatorio: se puede cambiar de móvil, no quitarlo
      // 4 · Otra entrada: ya no hay QR, solo el código; y sin él no se pasa.
      await entrarSinEsperarPanel();
      await page.waitForURL(/\/panel\/doble-paso/);
      await expect(page.getByRole('heading', { name: 'Código de tu móvil' })).toBeVisible();
      await expect(page.locator('#doble-paso-qr')).toHaveCount(0);
      await page.goto('/panel/envios');
      await page.waitForURL(/\/panel\/doble-paso/);
      // 5 · A un cliente no se le pide nada.
      await entrar(page, 'cliente');
      await expect(page).not.toHaveURL(/doble-paso/);
      // 6 · Con el interruptor APAGADO, quien ya activó el suyo lo sigue pasando (usuario,
      //     2026-11-19: «no estaba activado y me salió»): no es obligatorio, pero es suyo. Desde
      //     «Mi cuenta» lo puede quitar, con su contraseña, y vuelve a entrar solo con ella.
      await sv.from('parametros').update({ valor: false }).eq('clave', 'doble_paso_equipo');
      await entrarSinEsperarPanel();
      await page.waitForURL(/\/panel\/doble-paso/);
      await expect(page.getByRole('heading', { name: 'Código de tu móvil' })).toBeVisible();
      await expect.poll(() => codigoDelMovil(clave), { timeout: 45_000 }).not.toBe(usado);   // un código no vale dos veces
      await page.locator('#doble-paso-codigo').fill(codigoDelMovil(clave));
      await page.waitForURL(/\/panel\/dashboard-admin/);
      await page.goto('/panel/mi-cuenta');
      await expect(page.locator('#mi-doble-paso')).toContainText('se te pide siempre');
      await page.locator('#mdp-quitar').click();
      await page.locator('#mdp-clave').fill(CLAVE);
      await page.getByRole('button', { name: 'Quitar el doble paso', exact: true }).last().click();
      await page.waitForURL(/\/panel\/mi-cuenta/);
      await expect(page.locator('#mi-doble-paso')).toContainText('Sin activar');
      await entrar(page, 'dynamo');
      await expect(page).not.toHaveURL(/doble-paso/);
    } finally {
      await limpiar();
    }
    // Apagado y sin móvil dado de alta, Dynamo entra como siempre.
    await entrar(page, 'dynamo');
    await expect(page).not.toHaveURL(/doble-paso/);
  });

  // Con la sesión abierta NO basta para lo delicado (usuario, 2026-11-18): cambiar el email
  // de una cuenta pide la contraseña de quien lo hace.
  test('cambiar el email de una cuenta pide la contraseña de quien lo hace', async ({ page }) => {
    await entrar(page, 'dynamo');
    await page.goto('/panel/usuarios');
    await page.getByText(EMAIL.cliente).first().click();
    await page.getByRole('button', { name: 'Cambiar email…' }).click();
    const cambiar = page.getByRole('button', { name: 'Cambiar email', exact: true });
    await page.locator('#email-nuevo').fill('otro-correo@e2e.test');
    await page.locator('#email-conf').fill(EMAIL.cliente);
    await expect(cambiar).toBeDisabled();                      // sin contraseña, ni se puede pulsar
    await page.locator('#email-clave').fill('no-es-mi-clave');
    await cambiar.click();
    await expect(page.getByText('Tu contraseña no es correcta')).toBeVisible();
    const { data: sigue } = await bd().from('usuarios').select('email').eq('email', EMAIL.cliente).maybeSingle();
    expect(sigue?.email).toBe(EMAIL.cliente);                  // no se ha cambiado nada
  });

  // Los botones que navegan RESPONDEN AL PULSARLOS (usuario, 2026-11-18: «cuando pulso
  // botones tarda»): sale el cargador al instante, sin esperar a que llegue la pantalla
  // nueva, y la ficha del envío recién creado ya se ha pedido por detrás.
  test('envío creado: la ficha se pide por detrás y los botones responden al instante', async ({ page }) => {
    await entrar(page, 'cliente');
    const pedidas: string[] = [];
    page.on('request', (r) => { if (r.headers()['rsc'] && r.url().includes('/panel/envios')) pedidas.push(r.url()); });
    await crearEnvioDeCliente(page);
    const id = (await ultimoEnvio()).id;
    // Sin tocar nada, la ficha y la lista ya se han pedido.
    await expect.poll(() => pedidas.some((u) => u.includes(`ver=${id}`))).toBe(true);
    // Aunque la pantalla nueva tarde, el cargador sale nada más pulsar.
    await page.route('**/panel/envios**', async (ruta) => { await new Promise((r) => setTimeout(r, 1200)); await ruta.continue(); });
    await page.evaluate(() => (window as unknown as { next?: { router?: { refresh(): void } } }).next?.router?.refresh?.());   // tira lo adelantado: el peor caso
    await page.getByRole('button', { name: 'Ir a la lista de envíos' }).click();
    await expect(page.locator('.dyn-cargando')).toBeVisible({ timeout: 600 });
    await page.unroute('**/panel/envios**');
    await page.waitForURL(/\/panel\/envios(\?|$)/);
    await expect(page.locator('.dyn-cargando')).toHaveCount(0);
  });

  // 30 s para arrepentirse (usuario, 2026-11-20): todos los emails esperan; la ficha y la lista
  // enseñan el contador y, al pulsarlo, «¿Deseas anular el cambio realizado?» deja el envío
  // como estaba (uno recién creado, anulado sin coste) y sus emails no salen.
  test('contador de 30 s: anular el envío recién creado lo deja cancelado y sin emails', async ({ page }) => {
    await entrar(page, 'cliente');
    await crearEnvioDeCliente(page);
    const { id, referencia_gx } = await ultimoEnvio();
    // En «Todas»: según la cuenta, el envío nace en «Pendientes de pago» o en «Programados».
    await page.goto('/panel/envios?f=todas');
    await expect(page.locator('tr', { hasText: `#${referencia_gx}` }).locator('.cc-chip')).toBeVisible();
    await page.goto(`/panel/envios?ver=${id}`);
    await page.locator('.cc-barra').click();
    await expect(page.getByRole('heading', { name: '¿Deseas anular el cambio realizado?' })).toBeVisible();
    await page.getByRole('button', { name: 'Sí, anular', exact: true }).click();
    await expect(page.getByText(/Envío anulado sin coste/)).toBeVisible();
    // Se sigue ESTE envío por su id: «el último creado» puede ser otro que aparezca entretanto.
    await expect.poll(async () => (await bd().from('envios').select('estado').eq('id', id).single()).data?.estado).toBe('cancelado');
    const { data: mails } = await bd().from('emails_enviados').select('estado').eq('envio_id', id);
    expect((mails ?? []).filter((m) => m.estado !== 'omitido')).toEqual([]);
  });

  // EL PRECIO NO SE FÍA DEL NAVEGADOR (repaso de seguridad, 2026-11-23). La base de datos
  // recalcula el precio del cliente con la misma fórmula que la pantalla y rechaza el envío
  // si no coincide: (1) las dos fórmulas dan lo mismo en muchas combinaciones; (2) un envío
  // a 1 € llamando a la base de datos directamente, sin la pantalla, no se crea.
  test('precio del cliente: la base de datos y la pantalla calculan igual y un precio trucado no entra', async () => {
    const sb = bd();
    const ahora = new Date();
    const { data: fes } = await sb.rpc('festivos_entre', { p_desde: hoyMadrid(), p_hasta: hoyMadrid(400) });
    const festivos = ((fes ?? []) as { fecha: string }[]).map((f) => f.fecha);
    const fest = new Set(festivos);
    const { data: reg } = await sb.rpc('reglas_precio_envio');
    const r = (reg ?? {}) as Record<string, number>;
    const cortes = { fija: r.corte_fija_hora, v12: r.corte_ventana_1_2_hora, v13: r.corte_ventana_1_3_hora, v14: r.corte_ventana_1_4_hora };
    const tipos = [['almacen_nave', 'almacen_nave'], ['obra_zona_amplia', 'finca'], ['obra_zona_urbana', 'almacen_nave', 'finca'], ['finca', 'obra_zona_urbana', 'obra_zona_amplia', 'almacen_nave']];
    const casos: { d: DatosPrecioEnvio; tipos: string[]; factor: number }[] = [];
    let k = 0;
    for (const [ml, peso, plat] of [[13.3, 24, false], [13.3, 3, false], [13.3, 18, false], [6, 9, false], [8, 14, true], [3, 1, true]] as [number, number, boolean][]) {
      for (const dias of [1, 2, 4, 3]) {
        const mlMax = plat ? 8 : 13;
        const grupaje = ml < mlMax - 0.01;
        const urg = dias === 1 ? 'dia' : dias === 2 ? 'corta' : 'estandar';
        for (const empieza of [0, 1, 40, 230]) {
          const desde = empieza === 0 ? primerDia(urg, grupaje, fest, cortes, ahora) : sumarHabiles(primerDia(urg, grupaje, fest, cortes, ahora), empieza, fest);
          const hasta = dias > 1 ? sumarHabiles(desde, dias - 1, fest) : desde;
          k++;
          casos.push({ tipos: tipos[k % tipos.length], factor: [0, -7, 12.5, -3, 5][k % 5], d: {
            metros_lineales: ml, toneladas: peso, requiere_plataforma_elevadora: plat,
            paletizado: k % 3 !== 0, carga_techo: k % 4 === 0, requiere_nima: k % 5 === 0, adr: k % 7 === 0,
            fecha_carga_desde: desde, fecha_carga_hasta: hasta } });
        }
      }
    }
    for (const c of casos) {
      const t = tarifaDeEnvio(c.d, { km: 500, tiposSitio: c.tipos, festivos, cortes, factor: c.factor, ahora });
      const { data, error } = await sb.rpc('precio_tarifa_cliente', { p_datos: c.d, p_tipos: c.tipos, p_factor: c.factor, p_instante: ahora.toISOString() });
      expect(error).toBeNull();
      expect({ caso: c, neto: Number((data as { neto: number }).neto), base: Number((data as { base: number }).base) })
        .toEqual({ caso: c, neto: t.neto, base: t.netoBase ?? t.neto });
    }

    // (2) El cliente llama a la base de datos con su sesión y un precio de 1 €: no se crea.
    const cli = await como('cliente');
    const { data: sit } = await cli.from('sitios').select('id').eq('borrado', false).eq('es_almacen_dynamo', false).limit(2);
    expect((sit ?? []).length).toBe(2);
    const desde = primerDia('estandar', false, fest, cortes);
    const datos = { fecha_carga_desde: desde, fecha_carga_hasta: sumarHabiles(desde, 2, fest), metros_lineales: 13.3, toneladas: 24,
      paletizado: true, carga_lateral: true, carga_trasera: false, carga_techo: false, requiere_plataforma_elevadora: false,
      requiere_nima: false, adr: false, discrecion_comercial: false, importe_cliente: 1, importe_tarifa: 1 };
    const paradas = [{ tipo: 'carga', sitio_id: sit![0].id }, { tipo: 'descarga', sitio_id: sit![1].id }];
    const trucado = await cli.rpc('crear_envio_cliente', { p_datos: datos, p_paradas: paradas });
    expect(trucado.error?.message).toMatch(/El precio de este envío ha cambiado/);
    const { count } = await sb.from('envios').select('id', { count: 'exact', head: true }).eq('importe_cliente', 1);
    expect(count).toBe(0);
  });

  // PACKS DE GRUPAJE (usuario, 2026-11-23): en la ficha de Dynamo, un recuadro con las
  // partidas que se pueden juntar (misma ruta de provincias, un día en común); se crea el
  // pack y lo que ya no cabe en el tráiler no se deja marcar. La lista enseña el pack.
  // Email «Envío creado» de un envío pendiente de pago (usuario, 2026-11-23): dice cómo pagar,
  // lleva el botón «Pagar el envío» y la proforma ADJUNTA en PDF; y la pantalla de «¡Envío
  // creado!» trae los botones de pago dentro de su caja.
  test('envío pendiente de pago: caja con botones al crearlo y email con cómo pagar y la proforma adjunta', async ({ page }) => {
    const sv = bd();
    const { data: u } = await sv.from('usuarios').select('cliente_id').eq('email', EMAIL.cliente).single();
    const { data: c } = await sv.from('clientes').select('riesgo_manual_euros, exento_pago_previo_primer_envio').eq('id', u!.cliente_id).single();
    try {
      await entrar(page, 'cliente');
      // Con crédito de sobra (y sin la regla del primer envío) la ventana de confirmar NO habla
      // del pago: el aviso solo sale cuando el envío va a nacer pendiente de pago.
      await sv.from('clientes').update({ riesgo_manual_euros: 100000, exento_pago_previo_primer_envio: true }).eq('id', u!.cliente_id);
      await crearEnvioDeCliente(page, async () => { await expect(page.locator('#conf-pago')).toHaveCount(0); });
      await expect(page.locator('.exito-pago')).toHaveCount(0);
      // Con 1 € de crédito cualquier envío se queda pendiente de pago (no le cabe): se avisa ANTES
      // de crearlo, en naranja, con el plazo y la pregunta de si lo va a pagar (usuario, 2026-11-24).
      await sv.from('clientes').update({ riesgo_manual_euros: 1 }).eq('id', u!.cliente_id);
      await crearEnvioDeCliente(page, async () => {
        const aviso = page.locator('#conf-pago');
        await expect(aviso).toContainText('Este envío se paga por adelantado');
        // Solo la pregunta, con el plazo dentro (usuario, 2026-11-24).
        await expect(aviso).toContainText(/dentro del\s+plazo de .*\d/);
        await expect(aviso.locator('#conf-pago-plazo')).toContainText(/\d/);
        // El motivo en corto en el título; lo de «se anulan solos», en su globo de ayuda (usuario, 2026-11-24).
        await expect(aviso).toContainText('En este momento no dispones de crédito comercial.');
        const globoPago = page.locator('#tip-conf-pago [role=tooltip]');
        await expect(globoPago).toBeHidden();
        await page.locator('#tip-conf-pago .tip-i-btn').click();
        await expect(globoPago).toContainText('el envío y su proforma se anulan solos');
        // La frase del uso abusivo ya no ocupa la caja verde: sale en su globo de ayuda al pulsar la ⓘ.
        const globo = page.locator('#tip-uso-abusivo [role=tooltip]');
        await expect(globo).toBeHidden();
        await page.locator('#tip-uso-abusivo .tip-i-btn').click();
        await expect(globo).toBeVisible();
        await expect(globo).toContainText('uso abusivo');
        await expect(aviso).toContainText('¿Vas a pagarlo ahora?');
        await expect(aviso).toContainText('crea el envío más tarde');
        await expect(aviso).not.toContainText('€');   // sin cifras de crédito
      });
      const caja = page.locator('.exito-pago');
      await expect(caja).toContainText('Pendiente de pago');
      await expect(caja.getByRole('button', { name: 'Pagar por transferencia' })).toBeVisible();
      await expect(caja.locator('.cuenta-atras-grande')).toContainText(/Te quedan .*\d.* para pagar/);
      const e = await ultimoEnvio();
      const { data: em, error } = await sv.from('emails_enviados').select('cuerpo_html, opciones').eq('clave', `envio_creado:${e.id}`).single();
      expect(error).toBeNull();
      expect(em!.cuerpo_html).toContain('Cómo pagar');
      expect(em!.cuerpo_html).toContain('>Pagar el envío</a>');
      expect(em!.cuerpo_html).toContain('adjunta en PDF');
      expect(em!.cuerpo_html).toContain('ha llegado a nuestra cuenta');
      expect(em!.cuerpo_html).not.toContain('<!--pago-proforma-->');
      const adj = ((em!.opciones ?? {}) as { adjuntos?: { Name: string; ContentType: string; Content: string }[] }).adjuntos ?? [];
      expect(adj).toHaveLength(1);
      expect(adj[0].Name).toMatch(/^Proforma-.+\.pdf$/);
      expect(adj[0].ContentType).toBe('application/pdf');
      expect(Buffer.from(adj[0].Content, 'base64').subarray(0, 5).toString()).toBe('%PDF-');
    } finally {
      await sv.from('clientes').update({ riesgo_manual_euros: c!.riesgo_manual_euros, exento_pago_previo_primer_envio: c!.exento_pago_previo_primer_envio }).eq('id', u!.cliente_id);
    }
  });

  // CANCELADO POR NO PAGAR DENTRO DEL PLAZO (usuario, 2026-11-24): la ficha del cliente dice el
  // motivo en una caja amarilla, lo primero, antes de «Fecha de carga».
  test('envío anulado por falta de pago: la ficha del cliente dice el motivo en amarillo', async ({ page }) => {
    const sv = bd();
    await entrar(page, 'cliente');
    await crearEnvioDeCliente(page);
    const e = await ultimoEnvio();
    expect(e.estado_pago_previo).toBe('pendiente');
    // Con el plazo vencido hace horas, la tarea automática lo anula.
    await sv.from('envios').update({ pago_pendiente_en: new Date(Date.now() - 30 * 3_600_000).toISOString() }).eq('id', e.id);
    await sv.rpc('caducar_pagos_pendientes');
    expect((await sv.from('envios').select('estado').eq('id', e.id).single()).data!.estado).toBe('cancelado');
    await page.goto(`/panel/envios?ver=${e.id}`);
    const aviso = page.locator('#aviso-anulado-sin-pago');
    await expect(aviso).toContainText('Cancelado por falta de pago');
    await expect(aviso).toContainText('No recibimos el pago dentro del plazo');
    await expect(aviso).toContainText('Repetir envío');
    await expect(page.locator('.dash-modal-card .badge').first()).toHaveText('Anulado sin pago');
    // Va antes de la fecha de carga.
    const antes = await aviso.evaluate((el) => {
      const fila = [...document.querySelectorAll('.pen-sum-row')].find((r) => r.textContent?.includes('Fecha de carga'));
      return !!fila && !!(el.compareDocumentPosition(fila) & Node.DOCUMENT_POSITION_FOLLOWING);
    });
    expect(antes).toBe(true);
    // En la ficha de Dynamo, lo mismo en corto: ni «Pendiente de pago», ni plazo, ni botones de cobro
    // (usuario, 2026-11-24: «¿no debería decir cancelado y punto?»).
    await entrar(page, 'dynamo');
    await page.goto(`/panel/envios?ver=${e.id}`);
    await expect(page.locator('#pago-anulado')).toContainText('Anulado sin pago');
    await expect(page.locator('#pago-plazo')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Ha llegado la transferencia' })).toHaveCount(0);
    await expect(page.locator('.dash-modal-card')).not.toContainText('Pendiente de pago');
  });

  // DEVOLVER EL IMPORTE de un pago con tarjeta (usuario, 2026-11-23): el botón solo lo ve el Admin
  // Master en un envío pagado con tarjeta, y la ventana pide importe, contraseña y la palabra
  // CONFIRMAR. Aquí no hay Stripe: la ventana lo dice y no deja devolver nada (las reglas y las
  // cuentas van en la prueba 332 de la base de datos y en las pruebas unitarias).
  test('devolver importe: el botón sale en un envío pagado con tarjeta y la ventana pide importe, contraseña y CONFIRMAR', async ({ page }) => {
    const sv = bd();
    const { data: u } = await sv.from('usuarios').select('cliente_id').eq('email', EMAIL.cliente).single();
    const d = new Date(Date.now() + 12 * 86400000).toISOString().slice(0, 10);
    const h = new Date(Date.now() + 13 * 86400000).toISOString().slice(0, 10);
    const { data: e, error } = await sv.from('envios').insert({ cliente_id: u!.cliente_id, metros_lineales: 13.3, toneladas: 20, importe_cliente: 1000,
      fecha_carga_desde: d, fecha_carga_hasta: h }).select('id').single();
    expect(error).toBeNull();
    await sv.from('envio_paradas').insert([
      { envio_id: e!.id, orden: 1, tipo: 'carga', codigo_postal: '41001', poblacion: 'Sevilla', pais_codigo_iso: 'ES', nombre_empresa: 'Nave devolución' },
      { envio_id: e!.id, orden: 2, tipo: 'descarga', codigo_postal: '28821', poblacion: 'Coslada', pais_codigo_iso: 'ES', nombre_empresa: 'Destino devolución' },
    ]);
    await sv.from('envios').update({ estado_pago_previo: 'pendiente', pago_motivo: 'Pedido por Dynamo' }).eq('id', e!.id);
    await sv.from('envios').update({ estado: 'programado' }).eq('id', e!.id);
    const pagado = await sv.from('envios').update({ estado_pago_previo: 'pagado', pago_metodo: 'stripe', pagado_en: new Date().toISOString(), stripe_pago_ref: 'pi_e2e_devolucion' }).eq('id', e!.id);
    expect(pagado.error).toBeNull();
    try {
      await entrar(page, 'dynamo');
      await page.goto(`/panel/envios?ver=${e!.id}`);
      const boton = page.locator('#pago-devolver');
      await expect(boton).toBeVisible();
      await boton.click();
      const ventana = page.locator('.dash-modal.open');
      await expect(ventana).toContainText('Devolver importe');
      // Sin Stripe en este entorno: lo dice y no hay nada que devolver.
      await expect(ventana.getByRole('alert')).toContainText('no está conectado');
      await expect(page.locator('#dv-devolver')).toBeDisabled();
      await ventana.getByRole('button', { name: 'No, volver' }).click();
      await expect(boton).toBeVisible();
      // Un envío que no está pagado con tarjeta no ofrece devolver nada.
      await sv.from('envios').update({ pago_metodo: 'transferencia', stripe_pago_ref: null }).eq('id', e!.id);
      await page.goto(`/panel/envios?ver=${e!.id}`);
      await expect(page.locator('.dash-modal.open')).toContainText('Pagado por adelantado');
      await expect(page.locator('#pago-devolver')).toHaveCount(0);
      // (Que solo el Admin Master pueda devolver lo comprueban la acción del servidor y la
      // prueba 332 de la base de datos: aquí no se puede degradar al único Admin Master.)
    } finally {
      await sv.from('envios').update({ estado: 'cancelado' }).eq('id', e!.id);
    }
  });

  // APARCADOS PARA LA V3 (usuario, 2026-11-23: «dejamos eso del pack para v3 mejor»): con el
  // módulo apagado en lib/modulos.ts no se ve nada (ni recuadro, ni menú, ni pantalla), pero la
  // base de datos sigue sin dejar pasar del tráiler. Al encenderlo, vuelve la prueba de pantalla.
  test('packs de grupaje: apagados no se ven; la base no deja pasar del tráiler', async ({ page }) => {
    const sb = bd();
    const { data: u } = await sb.from('usuarios').select('cliente_id').eq('email', EMAIL.cliente).single();
    const d = new Date(Date.now() + 12 * 86400000).toISOString().slice(0, 10);
    const h = new Date(Date.now() + 15 * 86400000).toISOString().slice(0, 10);
    const ids: string[] = [];
    for (const ml of [6, 5, 4]) {
      const { data: e, error } = await sb.from('envios').insert({ cliente_id: u!.cliente_id, metros_lineales: ml, toneladas: 5, importe_cliente: 700,
        fecha_carga_desde: d, fecha_carga_hasta: h }).select('id').single();
      expect(error).toBeNull();
      await sb.from('envio_paradas').insert([
        { envio_id: e!.id, orden: 1, tipo: 'carga', codigo_postal: '41001', poblacion: 'Sevilla', pais_codigo_iso: 'ES', nombre_empresa: 'Nave pack' },
        { envio_id: e!.id, orden: 2, tipo: 'descarga', codigo_postal: '28001', poblacion: 'Madrid', pais_codigo_iso: 'ES', nombre_empresa: 'Destino pack' }]);
      await sb.from('envios').update({ estado: 'programado' }).eq('id', e!.id);
      // Una partida pendiente de pago no se agrupa: estas, sin pago previo.
      const { error: ep } = await sb.from('envios').update({ estado_pago_previo: 'exento', pago_exento_motivo: 'Prueba de packs' }).eq('id', e!.id);
      expect(ep).toBeNull();
      ids.push(e!.id);
    }
    const { data: refs } = await sb.from('envios').select('id, referencia_gx').in('id', ids);
    const gx = (id: string) => `#${refs!.find((r) => r.id === id)!.referencia_gx}`;
    try {
      await entrar(page, 'dynamo');
      await page.goto(`/panel/envios?ver=${ids[0]}`);
      const caja = page.locator('[data-pack-box]');
      if (!PACKS_GRUPAJE) {
        await expect(page.getByText(gx(ids[0])).first()).toBeVisible();   // la ficha está abierta
        await expect(caja).toHaveCount(0);
        await expect(page.locator('a[href="/panel/packs"]')).toHaveCount(0);
        await page.goto('/panel/packs');
        await expect(page).not.toHaveURL(/\/panel\/packs/);
        // La regla sigue viva en la base de datos: dos partidas se juntan, la tercera no cabe.
        const dy = await como('dynamo');
        const r1 = await dy.rpc('crear_pack', { p_envios: [ids[0], ids[1]] });
        expect(r1.error).toBeNull();
        const pack = r1.data as { pack_id: string; codigo: string };
        expect(pack.codigo).toMatch(/^PK-\d{4}$/);
        const r2 = await dy.rpc('crear_pack', { p_envios: [ids[2]], p_pack: pack.pack_id });
        expect(r2.error?.message).toContain('se pasan del tráiler');
        const r3 = await dy.rpc('deshacer_pack', { p_pack: pack.pack_id });
        expect(r3.error).toBeNull();
        return;
      }
      await expect(caja).toContainText('Se puede agrupar');
      const filaB = caja.locator('.pack-partida', { hasText: gx(ids[1]) });
      await filaB.getByRole('checkbox').check();
      await caja.getByRole('button', { name: 'Crear pack con 2 partidas' }).click();
      await expect(caja).toContainText(/Pack de grupaje PK-\d{4}/);
      await expect(caja.locator('.pack-cap')).toContainText('11,00 / 13,30 m');
      // La tercera (4 m) ya no cabe: 6 + 5 + 4 = 15 m.
      const filaC = caja.locator('.pack-partida', { hasText: gx(ids[2]) });
      await expect(filaC).toContainText('No cabe en el tráiler');
      await expect(filaC.getByRole('checkbox')).toBeDisabled();
      await page.goto('/panel/packs');
      await expect(page.locator('[data-pack-creado]', { hasText: gx(ids[0]) })).toContainText(gx(ids[1]));
    } finally {
      await sb.from('envios').update({ estado: 'cancelado' }).in('id', ids);
    }
  });

  // El contenido REAL de los ficheros (usuario, 2026-11-18): el almacén solo admite PDF e
  // imágenes, pero el tipo lo declara quien sube. Un programa con nombre de albarán no entra
  // por la pantalla, no se registra aunque alguien se salte la pantalla y, si ya estuviera
  // dentro, no se le abre a nadie.
  test('archivos: lo que no es una imagen ni un PDF de verdad no se sube, no se registra y no se abre', async ({ page }) => {
    const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
    const FALSO = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(300, 7)]);   // un programa de Windows
    const envio = await ultimoEnvio();
    const sv = bd();
    const carpeta = `envios/${envio.id}/${crypto.randomUUID()}`;
    // 1 · AL ABRIR: uno falso que ya está dentro (subido saltándose la web, con el tipo
    //     «image/jpeg» que el almacén sí admite) y uno bueno.
    for (const [nombre, cuerpo, mime] of [['albaran.jpg', FALSO, 'image/jpeg'], ['bueno.png', PNG, 'image/png']] as const) {
      const sub = await sv.storage.from('documentos').upload(`${carpeta}/${nombre}`, cuerpo, { contentType: mime });
      expect(sub.error).toBeNull();
    }
    const { data: filas, error } = await sv.from('documentos').insert([
      { envio_id: envio.id, tipo: 'otro', storage_ruta: `${carpeta}/albaran.jpg`, nombre_archivo: 'albaran.jpg', tipo_mime: 'image/jpeg', tamano_bytes: FALSO.length },
      { envio_id: envio.id, tipo: 'otro', storage_ruta: `${carpeta}/bueno.png`, nombre_archivo: 'bueno.png', tipo_mime: 'image/png', tamano_bytes: PNG.length },
    ]).select('id, nombre_archivo');
    expect(error).toBeNull();
    const idDe = (n: string) => filas!.find((f) => f.nombre_archivo === n)!.id;
    await entrar(page, 'dynamo');
    const malo = await page.request.get(`/panel/documentos/${idDe('albaran.jpg')}`, { maxRedirects: 0 });
    expect(malo.status()).toBe(415);
    expect(await malo.text()).toContain('no es una imagen ni un PDF');
    const bueno = await page.request.get(`/panel/documentos/${idDe('bueno.png')}`, { maxRedirects: 0 });
    expect(bueno.status()).toBe(302);

    // 2 · EN LA PANTALLA: un programa con nombre y tipo de PDF. Se avisa y NO se sube.
    await page.goto(`/panel/envios?ver=${envio.id}`);
    await page.getByRole('button', { name: /^Documentos/ }).click();
    const galeria = page.locator('input[type=file]:not([capture])').first();
    let subidas = 0;
    page.on('request', (r) => { if (r.method() === 'POST' && r.url().includes('/storage/v1/object/documentos/')) subidas++; });
    await galeria.setInputFiles({ name: 'albaran-firmado.pdf', mimeType: 'application/pdf', buffer: FALSO });
    await expect(page.getByText('«albaran-firmado.pdf» no es una imagen ni un PDF de verdad')).toBeVisible();
    expect(subidas).toBe(0);

    // 3 · EN EL SERVIDOR: lo mismo saltándose el aviso del navegador (se le hace creer que
    //     el principio del fichero es el de una imagen). El fichero llega al almacén, el
    //     servidor mira su contenido, lo RECHAZA y lo BORRA: no queda ni fichero ni fila.
    await page.evaluate((png) => {
      const original = Blob.prototype.slice;
      Blob.prototype.slice = function (a?: number, b?: number, c?: string) {
        return a === 0 && b === 64 ? new Blob([Uint8Array.from(atob(png), (x) => x.charCodeAt(0))]) : original.call(this, a, b, c);
      };
    }, PNG.toString('base64'));
    await galeria.setInputFiles({ name: 'colado.pdf', mimeType: 'application/pdf', buffer: FALSO });
    await expect(page.getByText('«colado.pdf» no es una imagen ni un PDF de verdad')).toBeVisible();
    expect(subidas).toBe(1);
    const { count } = await sv.from('documentos').select('id', { count: 'exact', head: true }).eq('envio_id', envio.id).eq('nombre_archivo', 'colado.pdf');
    expect(count).toBe(0);
    const { data: restos } = await sv.schema('storage').from('objects').select('name').like('name', `envios/${envio.id}/%/colado.pdf`);
    expect(restos ?? []).toHaveLength(0);

    // 4 · Y uno de verdad sigue entrando como siempre.
    await page.evaluate(() => location.reload());
    await page.getByRole('button', { name: /^Documentos/ }).click();
    await page.locator('input[type=file]:not([capture])').first().setInputFiles({ name: 'foto-buena.png', mimeType: 'image/png', buffer: PNG });
    await expect(page.locator('.modal-file-item', { hasText: 'foto-buena.png' })).toBeVisible();
  });

  // Ninguna tabla del panel se pinta entera (usuario, 2026-11-18): como mucho una página, con
  // su pie «Mostrando 1–20 de N». Festivos es la que más filas trae de serie, y lleva buscador.
  test('paginación: Festivos enseña 20 por página, pasa de página y su buscador filtra', async ({ page }) => {
    await entrar(page, 'dynamo');
    await page.goto('/panel/festivos');
    const filas = page.locator('#sec-festivos table.data tbody tr');
    await expect(filas).toHaveCount(20);
    const pie = page.locator('#sec-festivos .pagination');
    await expect(pie).toContainText(/Mostrando 1–20 de \d+ festivos/);
    const primera = await filas.first().innerText();
    await pie.getByRole('button', { name: 'Página 2' }).click();
    await expect(pie).toContainText(/Mostrando 21–40 de/);
    await expect(filas.first()).not.toHaveText(primera);
    // El buscador vuelve a la primera página y deja solo lo que casa (sin acentos ni mayúsculas).
    await page.locator('#festivos-buscar').fill('navidad');
    await expect(pie).toContainText(/Mostrando 1–\d+ de \d+ festivos?/);
    for (const t of await filas.allInnerTexts()) expect(t.toLowerCase()).toContain('navidad');
    await page.locator('#festivos-buscar').fill('zzz no existe');
    await expect(page.locator('#sec-festivos')).toContainText('Ningún festivo casa con la búsqueda.');
  });

  // «Firmó en papel» (usuario, 2026-11-19): una casilla marcable por cada parte que aún no ha
  // firmado, el transportista incluido, todas marcadas; y ya no se teclea quién firmó.
  test('firmó en papel: salen marcadas todas las partes (con el transportista) y no se pide nombre ni documento', async ({ page }) => {
    const id = await envioListo(page);
    const sv = bd();
    expect((await sv.from('envios').update({ matricula_camion: '1234BCD' }).eq('id', id)).error).toBeNull();
    await entrar(page, 'dynamo');
    await page.goto(`/panel/envios?ver=${id}`);
    await page.getByRole('button', { name: /^eCMR/ }).click();
    await page.getByRole('button', { name: /Firmó en papel/ }).click();
    const casillas = page.locator('#fp-casillas input[type=checkbox]');
    await expect(casillas).toHaveCount(3);
    for (const c of await casillas.all()) await expect(c).toBeChecked();
    await expect(page.locator('#fp-casillas')).toContainText('Transportista · casilla 23');
    await expect(page.locator('#fp-nombre, #fp-pais, #fp-doc, #fp-parada')).toHaveCount(0);
    // Se desmarca quien no firmó en el papel: aquí, el transportista.
    await page.locator('#fp-casillas label', { hasText: 'casilla 23' }).locator('input').uncheck();
    const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
    await page.locator('#fp-foto').setInputFiles({ name: 'cmr-en-papel.png', mimeType: 'image/png', buffer: PNG });
    await page.getByRole('button', { name: 'Registrar la firma en papel' }).click();
    const firmas = async () => ((await sv.from('firmas_cmr').select('rol, documento, en_papel').eq('envio_id', id)).data ?? []);
    await expect.poll(async () => (await firmas()).map((f) => f.rol).sort().join(',')).toBe('destinatario,remitente');
    for (const f of await firmas()) { expect(f.en_papel).toBe(true); expect(f.documento).toBe('EN PAPEL'); }
    // En la ficha quedan como firmadas en papel, y sigue pudiéndose apuntar la que falta.
    await expect(page.getByText('Firmó en papel · CMR bis anexo').first()).toBeVisible();
    await expect(page.getByText('sus datos constan en el papel').first()).toBeVisible();
    await page.getByRole('button', { name: /Firmó en papel \(CMR bis\)/ }).click();
    await expect(page.locator('#fp-casillas input[type=checkbox]')).toHaveCount(1);
    await expect(page.locator('#fp-casillas')).toContainText('casilla 23');
  });

  // Lo escrito en la ruta no se teclea dos veces (usuario, 2026-11-19): si el sitio no está y
  // se pulsa «+ Crear nuevo sitio», la ventana nace con ese texto en «Empieza aquí».
  test('nuevo sitio desde la ruta: «Empieza aquí» nace con lo que ya se había escrito', async ({ page }) => {
    await entrar(page, 'cliente');
    await page.goto('/panel/nuevo-envio');
    await page.locator('.ptar-route-row input[type=text]').nth(0).fill('  Zzlaos  ');
    await expect(page.locator('.ptar-sug')).toContainText('aún no tiene sitios con ese nombre');
    await page.locator('.ptar-sug li', { hasText: 'Crear nuevo sitio' }).click();
    await expect(page.locator('#sitio-buscar')).toHaveValue('Zzlaos');
  });

  // Fallo (usuario, 2026-11-25): al elegir OTRO resultado del buscador en la misma ficha se
  // quedaban el teléfono (y el horario, y el tipo) del anterior. Elegir otro empieza de cero.
  test('nuevo sitio: elegir otro resultado del buscador limpia la ficha entera (no queda el teléfono del anterior)', async ({ page }) => {
    await entrar(page, 'cliente');
    await page.goto('/panel/nuevo-envio');
    await page.locator('.ptar-route-row input[type=text]').nth(0).fill('Zzprimera');
    await page.locator('.ptar-sug li', { hasText: 'Crear nuevo sitio' }).click();
    await page.locator('#sitio-buscar').focus();
    await page.locator('[data-sug-google]').first().click();
    await expect(page.locator('#sitio-nombre_empresa')).toHaveValue('Zzprimera, S.L.');
    // El teléfono que trae el buscador es un FIJO: va directo al campo «Fijo», no al del móvil
    // (usuario, 2026-11-26: «que lo ponga fijo directo en fijo»).
    const tel = page.locator('#ct-0-fijo');
    const primero = await tel.inputValue();
    expect(primero.replace(/\D/g, '').length).toBeGreaterThan(5);
    await expect(page.locator('#ct-0-tel')).toHaveValue('');
    // Algo escrito a mano en la primera: tampoco debe quedarse en la segunda empresa.
    await page.locator('.dash-modal-card input[type=email]').first().fill('de-la-primera@e2e.invalid');
    await page.locator('#sitio-buscar').fill('Zzsegunda otra');
    await page.locator('[data-sug-google]').first().click();
    await expect(page.locator('#sitio-nombre_empresa')).toHaveValue('Zzsegunda Otra, S.L.');
    await expect(tel).not.toHaveValue(primero);
    expect((await tel.inputValue()).replace(/\D/g, '').length).toBeGreaterThan(5);
    await expect(page.locator('.dash-modal-card input[type=email]').first()).toHaveValue('');
    expect(await page.locator('#sitio-direccion').inputValue()).not.toBe('');
  });

  // Fallo (usuario, 2026-11-21): el sitio creado desde la ruta no se quedaba en la parada ni
  // salía en el desplegable hasta recargar. Ahora queda elegido y aparece en la agenda.
  test('nuevo sitio desde la ruta: queda elegido en la parada y sale en el desplegable sin recargar', async ({ page }) => {
    const nombre = `Naves Qwerty ${'abcdefghij'.split('').sort(() => Math.random() - 0.5).join('').slice(0, 5)}`;
    await entrar(page, 'cliente');
    await page.goto('/panel/nuevo-envio');
    await page.locator('.ptar-route-row input[type=text]').nth(0).fill(nombre);
    await page.locator('.ptar-sug li', { hasText: 'Crear nuevo sitio' }).click();
    await page.locator('#sitio-buscar').focus();
    await page.locator('li', { hasText: '¿No lo encuentras? + Crear un sitio nuevo' }).click();
    await expect(page.locator('#sitio-nombre_empresa')).toHaveValue(nombre);
    await page.selectOption('#sitio-tipo', { index: 1 });
    await page.fill('#sitio-direccion', 'C/ Prueba, 1');
    await page.fill('#sitio-codigo_postal', '41016');
    await page.fill('#sitio-poblacion', 'Sevilla');
    // La provincia sale sola del código postal (usuario, 2026-11-22), en el desplegable con buscador.
    await expect(page.locator('#sitio-provincia')).toHaveAttribute('data-valor', 'Sevilla');
    await page.fill('#sitio-codigo_postal', '11201');
    await expect(page.locator('#sitio-provincia')).toHaveAttribute('data-valor', 'Cádiz');
    await page.fill('#sitio-codigo_postal', '41016');
    await expect(page.locator('#sitio-provincia')).toHaveAttribute('data-valor', 'Sevilla');
    // DOS teléfonos en los sitios (usuario, 2026-11-26): móvil (WhatsApp) y fijo. Un fijo escrito
    // en el móvil acaba solo en el fijo al guardar; aquí va cada uno en su campo.
    await expect(page.locator('label[for="ct-0-tel"]')).toContainText('Móvil (WhatsApp)');
    await expect(page.locator('label[for="ct-0-fijo"]')).toContainText('Fijo');
    await page.fill('#ct-0-tel', '600111222');
    await page.fill('#ct-0-fijo', '954111222');
    await page.getByRole('button', { name: 'Crear sitio' }).click();
    await expect(page.locator('#sitio-buscar')).toHaveCount(0);
    await expect.poll(async () => {
      const { data: st } = await bd().from('sitios').select('id').eq('nombre_empresa', nombre).maybeSingle();
      if (!st) return '';
      const { data: ct } = await bd().from('contactos').select('telefono, telefono_fijo').eq('sitio_id', st.id).maybeSingle();
      return `${ct?.telefono ?? ''} / ${ct?.telefono_fijo ?? ''}`;
    }, { timeout: 20000 }).toBe('+34600111222 / +34954111222');
    // Queda elegido en la recogida…
    await expect(page.locator('.ptar-route-row input[type=text]').nth(0)).toHaveValue(new RegExp(`^${nombre}`));
    // …y la entrega ya lo encuentra en el desplegable, sin recargar.
    await page.locator('.ptar-route-row input[type=text]').last().fill(nombre.slice(0, 12));
    await expect(page.locator('.ptar-sug')).toContainText(nombre);
  });

  // Transportista propio (usuario, 2026-11-22): provincia y país. La provincia se elige en el
  // desplegable con buscador de la plataforma, el mismo que el de país (usuario, 2026-11-25:
  // «así no», al ver el del navegador). «Tipos de camión» ya no está en la ficha («no aporta»):
  // lo guardado se queda como estaba y un transportista nuevo nace con el tráiler, como antes.
  test('transportista propio: provincia con buscador, país y sin tipos de camión en la ficha', async ({ page }) => {
    const nombre = `Camiones Prueba ${Date.now()}`;
    await entrar(page, 'cliente');
    await page.goto('/panel/operadores');
    await page.getByRole('button', { name: '+ Nuevo transportista' }).click();
    await page.locator('#op-razon_social').fill(nombre);
    await expect(page.locator('#op-camiones')).toHaveCount(0);
    await expect(page.getByText('Tipos de camión')).toHaveCount(0);
    // La provincia: botón como el de país; al abrirlo, buscador (sin acentos) y la lista.
    const prov = page.locator('#op-provincia');
    await expect(prov).toHaveJSProperty('tagName', 'BUTTON');
    await expect(prov).toContainText('Elige la provincia…');
    await prov.click();
    await expect(page.getByRole('option', { name: 'Zaragoza', exact: true })).toBeVisible();
    await page.getByLabel('Buscar provincia').fill('cadi');
    await expect(page.getByRole('option')).toHaveText(['Cádiz']);
    await page.getByLabel('Buscar provincia').fill('sev');
    await page.keyboard.press('Enter');
    await expect(prov).toHaveAttribute('data-valor', 'Sevilla');
    await expect(prov).toContainText('Sevilla');
    await page.getByRole('button', { name: 'Crear transportista' }).click();
    await expect.poll(async () => (await bd().from('operadores').select('provincia, pais_codigo_iso, tipos_camion, otros_camiones').eq('razon_social', nombre).maybeSingle()).data, { timeout: 15000 })
      .toEqual({ provincia: 'Sevilla', pais_codigo_iso: 'ES', tipos_camion: ['trailer_tauliner'], otros_camiones: false });
  });

  // Provincia fuera de España (usuario, 2026-11-22): se puede escribir la que sea y se sugieren
  // las de las fichas vivas de ese país; en España, las 52. Siempre en el desplegable con
  // buscador de la plataforma, no en la lista de sugerencias del navegador (2026-11-25).
  test('provincia fuera de España: se sugieren las que usan las fichas de ese país', async ({ page }) => {
    const prov = `Distrito E2E ${Date.now()}`;
    // Un sitio de Portugal del cliente de prueba (el mismo dueño que «Nave Madrid»).
    const { data: nave } = await bd().from('sitios').select('cliente_id').eq('nombre_empresa', 'Nave Madrid').limit(1).single();
    const { data: s } = await bd().from('sitios').insert({ cliente_id: nave!.cliente_id, nombre_empresa: `Armazém E2E ${Date.now()}`, direccion: 'Rua Um, 1',
      codigo_postal: '1000-001', poblacion: 'Lisboa', provincia: prov, pais_codigo_iso: 'PT' }).select('id').single();
    try {
      await entrar(page, 'cliente');
      await page.goto('/panel/operadores');
      await page.getByRole('button', { name: '+ Nuevo transportista' }).click();
      await expect(page.locator('#op-provincia')).toContainText('Elige la provincia…');
      await page.locator('#op-pais').click();
      await page.getByLabel('Buscar país').fill('Portugal');
      await page.getByRole('option', { name: /Portugal/ }).first().click();
      await expect(page.locator('#op-provincia')).toContainText('Provincia o región');
      await expect(page.locator('datalist')).toHaveCount(0);
      // Al abrirlo salen las que ya usan las fichas de Portugal…
      await page.locator('#op-provincia').click();
      await expect(page.getByRole('option', { name: prov, exact: true })).toBeVisible({ timeout: 10000 });
      // …y se puede escribir una que no esté.
      await page.getByLabel('Buscar provincia').fill('Algarve E2E');
      await page.getByRole('option', { name: 'Usar «Algarve E2E»' }).click();
      await expect(page.locator('#op-provincia')).toHaveAttribute('data-valor', 'Algarve E2E');
      // Y elegir una de las sugeridas.
      await page.locator('#op-provincia').click();
      await page.getByLabel('Buscar provincia').fill('distrito e2e');
      await page.getByRole('option', { name: prov, exact: true }).click();
      await expect(page.locator('#op-provincia')).toHaveAttribute('data-valor', prov);
    } finally {
      await bd().from('sitios').delete().eq('id', s!.id);
    }
  });

  // CP ↔ localidad ↔ provincia desde las fichas (usuario, 2026-11-22): escribir el CP rellena
  // la localidad y la provincia; elegir la localidad rellena el CP si solo tiene uno.
  test('dirección: el código postal rellena localidad y provincia, y la localidad rellena el CP', async ({ page }) => {
    const t = Date.now().toString().slice(-5);
    const loc = `Vila E2E ${t}`;
    const { data: nave } = await bd().from('sitios').select('cliente_id').eq('nombre_empresa', 'Nave Madrid').limit(1).single();
    const { data: s } = await bd().from('sitios').insert({ cliente_id: nave!.cliente_id, nombre_empresa: `Armazém CP ${t}`, direccion: 'Rua Um, 1',
      codigo_postal: `4${t.slice(0, 3)}-${t.slice(2)}`, poblacion: loc, provincia: `Distrito E2E ${t}`, pais_codigo_iso: 'PT' }).select('id, codigo_postal').single();
    try {
      await entrar(page, 'cliente');
      await page.goto('/panel/nuevo-envio');
      await page.locator('.ptar-route-row input[type=text]').nth(0).fill(`Nuevo ${t}`);
      await page.locator('.ptar-sug li', { hasText: 'Crear nuevo sitio' }).click();
      await page.locator('#sitio-buscar').focus();
      await page.locator('li', { hasText: '¿No lo encuentras? + Crear un sitio nuevo' }).click();
      await page.locator('#sitio-pais').click();
      await page.getByLabel('Buscar país').fill('Portugal');
      await page.getByRole('option', { name: /Portugal/ }).first().click();
      // 1) El CP rellena la localidad y la provincia.
      await page.fill('#sitio-codigo_postal', s!.codigo_postal);
      await expect(page.locator('#sitio-poblacion')).toHaveValue(loc, { timeout: 10000 });
      await expect(page.locator('#sitio-provincia')).toHaveAttribute('data-valor', `Distrito E2E ${t}`);
      // 2) Al revés: sin CP, elegir la localidad rellena el CP (solo tiene uno).
      await page.fill('#sitio-codigo_postal', '');
      await page.fill('#sitio-poblacion', 'Vila E2E');
      // Las sugerencias salen en la ventana de la plataforma, no en la del navegador; se elige con un toque.
      await expect(page.locator('datalist')).toHaveCount(0);
      const sugerida = page.locator('.campo-sug-pop').getByRole('option', { name: new RegExp(loc) });
      await expect(sugerida).toBeVisible({ timeout: 10000 });
      await sugerida.click();
      await expect(page.locator('#sitio-poblacion')).toHaveValue(loc);
      await expect(page.locator('#sitio-codigo_postal')).toHaveValue(s!.codigo_postal);
    } finally {
      await bd().from('sitios').delete().eq('id', s!.id);
    }
  });

  // Crear varios envíos: un sitio sin teléfono de contacto no deja crear; se completa en la fila.
  test('crear varios envíos: sitio sin teléfono marca la fila y se completa allí mismo', async ({ page }) => {
    // Reintenta: justo tras reiniciar la base de datos, la primera consulta puede llegar vacía.
    let c: { id: string; telefono: string | null } | null = null;
    await expect.poll(async () => {
      ({ data: c } = await bd().from('contactos').select('id, telefono, sitios!inner(nombre_empresa)').eq('sitios.nombre_empresa', 'Nave Madrid').eq('es_principal', true).limit(1).maybeSingle());
      return !!c;
    }, { timeout: 20000 }).toBe(true);
    await bd().from('contactos').update({ telefono: null }).eq('id', c!.id);
    try {
      await entrar(page, 'cliente');
      await page.goto('/panel/nuevo-envio/varios');
      const fila1 = page.locator('.varios-fila').nth(0);
      const sitio = fila1.locator('.ptar-route-row input[type=text]');
      await sitio.nth(0).fill('Sevilla'); await page.locator('.ptar-sug li').first().click();
      await sitio.nth(1).fill('Madrid'); await page.locator('.ptar-sug li').first().click();
      await expect(fila1.locator('.varios-res.error')).toContainText('Falta el teléfono de contacto de 2 · Entrega: «Nave Madrid»');
      // Aunque antes se haya tocado (y dejado vacío) el teléfono en la ficha del sitio, al
      // guardar desde la fila el aviso se quita (usuario, 2026-11-24).
      await page.locator('#varios-crear').click();
      const enFicha = fila1.locator('.ptar-sitio-card.falta input[type=tel]').first();   // el del móvil (el segundo es el fijo)
      // Un par de cifras no es un teléfono: el aviso sigue. Con un número de verdad, se quita.
      await enFicha.fill('6');
      await expect(fila1.locator('.varios-tel')).toHaveCount(1);
      await fila1.locator('.ptar-sitio-card', { hasText: 'Nave Madrid' }).locator('input[type=tel]').first().fill('611222333');
      await expect(fila1.locator('.varios-tel')).toHaveCount(0);
      await fila1.locator('.ptar-sitio-card', { hasText: 'Nave Madrid' }).locator('input[type=tel]').first().fill('');
      await fila1.locator('.varios-tel input').fill('600123123');
      await fila1.locator('.varios-tel button').click();
      await expect(fila1.locator('.varios-tel')).toHaveCount(0);
      await expect(fila1.locator('.varios-res.error')).toHaveCount(0);
    } finally {
      await bd().from('contactos').update({ telefono: c!.telefono }).eq('id', c!.id);
    }
  });

  // «Ver sitios» (usuario, 2026-11-22): las fichas de Nuevo envío debajo de cada fila; con un
  // dato obligatorio sin rellenar, al pulsar «Crear» se abren solas en rojo; lo escrito se guarda
  // en el sitio al crear.
  test('crear varios envíos: «Ver sitios» abre las fichas, la que falta sale en rojo y se guarda en el sitio', async ({ page }) => {
    let c: { id: string; telefono: string | null } | null = null;
    await expect.poll(async () => {
      ({ data: c } = await bd().from('contactos').select('id, telefono, sitios!inner(nombre_empresa)').eq('sitios.nombre_empresa', 'Nave Madrid').eq('es_principal', true).limit(1).maybeSingle());
      return !!c;
    }, { timeout: 20000 }).toBe(true);
    await bd().from('contactos').update({ telefono: null }).eq('id', c!.id);
    try {
      await entrar(page, 'cliente');
      await page.goto('/panel/nuevo-envio/varios');
      const filas = page.locator('.varios-fila');
      const fila1 = filas.nth(0);
      const sitio = fila1.locator('.ptar-route-row input[type=text]');
      await sitio.nth(0).fill('Sevilla'); await page.locator('.ptar-sug li').first().click();
      await sitio.nth(1).fill('Madrid'); await page.locator('.ptar-sug li').first().click();
      await filas.nth(1).locator('.varios-quitar').click();
      // Se pueden abrir y cerrar a mano.
      await fila1.locator('.varios-sitios-btn').click();
      await expect(fila1.locator('.ptar-sitio-card')).toHaveCount(2);
      await fila1.locator('.varios-sitios-btn').click();
      await expect(fila1.locator('.ptar-sitio-card')).toHaveCount(0);
      // Al pulsar «Crear» con el teléfono sin poner: la ficha se abre sola, en rojo.
      await page.locator('#varios-crear').click();
      const falta = fila1.locator('.ptar-sitio-card.falta');
      await expect(falta).toHaveCount(1);
      await expect(falta).toContainText('Nave Madrid');
      await falta.locator('input[type=tel]').first().fill('600123124');
      await expect(fila1.locator('.varios-res.error')).toHaveCount(0);
      await expect(fila1.locator('.varios-importe')).toContainText('€', { timeout: 15000 });
      await page.locator('#varios-crear').click();
      // La cuenta de pruebas no tiene crédito: la ventana avisa en naranja, ANTES de crear, de que el
      // envío se paga por adelantado y pregunta si se va a pagar (usuario, 2026-11-24).
      await expect(page.locator('#varios-conf-pago')).toContainText('Este envío se paga por adelantado');
      await expect(page.locator('#varios-conf-pago')).toContainText('¿Vas a pagarlo ahora?');
      await expect(page.locator('#varios-conf-lista .varios-conf-pago')).toHaveCount(1);
      await page.locator('#varios-confirmar').click();
      // Se guarda en la ficha del sitio al crear.
      await expect.poll(async () => (await bd().from('contactos').select('telefono').eq('id', c!.id).single()).data?.telefono ?? '', { timeout: 20000 }).toContain('600123124');
    } finally {
      await bd().from('contactos').update({ telefono: c!.telefono }).eq('id', c!.id);
    }
  });

  // El mismo sitio en varias paradas (usuario, 2026-11-24): el teléfono puesto en la ficha de
  // una vale para las demás, y el aviso dice en qué parada falta.
  test('crear varios envíos: lo puesto en la ficha de un sitio vale para sus otras paradas', async ({ page }) => {
    let c: { id: string; telefono: string | null } | null = null;
    await expect.poll(async () => {
      ({ data: c } = await bd().from('contactos').select('id, telefono, sitios!inner(nombre_empresa)').eq('sitios.nombre_empresa', 'Nave Madrid').eq('es_principal', true).limit(1).maybeSingle());
      return !!c;
    }, { timeout: 20000 }).toBe(true);
    await bd().from('contactos').update({ telefono: null }).eq('id', c!.id);
    try {
      await entrar(page, 'cliente');
      await page.goto('/panel/nuevo-envio/varios');
      const filas = page.locator('.varios-fila');
      const fila1 = filas.nth(0);
      const sitio = fila1.locator('.ptar-route-row input[type=text]');
      await sitio.nth(0).fill('Sevilla'); await page.locator('.ptar-sug li').first().click();
      await sitio.nth(1).fill('Madrid'); await page.locator('.ptar-sug li').first().click();
      await filas.nth(1).locator('.varios-quitar').click();
      await fila1.locator('.varios-dup').click();
      await expect(filas).toHaveCount(2);
      const fila2 = filas.nth(1);
      // Al pulsar «Crear», las fichas a las que les falta el teléfono se abren en las dos filas.
      await page.locator('#varios-crear').click();
      await expect(fila2.locator('.varios-res.error')).toContainText('Falta el teléfono de contacto de 2 · Entrega: «Nave Madrid»');
      await expect(fila2.locator('.ptar-sitio-card.falta')).toHaveCount(1);
      // Se pone en la ficha de la fila 1 y la fila 2 lo tiene también: sin aviso y con el número.
      await fila1.locator('.ptar-sitio-card.falta input[type=tel]').first().fill('600123125');
      await expect(fila1.locator('.varios-res.error')).toHaveCount(0);
      await expect(fila2.locator('.varios-res.error')).toHaveCount(0);
      await expect(fila2.locator('.ptar-sitio-card', { hasText: 'Nave Madrid' }).locator('input[type=tel]').first()).toHaveValue('600123125');
    } finally {
      await bd().from('contactos').update({ telefono: c!.telefono }).eq('id', c!.id);
    }
  });

  // EL MISMO SITIO EN LA RECOGIDA Y EN LA ENTREGA, sin teléfono (usuario, 2026-11-24: «debería
  // salir por separado, cada línea pidiendo rellenar»): una línea por parada; como el teléfono
  // es del sitio, lo escrito en una sale en la otra y al guardar se quitan las dos.
  test('crear varios envíos: sin teléfono, una línea por parada aunque el sitio sea el mismo', async ({ page }) => {
    let c: { id: string; telefono: string | null } | null = null;
    await expect.poll(async () => {
      ({ data: c } = await bd().from('contactos').select('id, telefono, sitios!inner(nombre_empresa)').eq('sitios.nombre_empresa', 'Nave Madrid').eq('es_principal', true).limit(1).maybeSingle());
      return !!c;
    }, { timeout: 20000 }).toBe(true);
    await bd().from('contactos').update({ telefono: null }).eq('id', c!.id);
    try {
      await entrar(page, 'cliente');
      await page.goto('/panel/nuevo-envio/varios');
      const filas = page.locator('.varios-fila');
      const fila1 = filas.nth(0);
      const sitio = fila1.locator('.ptar-route-row input[type=text]');
      await sitio.nth(0).fill('Madrid'); await page.locator('.ptar-sug li').first().click();
      await sitio.nth(1).fill('Madrid'); await page.locator('.ptar-sug li').first().click();
      await filas.nth(1).locator('.varios-quitar').click();
      await expect(fila1.locator('.varios-res.error')).toContainText('Falta el teléfono de contacto de 1 · Recogida: «Nave Madrid» y de 2 · Entrega: «Nave Madrid»');
      const lineas = fila1.locator('.varios-tel');
      await expect(lineas).toHaveCount(2);
      await expect(lineas.nth(0)).toContainText('1 · Recogida: Nave Madrid');
      await expect(lineas.nth(1)).toContainText('2 · Entrega: Nave Madrid');
      await expect(lineas.nth(1)).toContainText('Es el mismo sitio que 1 · Recogida');
      // Lo escrito en una sale en la otra, y al guardar se quitan las dos.
      await lineas.nth(1).locator('input').fill('600123126');
      await expect(lineas.nth(0).locator('input')).toHaveValue('600123126');
      await lineas.nth(0).locator('button').click();
      await expect(lineas).toHaveCount(0);
      await expect.poll(async () => (await bd().from('contactos').select('telefono').eq('id', c!.id).single()).data?.telefono ?? '').toContain('600123126');
    } finally {
      await bd().from('contactos').update({ telefono: c!.telefono }).eq('id', c!.id);
    }
  });

  test('crear varios envíos: al equipo de Dynamo se le pide primero el cliente', async ({ page }) => {
    await entrar(page, 'dynamo');
    await page.goto('/panel/nuevo-envio/varios');
    await expect(page.locator('#varios-tabla')).toBeVisible();
    await expect(page.locator('#varios-elige-cliente')).toContainText('Elige primero el cliente');
  });

  // Crear varios envíos (usuario, 2026-11-21): desde la flechita de «Nuevo envío», una tabla
  // con un envío por fila (máximo 20), precio por fila, quitar/duplicar, proforma y crear.
  test('crear varios envíos: tabla con precio por fila, proforma y creación de golpe', async ({ page }) => {
    await entrar(page, 'cliente');
    await page.goto('/panel/envios');
    if (test.info().project.name === 'movil') {
      // En el móvil, también para el cliente (usuario, 2026-11-24: «claro, cliente también»):
      // la flechita del cartel «Nuevo envío» de su panel despliega «Crear varios envíos».
      await page.goto('/panel/dashboard');
      await page.locator('#banner-mas').click();
      await page.locator('#menu-varios-envios').click();
      await expect(page).toHaveURL(/\/panel\/nuevo-envio\/varios/);
      await expect(page.locator('#varios-tabla')).toBeVisible();
      await page.goto('/panel/envios');
    }
    await page.locator('#btn-nuevo-mas').click();
    await page.locator('#menu-varios-envios').click();
    await expect(page).toHaveURL(/\/panel\/nuevo-envio\/varios/);
    const filas = page.locator('.varios-fila');
    await expect(filas).toHaveCount(2);   // dos filas de entrada (usuario, 2026-11-24)
    const fila1 = filas.nth(0);
    const sitio = fila1.locator('.ptar-route-row input[type=text]');
    await sitio.nth(0).fill('Sevilla'); await page.locator('.ptar-sug li').first().click();
    await sitio.nth(1).fill('Madrid'); await page.locator('.ptar-sug li').first().click();
    await expect(fila1.locator('.varios-importe')).toContainText('€', { timeout: 15000 });
    // Requisitos: un desplegable de selección múltiple; enseña lo marcado o «Ninguno».
    const req = fila1.locator('.varios-req-btn');
    await expect(req).toHaveText('Ninguno');
    await req.click();
    await fila1.locator('.varios-req-menu label', { hasText: 'NIMA' }).locator('input').check();
    await fila1.locator('.varios-req-menu label', { hasText: 'ADR' }).locator('input').check();
    await expect(req).toHaveText('NIMA, ADR');
    await fila1.locator('.varios-req-menu label', { hasText: 'NIMA' }).locator('input').uncheck();
    await fila1.locator('.varios-req-menu label', { hasText: 'ADR' }).locator('input').uncheck();
    await page.keyboard.press('Escape');
    await expect(fila1.locator('.varios-req-menu')).toHaveCount(0);
    await expect(req).toHaveText('Ninguno');
    // Duplicar la fila 1 y quitar la vacía: quedan 2 envíos listos.
    await fila1.locator('.varios-dup').click();
    await expect(filas).toHaveCount(3);
    await expect(filas.nth(1).locator('.varios-importe')).toContainText('€', { timeout: 15000 });
    await filas.nth(2).locator('.varios-quitar').click();
    await expect(filas).toHaveCount(2);
    await expect(page.locator('#varios-total')).toContainText('2 envíos listos');
    // La proforma de precios sale en PDF.
    const [resp] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/panel/nuevo-envio/varios/proforma')),
      page.locator('#varios-proforma').click(),
    ]);
    expect(resp.status()).toBe(200);
    expect(resp.headers()['content-type']).toContain('application/pdf');
    // Crear los dos de golpe, con la aceptación de las condiciones.
    const antes = (await bd().from('envios').select('id', { count: 'exact', head: true })).count ?? 0;
    await page.locator('#varios-crear').click();
    // Sin la casilla: no crea nada y avisa de qué falta.
    await page.locator('.varios-conf-check input').uncheck();
    await page.locator('#varios-confirmar').click();
    await expect(page.locator('#varios-falta-acepta')).toContainText('Marca la casilla');
    await page.locator('.varios-conf-check input').check();
    await expect(page.locator('#varios-falta-acepta')).toHaveCount(0);
    await page.locator('#varios-confirmar').click();
    await expect(page.locator('#varios-creados')).toContainText('¡2 envíos creados!', { timeout: 30000 });
    expect((await bd().from('envios').select('id', { count: 'exact', head: true })).count).toBe(antes + 2);
    // Con todos creados queda solo el mensaje: ni la tabla ni sus botones.
    await expect(page.locator('#varios-tabla')).toHaveCount(0);
    await expect(page.locator('#varios-ver-envios')).toBeVisible();
    // «Crear otros envíos» vuelve a la tabla vacía. Tope de 20 filas por subida.
    await page.locator('#varios-otra-vez').click();
    await expect(filas).toHaveCount(2);
    for (let i = 0; i < 18; i++) await page.locator('#varios-anadir').click();
    await expect(filas).toHaveCount(20);
    await expect(page.locator('#varios-anadir')).toBeDisabled();
  });

  // Consultas de precio (usuario, 2026-11-21): solo cuentan al llegar al paso 3 «Fecha y
  // precio», que es donde el cliente ve el precio; quedarse en los pasos 1 o 2 no cuenta.
  test('consulta de precio: no cuenta en los pasos 1 y 2, sí al llegar al 3', async ({ page }) => {
    await entrar(page, 'cliente');
    const cuantas = async () => (await bd().from('consultas_precio').select('id', { count: 'exact', head: true }).eq('origen', 'tarifador')).count ?? 0;
    const antes = await cuantas();
    await page.goto('/panel/nuevo-envio');
    const sitio = page.locator('.ptar-route-row input[type=text]');
    await sitio.nth(0).fill('Sevilla'); await page.locator('.ptar-sug li').first().click();
    await sitio.nth(1).fill('Madrid'); await page.locator('.ptar-sug li').first().click();
    await page.getByRole('button', { name: /Siguiente/ }).click();
    await expect(page.locator('.ptar-stepper, .ptar-pasos, body').first()).toContainText('Mercancía');
    await page.waitForTimeout(1500);
    expect(await cuantas()).toBe(antes);
    await page.getByRole('button', { name: /Siguiente/ }).click();
    await expect.poll(cuantas, { timeout: 10000 }).toBe(antes + 1);
  });

  // Calendario de envíos (usuario, 2026-11-21): el primer clic en una fichita abre un mini
  // resumen (recogida, entrega, mercancía, fecha o ventana) con «Abrir detalle» y «Cerrar».
  test('calendario: la fichita abre un mini resumen y, desde él, el detalle del envío', async ({ page }) => {
    await entrar(page, 'cliente');
    await crearEnvioDeCliente(page);
    const { data: e } = await bd().from('envios').select('id, referencia_gx, fecha_carga_desde, fecha_carga_real, fecha_carga_prevista')
      .eq('id', (await ultimoEnvio()).id).single();
    const dia = e!.fecha_carga_real || e!.fecha_carga_prevista || e!.fecha_carga_desde!;
    await entrar(page, 'dynamo');
    await page.goto(`/panel/envios?vista=calendario&mes=${dia.slice(0, 7)}`);
    await page.locator(`.cal-envio[title^="#${e!.referencia_gx} "]`).first().click();
    const res = page.locator('#cal-resumen');
    await expect(res).toBeVisible();
    await expect(page.getByText(`Envío #${e!.referencia_gx}`)).toBeVisible();
    await expect(res).toContainText('Recogida');
    await expect(res).toContainText('Entrega');
    await expect(res).toContainText(/Fecha de recogida|Ventana de recogida/);
    // Cerrar: no navega.
    await page.locator('#cal-res-cerrar').click();
    await expect(res).toHaveCount(0);
    await expect(page).not.toHaveURL(/ver=/);
    // Abrir detalle: la ficha del envío.
    await page.locator(`.cal-envio[title^="#${e!.referencia_gx} "]`).first().click();
    await page.locator('#cal-res-abrir').click();
    await expect(page).toHaveURL(new RegExp(`ver=${e!.id}`));
  });

  // Dashboard del cliente (usuario, 2026-11-21): «Mis envíos» solo enseña los programados,
  // los de fecha de carga más cercana primero.
  test('dashboard del cliente: «Mis envíos programados» solo lista programados', async ({ page }) => {
    await entrar(page, 'cliente');
    await page.goto('/panel/dashboard');
    const caja = page.locator('.mini-list-card');
    await expect(caja.locator('h4')).toContainText('Mis envíos programados');
    // El estado se pinta como en la lista de Envíos (usuario, 2026-11-26): un programado puede
    // verse «Confirmado» (con camión), «Asignando transportista» o «Pendiente de pago».
    const etiquetas = caja.locator('.mini-list .badge');
    for (const t of await etiquetas.allTextContents()) expect(['Programado', 'Confirmado', 'Asignando transportista', 'Pendiente de pago']).toContain(t.trim());
  });

  // Parámetros (usuario, 2026-11-19): el PIN de recogida y entrega queda para la v4 y los
  // campos del fichero de Holded se quitan; en su sección, un aviso de «pendiente de la API».
  test('parámetros: no salen el PIN ni los campos de Holded, y Holded avisa de que falta la API', async ({ page }) => {
    await entrar(page, 'dynamo');
    await page.goto('/panel/parametros');
    await expect(page.locator('#prm-holded-pendiente')).toContainText('Pendiente de conectar con Holded por API');
    const cuerpo = page.locator('#sec-parametros, main').first();
    await expect(cuerpo).not.toContainText('PIN de recogida y entrega');
    await expect(cuerpo).not.toContainText('pin_cifras');
    await expect(cuerpo).not.toContainText('holded_canal_venta_cuenta');
    await expect(cuerpo).not.toContainText('holded_formato_numeracion_compra');
    // Tampoco los km por defecto entre paradas (se quedan por dentro, con su valor).
    await expect(cuerpo).not.toContainText('seguimiento_km_por_defecto');
    await expect(cuerpo).toContainText('seguimiento_velocidad_kmh');
  });

  test('registro con un dominio vetado: «la plataforma no está operativa», sin revelar el bloqueo', async ({ page }) => {
    await bd().from('bloqueos_alta').upsert({ tipo: 'dominio', valor: 'vetado-e2e.test', motivo: 'prueba e2e' }, { onConflict: 'tipo,valor', ignoreDuplicates: true });
    await page.goto('/panel/registro');
    await page.fill('#reg-email', 'alguien@vetado-e2e.test');
    await page.fill('#reg-nombre', 'Persona Vetada');
    await page.fill('#reg-dni', '12345678Z');
    await page.fill('#reg-tel', '611222333');
    await page.locator('input[name=acepto]').check();
    await page.getByRole('button', { name: 'Continuar' }).click();
    await expect(page.getByText('La plataforma no está operativa en este momento')).toBeVisible();
    await expect(page.locator('main, body').first()).not.toContainText('bloque');
  });

  test('tarifador de la web pública: precio con 3 cálculos al día por IP y, después, «Crear cuenta»', async ({ page }) => {
    const sb = bd();
    await sb.from('parametros').update({ valor: true }).eq('clave', 'tarifador_web_con_precio');
    await sb.from('parametros').update({ valor: 3 }).eq('clave', 'tarifador_web_max_ip_dia');
    await sb.from('consultas_precio_web').delete().gte('id', 0);
    const rellenar = async () => {
      await page.goto('/');
      const card = page.locator('#tarifador-card');
      if (!(await card.locator('[data-ptar-orig]').isVisible())) {
        // En la portada el tarifador se abre con el botón «Precios».
        const abrir = page.getByRole('button', { name: /^(Precios|Calcular tarifa)$/i });
        if (await abrir.count()) await abrir.first().click();
      }
      await card.locator('[data-ptar-orig]').fill('Sevilla');
      await card.locator('[data-ptar-dest]').fill('Madrid');
      await page.keyboard.press('Escape');
      for (let i = 0; i < 2; i++) {
        const sig = page.locator('[data-wiz-next]');
        if (await sig.isVisible()) await sig.click();
      }
      await page.locator('#tar-cta').click();
    };
    try {
      await rellenar();
      await expect(page.locator('#tar-precio-num')).toContainText('€');
      await expect(page.locator('#tar-precio')).toContainText('Te quedan 2 cálculos de precio hoy');
      await page.locator('#tar-precio-otra').click();
      await expect(page.locator('#tar-precio')).toContainText('Te queda 1 cálculo de precio hoy');
      await page.locator('#tar-precio-otra').click();
      await expect(page.locator('#tar-precio')).toContainText('Era tu último cálculo de precio de hoy');
      // El cuarto del día: sin precio, el botón de crear cuenta (y el email / WhatsApp siguen).
      await rellenar();
      await expect(page.locator('#tar-precio-registro')).toHaveAttribute('href', '/panel/registro');
      await expect(page.locator('#tar-precio')).toContainText('tarifas ilimitadas*');
      await expect(page.locator('#tar-precio-num')).toHaveCount(0);
      await expect(page.locator('#tar-cta-wa')).toBeVisible();
    } finally {
      await sb.from('parametros').update({ valor: false }).eq('clave', 'tarifador_web_con_precio');
      await sb.from('consultas_precio_web').delete().gte('id', 0);
    }
  });

  // Desde el 2026-11-20 las direcciones se ven siempre (usuario: «ocultar direcciones, mejor no»):
  // sin matrículas queda el aviso rojo del DeCA y no hay eCMR.
  test('transportista sin matrículas: direcciones a la vista, aviso del DeCA y sin eCMR; con ellas, eCMR', async ({ page }) => {
    const sb = bd();
    const { e } = await envioProgramadoDelTransportista('id, matricula_camion, matricula_remolque');
    await sb.from('envios').update({ matricula_camion: null, matricula_remolque: null }).eq('id', e!.id);
    try {
      await entrar(page, 'transportista');
      await page.goto(`/panel/envios?ver=${e!.id}`);
      await expect(page.locator('#aviso-deca-matriculas')).toContainText('MATRÍCULAS');
      await expect(page.locator('#aviso-deca-matriculas')).toContainText('FOM/2861/2012');
      await expect(page.getByRole('button', { name: /CMR digital para firmar/ })).toHaveCount(0);
      await expect(page.locator('main, body').first()).not.toContainText('********');
      await sb.from('envios').update({ matricula_camion: '5678CDF', matricula_remolque: 'R5678CDF' }).eq('id', e!.id);
      await page.goto(`/panel/envios?ver=${e!.id}`);
      await expect(page.getByRole('button', { name: /CMR digital para firmar/ })).toBeVisible();
      await expect(page.locator('#aviso-deca-matriculas')).toHaveCount(0);
    } finally {
      await sb.from('envios').update({ matricula_camion: e!.matricula_camion, matricula_remolque: e!.matricula_remolque }).eq('id', e!.id);
    }
  });

  test('página «Proporcionar matrículas»: resumen con CP, aviso del DeCA, guarda y desaparece el aviso', async ({ page }) => {
    const sb = bd();
    const { t, e } = await envioProgramadoDelTransportista('id, matricula_camion, matricula_remolque, conductor_nombre, conductor_telefono, fecha_carga_prevista, fecha_carga_desde');
    await sb.from('envios').update({ matricula_camion: null, matricula_remolque: null }).eq('id', e!.id);
    let { data: enl } = await sb.from('cmr_enlaces').select('token').eq('envio_id', e!.id).eq('revocado', false).gt('caduca_en', new Date().toISOString()).maybeSingle();
    if (!enl) ({ data: enl } = await sb.from('cmr_enlaces').insert({ envio_id: e!.id }).select('token').single());
    try {
      // Con una clave ajena: enlace no válido.
      await page.goto(`/matriculas/${enl!.token}?clave=00000000-0000-4000-8000-000000000000`);
      await expect(page.locator('#matr-parar')).toContainText('no es válido');
      await page.goto(`/matriculas/${enl!.token}?clave=${t!.id}`);
      await expect(page.locator('#aviso-deca-matriculas')).toBeVisible();
      await expect(page.locator('#matr-resumen')).toContainText('CP ');
      await expect(page.locator('#matr-resumen')).not.toContainText('********');
      await page.locator('#mt-camion').fill('2903 BCD');
      await page.locator('#mt-remolque').fill('R2903BCD');
      await page.locator('#mt-chofer').fill('Conductor Matrículas');
      // Móvil con WhatsApp en toda la plataforma (usuario, 2026-11-26): con un fijo no se guarda.
      await expect(page.locator('label[for=mt-tfno]')).toContainText('Móvil del conductor (WhatsApp)');
      await page.locator('#mt-tfno').fill('955225945');
      if (await page.locator('#mt-dia').count()) await page.locator('#mt-dia').selectOption({ index: 1 });
      await page.locator('#mt-guardar').click();
      await expect(page.locator('#mt-resultado')).toContainText('tiene que ser un móvil (con WhatsApp)');
      await page.locator('#mt-tfno').fill('600290390');
      await page.locator('#mt-guardar').click();
      await expect(page.locator('#mt-resultado')).toContainText('orden de carga COMPLETA');
      await expect(page.locator('#aviso-deca-matriculas')).toHaveCount(0);
      const { data: x } = await sb.from('envios').select('matricula_camion, matricula_remolque, conductor_nombre').eq('id', e!.id).single();
      expect(x).toEqual({ matricula_camion: '2903BCD', matricula_remolque: 'R2903BCD', conductor_nombre: 'Conductor Matrículas' });
    } finally {
      await sb.from('envios').update({ matricula_camion: e!.matricula_camion, matricula_remolque: e!.matricula_remolque,
        conductor_nombre: e!.conductor_nombre, conductor_telefono: e!.conductor_telefono, fecha_carga_prevista: e!.fecha_carga_prevista }).eq('id', e!.id);
    }
  });

  test('CMR: 3 días después de la entrega la hoja de firmas solo deja ver y descargar', async ({ page }) => {
    const sb = bd();
    const { e } = await envioProgramadoDelTransportista('id');
    let { data: enl } = await sb.from('cmr_enlaces').select('token').eq('envio_id', e!.id).eq('revocado', false).gt('caduca_en', new Date().toISOString()).maybeSingle();
    if (!enl) ({ data: enl } = await sb.from('cmr_enlaces').insert({ envio_id: e!.id }).select('token').single());
    // La hora de entrega la protege la base de datos: se fecha a mano, sin disparadores.
    const sql = (q: string) => execFileSync('psql', [process.env.DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres', '-v', 'ON_ERROR_STOP=1', '-q', '-c',
      `alter table envios disable trigger user; ${q}; alter table envios enable trigger user;`]);
    sql(`update envios set estado = 'entregado', entregado_en = now() - interval '5 days' where id = '${e!.id}'`);
    try {
      await page.goto(`/cmr/${enl!.token}`);
      await expect(page.locator('[data-firma-cerrada]')).toContainText('El plazo para firmar este CMR se cerró');
      await expect(page.locator('[data-firma-cerrada] a')).toHaveAttribute('href', `/cmr/${enl!.token}/pdf`);
      await expect(page.getByRole('button', { name: 'Firmar', exact: true })).toHaveCount(0);
      await expect(page.getByRole('button', { name: '+ Añadir' })).toHaveCount(0);
      // Entregado hoy: se puede firmar, con el plazo a la vista.
      sql(`update envios set entregado_en = now() where id = '${e!.id}'`);
      await page.reload();
      await expect(page.locator('[data-firma-cerrada]')).toHaveCount(0);
      await expect(page.getByText(/Envío entregado: se puede firmar hasta el/)).toBeVisible();
    } finally {
      sql(`update envios set estado = 'programado', entregado_en = null where id = '${e!.id}'`);
    }
  });

  test('«Ver todas las cargas de vuelta»: solo con el enlace bueno', async ({ page }) => {
    const sb = bd();
    const { t, e } = await envioProgramadoDelTransportista();
    let { data: enl } = await sb.from('cmr_enlaces').select('token').eq('envio_id', e!.id).eq('revocado', false).gt('caduca_en', new Date().toISOString()).maybeSingle();
    if (!enl) ({ data: enl } = await sb.from('cmr_enlaces').insert({ envio_id: e!.id }).select('token').single());
    await page.goto(`/cargas-de-vuelta/${enl!.token}?clave=00000000-0000-4000-8000-000000000000&tramo=descarga&tipo=completa`);
    await expect(page.locator('#vuelta-parar')).toContainText('no es válido');
    await page.goto(`/cargas-de-vuelta/${enl!.token}?clave=${t!.id}&tramo=descarga&tipo=completa`);
    await expect(page.locator('#vuelta-pagina')).toContainText('Para tu envío #');
    await expect(page.locator('#vuelta-lista, #vuelta-vacia')).toHaveCount(1);
    // Selector Completas / Grupajes (2026-11-20): marcado según el botón del email y se cambia.
    await expect(page.locator('#vuelta-tipos a.activo')).toHaveText('Cargas completas');
    await page.locator('#vuelta-tipos').getByRole('link', { name: 'Grupajes' }).click();
    await expect(page.locator('#vuelta-tipos a.activo')).toHaveText('Grupajes');
    await expect(page.locator('#vuelta-lista, #vuelta-vacia')).toHaveCount(1);
  });

  test('ningún sitio queda marcado «sin medios de carga» sin que nadie lo ponga', async () => {
    const { count, error } = await bd().from('sitios').select('id', { count: 'exact', head: true }).eq('tiene_medios_carga', false);
    expect(error).toBeNull();
    expect(count).toBe(0);
  });

  // Transportistas que nos dejan tirados (usuario, 2026-11-20): al quitarlo se pregunta el
  // motivo; «nos deja tirados» queda anotado y cuenta para sus límites.
  test('quitar transportista «nos deja tirados»: pregunta el motivo y queda anotado', async ({ page }) => {
    const sb = bd();
    const { t, e } = await envioProgramadoDelTransportista('id, transportista_id, importe_transportista, matricula_camion, matricula_remolque, conductor_nombre, conductor_telefono, fecha_carga_prevista');
    try {
      await entrar(page, 'dynamo');
      await page.goto(`/panel/envios?ver=${e.id}`);
      const secSeg = page.getByRole('button', { name: /Envío y seguimiento/ }).first();
      if ((await secSeg.getAttribute('aria-expanded')) !== 'true') await secSeg.click();
      await page.locator('.dash-modal-body').getByRole('button', { name: /Editar \/ Cambiar transportista/ }).click();
      await page.getByRole('button', { name: 'Quitar transportista' }).click();
      await expect(page.locator('#as-quitar')).toBeVisible();
      await page.getByRole('button', { name: 'Nos deja tirados (cancela él)' }).click();
      await expect(page.getByText(/Cancelación anotada|SUSPENDIDO/)).toBeVisible();
      const { data: c } = await sb.from('transportista_cancelaciones').select('envio_id').eq('transportista_id', t.id);
      expect((c ?? []).map((x) => x.envio_id)).toContain(e.id);
    } finally {
      await sb.from('transportista_cancelaciones').delete().eq('transportista_id', t.id);
      await sb.from('transportistas').update({ estado_operativo: 'activo' }).eq('id', t.id);
      await sb.from('envios').update({ transportista_id: t.id, importe_transportista: e.importe_transportista, matricula_camion: e.matricula_camion,
        matricula_remolque: e.matricula_remolque, conductor_nombre: e.conductor_nombre, conductor_telefono: e.conductor_telefono,
        fecha_carga_prevista: e.fecha_carga_prevista }).eq('id', e.id);
    }
  });
  // Control de facturación (usuario, 2026-11-20): ningún envío entregado sin cobrar. Una compra
  // pasada a Holded sin su venta sale en rojo, con el enlace a la ficha.
  test('control de facturación: una compra pasada sin su venta sale como grave', async ({ page }) => {
    const sb = bd();
    // Un envío de Dynamo con precio y transportista (no hace falta que esté entregado: la compra
    // pasada sin su venta sale en cualquier estado).
    const { e } = await envioProgramadoDelTransportista('id, referencia_gx, importe_cliente, holded_pedido_venta, holded_venta_total, holded_pedido_compra, holded_compra_total');
    expect(Number(e.importe_cliente)).toBeGreaterThan(0);
    try {
      await sb.from('envios').update({ holded_pedido_venta: null, holded_venta_total: null, holded_pedido_compra: e.referencia_gx, holded_compra_total: 0 }).eq('id', e.id);
      await entrar(page, 'dynamo');
      await page.goto('/panel/exportaciones');
      await page.locator('#export-control').click();
      await expect(page.locator('#cuadre-meses')).toBeVisible();
      await page.locator('#control-tipos [data-tipo="compra_sin_venta"]').click();
      const fila = page.locator('#control-lista tr[data-tipo="compra_sin_venta"]', { hasText: `#${e.referencia_gx}` });
      await expect(fila).toBeVisible();
      await expect(fila.getByText('Grave')).toBeVisible();
      await expect(fila.getByRole('link', { name: `#${e.referencia_gx}` })).toHaveAttribute('href', `/panel/envios?ver=${e.id}`);
      // El enlace del email del lunes abre directamente el control.
      await page.goto('/panel/exportaciones?ver=cuadre');
      await expect(page.locator('#control-lista, #control-todo-ok').first()).toBeVisible();
    } finally {
      await sb.from('envios').update({ holded_pedido_venta: e.holded_pedido_venta, holded_venta_total: e.holded_venta_total,
        holded_pedido_compra: e.holded_pedido_compra, holded_compra_total: e.holded_compra_total }).eq('id', e.id);
    }
  });
  // Aviso de entrada desde un dispositivo nuevo (usuario, 2026-11-20): al entrar alguien del
  // equipo desde un navegador nuevo le llega el email con «No he sido yo»; pulsarlo (sin sesión,
  // desde el enlace) cierra TODAS sus sesiones, también la que tenía abierta en otro navegador.
  test('dispositivo nuevo: email con «No he sido yo», que cierra todas las sesiones', async ({ page, browser }) => {
    const sb = bd();
    await entrar(page, 'dynamo');
    const { data: u } = await sb.from('usuarios').select('id').eq('email', EMAIL.dynamo).single();
    const { data: d } = await sb.from('usuarios_dispositivos').select('id, token_alerta').eq('usuario_id', u!.id)
      .order('primer_acceso', { ascending: false }).limit(1).single();
    expect(d).toBeTruthy();
    const { data: em } = await sb.from('emails_enviados').select('cuerpo_html').eq('clave', `acceso_nuevo:${d!.id}`).single();
    expect(em!.cuerpo_html).toContain(`/panel/no-he-sido-yo/${d!.token_alerta}`);

    // Desde otro navegador, sin sesión: abrir el enlace no hace nada; el botón, sí.
    const otro = await browser.newContext();
    const p2 = await otro.newPage();
    await p2.goto(`/panel/no-he-sido-yo/${d!.token_alerta}`);
    await expect(p2.locator('#no-he-sido-yo-boton')).toBeVisible();
    await p2.locator('#no-he-sido-yo-boton').click();
    await expect(p2.locator('#no-he-sido-yo-hecho')).toContainText('Hemos cerrado todas las sesiones');
    await otro.close();

    // La sesión que estaba abierta se ha cerrado.
    await page.goto('/panel/envios');
    await expect(page).toHaveURL(/\/panel\/entrar/);
  });
  // El cuadro del doble paso del equipo en Usuarios se quitó (usuario, 2026-11-25: «no hace falta
  // verlo ya»; el interruptor obliga a todos a darlo de alta al entrar).
  test('Usuarios: ya no sale el cuadro del doble paso del equipo', async ({ page }) => {
    await entrar(page, 'dynamo');
    await page.goto('/panel/usuarios');
    await expect(page.locator('#sec-usuarios, .section.active').first()).toBeVisible();
    await expect(page.locator('#doble-paso-equipo')).toHaveCount(0);
  });
  // Nota automática del transportista (usuario, 2026-11-20): en su ficha, con sus piezas.
  test('ficha del transportista: nota automática de 0 a 10 con sus piezas', async ({ page }) => {
    const sb = bd();
    const { data: t } = await sb.from('transportistas').select('id').eq('cif', CIF_TRANSPORTISTA).single();
    const nota = { transportista_id: t!.id, nota: 8.4, envios: 12, puntuales: 11, con_fechas: 12, cancelaciones: 0, con_incidencia: 1,
      valoracion: 4.5, valoraciones: 4 };
    await sb.from('transportista_notas').upsert(nota);
    await entrar(page, 'dynamo');
    await page.goto(`/panel/transportistas?ver=${t!.id}`);
    const n = page.locator('#tra-nota');
    await expect(n).toContainText('8,4');
    await expect(n).toContainText('Puntualidad: 11 de 12');
    await expect(n).toContainText('Envíos con incidencia: 1 de 12');
  });

  test('crédito del cliente: sin crédito por CESCE o en trámite manda a CESCE con su teléfono; si el 0 es de Dynamo, a Dynamo', async ({ page }) => {
    const sv = bd();
    const { data: u } = await sv.from('usuarios').select('cliente_id').eq('email', EMAIL.cliente).single();
    const { data: c } = await sv.from('clientes').select('riesgo_manual_euros, riesgo_cesce_euros').eq('id', u!.cliente_id).single();
    const menu = page.locator('.cesce-menu');
    const abrir = async () => { await page.goto('/panel/envios'); await page.getByRole('button', { name: 'Cobertura de crédito CESCE' }).click(); await expect(menu).toHaveClass(/open/); };
    try {
      await entrar(page, 'cliente');
      // CESCE no le da crédito (y Dynamo no ha puesto nada a mano): se dice que es por CESCE y se da su teléfono.
      await sv.from('clientes').update({ riesgo_manual_euros: null, riesgo_cesce_euros: 0 }).eq('id', u!.cliente_id);
      await abrir();
      await expect(menu).toContainText('Crédito no disponible');
      await expect(menu).toContainText('no tiene crédito disponible por CESCE');
      await expect(menu).toContainText('Contacta con CESCE y lo revisan');
      await expect(menu.locator('a[href="tel:+34900115000"]')).toContainText('+34 900 115 000');
      await expect(menu).not.toContainText('955 225 945');
      // Aún sin clasificar: en trámite, y las dudas, a CESCE. Ya no hay botón de «Reclamar clasificación».
      await sv.from('clientes').update({ riesgo_manual_euros: null, riesgo_cesce_euros: null }).eq('id', u!.cliente_id);
      await abrir();
      await expect(menu).toContainText('Sin clasificar');
      await expect(menu).toContainText('aún en trámite por CESCE');
      await expect(menu).toContainText('Para dudas o consultas con CESCE, llama');
      await expect(menu.locator('a[href="tel:+34900115000"]')).toBeVisible();
      await expect(menu).not.toContainText('Reclamar clasificación');
      // El 0 lo ha puesto Dynamo a mano (CESCE sí le da): no se le manda a CESCE.
      await sv.from('clientes').update({ riesgo_manual_euros: 0, riesgo_cesce_euros: 5000 }).eq('id', u!.cliente_id);
      await abrir();
      await expect(menu).toContainText('Crédito no disponible');
      await expect(menu).not.toContainText('por CESCE:');
      await expect(menu).toContainText('Contáctanos y lo revisamos');
      await expect(menu.locator('a[href="tel:+34900115000"]')).toHaveCount(0);
    } finally {
      await sv.from('clientes').update({ riesgo_manual_euros: c!.riesgo_manual_euros, riesgo_cesce_euros: c!.riesgo_cesce_euros }).eq('id', u!.cliente_id);
    }
  });

  test('CESCE - Riesgos: lo que debe cada cliente según la copia de facturas emitidas (manda el importe pendiente)', async ({ page }) => {
    const sv = bd();
    const { data: u } = await sv.from('usuarios').select('cliente_id').eq('email', EMAIL.cliente).single();
    const hoy = new Date();
    const dia = (n: number) => new Date(hoy.getTime() + n * 86400000).toISOString().slice(0, 10);
    // La copia la guarda el servidor (aquí, a mano con la clave de servicio): tres facturas del
    // cliente de pruebas (una vencida, una cobrada en parte y una pagada que no cuenta) y una
    // de un contacto que no es cliente de la plataforma.
    await sv.from('facturas_emitidas').delete().like('ref_externa', 'e2e-deuda-%');
    const { error: e0 } = await sv.from('facturas_emitidas').insert([
      { ref_externa: 'e2e-deuda-1', cliente_id: u!.cliente_id, numero: 'F-E2E-1', fecha_emision: dia(-40), fecha_vencimiento: dia(-10), total: 1210, pendiente: 1210, estado: 'pendiente' },
      { ref_externa: 'e2e-deuda-2', cliente_id: u!.cliente_id, numero: 'F-E2E-2', fecha_emision: dia(-5), fecha_vencimiento: dia(25), total: 605, pendiente: 300.5, estado: 'parcial' },
      { ref_externa: 'e2e-deuda-3', cliente_id: null, contacto_nombre: 'No es cliente', cif: 'B99999999', numero: 'F-E2E-3', fecha_emision: dia(-5), fecha_vencimiento: dia(5), total: 50, pendiente: 50, estado: 'pendiente' },
      { ref_externa: 'e2e-deuda-4', cliente_id: u!.cliente_id, numero: 'F-E2E-4', fecha_emision: dia(-60), fecha_vencimiento: dia(-30), total: 999, pendiente: 0, estado: 'pagada', pagada_el: dia(-31) },
    ]);
    expect(e0).toBeNull();
    await sv.from('facturas_copia_estado').update({ ultima_en: hoy.toISOString(), ultima_ok_en: hoy.toISOString(), error: null, carga_completa_en: hoy.toISOString() }).eq('id', true);
    try {
      await entrar(page, 'dynamo');
      await page.goto('/panel/riesgos');
      const caja = page.locator('#deuda-facturacion');
      await expect(caja.locator('#deuda-total')).toContainText('1.560,50');
      await expect(caja).toContainText('en 3 facturas');
      await expect(caja).toContainText(/vencido:\s*1\.210,00/);
      await expect(caja.locator('#deuda-cuando')).toContainText(/Leído (ahora|hace)/);
      await expect(caja.locator('#deuda-otros')).toContainText('50,00');
      const celda = page.locator(`[data-deuda="${u!.cliente_id}"]`);
      await expect(celda).toContainText('1.510,50');
      await expect(celda).toContainText('2 facturas');
      await expect(celda).toContainText('vencido 1.210,00');
      // EL CRÉDITO USADO SALE DE LA DEUDA REAL (usuario, 2026-11-26): lo que debe de verdad más
      // sus envíos a crédito aún sin facturar; ya no la estimación de «envíos de los últimos 60 días».
      await expect(page.locator('#th-usado')).toHaveText('Usado (IVA incl.)');
      await expect(page.locator('#riesgo-usado-titulo')).toContainText('Crédito usado');
      await expect(page.locator('#sec-riesgos')).toContainText('lo que debe de verdad');
      await expect(page.locator(`[data-usado="${u!.cliente_id}"]`)).toContainText(/sin facturar \+ 1\.510,50\s*€ que debe/);
      const { data: uso } = await sv.rpc('credito_usado_de', { p_clientes: [u!.cliente_id] });
      const fila = (uso as { deuda: number; sin_facturar: number; usado: number }[])[0];
      expect(Number(fila.deuda)).toBe(1510.5);
      expect(Number(fila.usado)).toBeCloseTo(1510.5 + Number(fila.sin_facturar), 2);
      // El cliente no lee la tabla ni lo que deben los clientes; sus facturas, solo por la lista.
      const c = await como('cliente');
      const { data: suyas } = await c.from('facturas_emitidas').select('ref_externa');
      expect(suyas ?? []).toHaveLength(0);
      const { error } = await c.rpc('deuda_clientes', { p_clientes: [u!.cliente_id] });
      expect(error).not.toBeNull();
      expect((await c.rpc('credito_usado_de', { p_clientes: [u!.cliente_id] })).error).not.toBeNull();
      const { data: lista } = await c.rpc('facturas_lista', { p_q: 'F-E2E' });
      expect((lista as { total: number }).total).toBe(3);
    } finally {
      await sv.from('facturas_emitidas').delete().like('ref_externa', 'e2e-deuda-%');
      await sv.from('facturas_copia_estado').update({ ultima_en: null, ultima_ok_en: null, error: null, carga_completa_en: null }).eq('id', true);
    }
  });

  test('Administración → Facturas: Dynamo ve todas las emitidas (solo lectura) y el cliente, solo las suyas, con su estado de pago', async ({ page }) => {
    const sv = bd();
    const { data: u } = await sv.from('usuarios').select('cliente_id').eq('email', EMAIL.cliente).single();
    const hoy = new Date();
    const dia = (n: number) => new Date(hoy.getTime() + n * 86400000).toISOString().slice(0, 10);
    const AJENA = 'e2efac0000000000000000a1'.replace(/[^0-9a-f]/g, '0'), SUYA = 'e2efac0000000000000000b2'.replace(/[^0-9a-f]/g, '0');
    const CUENTA = 'e2e0000000000000000000c1'.replace(/[^0-9a-f]/g, '0'), MES = `${new Date().toISOString().slice(0, 7)}-01`;
    const ABONO = 'e2eab00000000000000000d3';
    await sv.from('holded_cuentas').upsert({ cuenta_id: CUENTA, numero: '70500000', nombre: 'Prestaciones de servicios' });
    await sv.from('holded_uso').upsert({ mes: MES, consultas: 40, real: 8565, limite: 30000, real_en: new Date().toISOString() });
    await sv.from('facturas_emitidas').delete().like('numero', 'FAC-E2E-%');
    await sv.from('facturas_emitidas').delete().like('numero', 'ABO-E2E-%');
    const { error: e0 } = await sv.from('facturas_emitidas').insert([
      { ref_externa: 'e2e-fac-1', cliente_id: u!.cliente_id, contacto_nombre: 'Cliente de pruebas', cif: 'B11111111', numero: 'FAC-E2E-1', fecha_emision: dia(-40), fecha_vencimiento: dia(-10), base: 1000, iva: 210, total: 1210, pendiente: 1210, estado: 'pendiente', cuenta: CUENTA },
      { ref_externa: 'e2e-fac-2', cliente_id: u!.cliente_id, contacto_nombre: 'Cliente de pruebas', cif: 'B11111111', numero: 'FAC-E2E-2', fecha_emision: dia(-5), fecha_vencimiento: dia(25), base: 500, iva: 105, total: 605, pendiente: 300.5, estado: 'parcial' },
      { ref_externa: SUYA, cliente_id: u!.cliente_id, contacto_nombre: 'Cliente de pruebas', cif: 'B11111111', numero: 'FAC-E2E-3', fecha_emision: dia(-60), fecha_vencimiento: dia(-30), base: 100, iva: 21, total: 121, pendiente: 0, estado: 'pagada', pagada_el: dia(-25) },
      { ref_externa: 'e2e-fac-4', cliente_id: u!.cliente_id, contacto_nombre: 'Cliente de pruebas', cif: 'B11111111', numero: 'FAC-E2E-4', fecha_emision: dia(-3), fecha_vencimiento: dia(27), base: 10, iva: 2.1, total: 12.1, pendiente: 0, estado: 'anulada' },
      { ref_externa: AJENA, cliente_id: null, contacto_nombre: 'Ajena No Cliente SL', cif: 'B99999998', numero: 'FAC-E2E-5', fecha_emision: dia(-2), fecha_vencimiento: dia(28), base: 50, iva: 10.5, total: 60.5, pendiente: 60.5, estado: 'pendiente' },
    ]);
    expect(e0).toBeNull();
    // Un abono (factura rectificativa) del cliente, aún sin compensar: en negativo. (Aparte: al
    // insertar varias filas juntas, las columnas que una no trae van a nulo, no a su valor por defecto.)
    const { error: e1 } = await sv.from('facturas_emitidas').insert([
      { ref_externa: ABONO, cliente_id: u!.cliente_id, contacto_nombre: 'Cliente de pruebas', cif: 'B11111111', numero: 'ABO-E2E-1', tipo: 'abono', rectifica: SUYA, fecha_emision: dia(-90), fecha_vencimiento: dia(-90), base: -100, iva: -21, total: -121, pendiente: -121, estado: 'pendiente' },
    ]);
    expect(e1).toBeNull();
    try {
      await entrar(page, 'dynamo');
      await page.goto('/panel/administracion');
      await page.locator('#sec-facturas .tabs').getByRole('button', { name: 'Facturas' }).click();
      const f = page.locator('#facturas');
      await expect(f).toContainText('Solo lectura');
      await expect(f.locator('#facturas-nota')).toContainText('Copia de las facturas emitidas');
      await expect(page.locator('#facturas-lista thead')).toContainText(/Fecha.*Nº factura.*CIF · Empresa.*Base.*IVA.*Retención.*Total.*Pago.*Cuenta contable/);
      // Las recibidas ya no se enseñan (usuario, 2026-11-25): no hay filtro de ingresos y gastos.
      await expect(page.locator('#fac-tipo')).toHaveCount(0);
      await page.fill('#fac-buscar', 'FAC-E2E');
      await expect(page.locator('#facturas-lista tbody tr')).toHaveCount(5);
      // La cuenta contable sale con su nombre y su número, no con su identificador interno.
      await expect(page.locator('#facturas-lista tbody tr', { hasText: 'FAC-E2E-1' }).locator('.fac-cuenta')).toHaveText(/Prestaciones de servicios\s*70500000/);
      // El contador de consultas a la facturación de este mes, con su barra y su renovación.
      await expect(page.locator('#facturas-uso')).toContainText(/Consultas:\s*8\.565\s*\/\s*30\.000/);
      await expect(page.locator('#facturas-uso')).toContainText(/29 %.*Se renueva el/);
      await expect(page.locator('#facturas-uso [role=progressbar]')).toBeVisible();
      await expect(f.locator('#facturas-totales')).toContainText(/Por cobrar:\s*1\.571,00/);
      await expect(f.locator('#facturas-totales')).toContainText(/vencido:\s*1\.210,00/);
      const parcial = page.locator('#facturas-lista tbody tr', { hasText: 'FAC-E2E-2' });
      await expect(parcial).toContainText('Pendiente');
      await expect(parcial).toContainText('faltan 300,50');
      await expect(page.locator('#facturas-lista tbody tr', { hasText: 'FAC-E2E-1' })).toContainText('Vencida');
      await expect(page.locator('#facturas-lista tbody tr', { hasText: 'FAC-E2E-3' })).toContainText(/Pagada.*a los 35 días.*5 días tarde/s);
      // La fecha del cobro va al lado de la etiqueta «Pagada» (usuario, 2026-11-26).
      await expect(page.locator('#facturas-lista tbody tr', { hasText: 'FAC-E2E-3' }).locator('.badge-green + .fac-pagada-el')).toHaveText(/\d{2}\/\d{2}\/\d{2}/);
      await expect(page.locator('#facturas-lista tbody tr', { hasText: 'FAC-E2E-5' })).toContainText('no es cliente de la plataforma');
      // LOS ABONOS (usuario, 2026-11-26): en negativo, con su etiqueta y la factura que corrigen;
      // no vencen (este es de hace 90 días) y restan de lo que queda por cobrar.
      await page.fill('#fac-buscar', 'ABO-E2E');
      const ab = page.locator('#facturas-lista tbody tr', { hasText: 'ABO-E2E-1' });
      await expect(ab).toHaveAttribute('data-tipo', 'abono');
      await expect(ab.locator('.fac-abono')).toHaveText('Abono');
      await expect(ab.locator('.fac-rectifica')).toHaveText('de la factura FAC-E2E-3');
      await expect(ab).toContainText(/[-−]\s?121,00/);
      await expect(ab).toContainText('Por compensar');
      await expect(ab).not.toContainText(/días desde la factura|Vencida|vence/);
      await expect(f.locator('#facturas-totales')).toContainText(/Por cobrar:\s*[-−]\s?121,00/);
      await page.selectOption('#fac-estado', 'vencida_60');
      await expect(page.locator('#facturas-lista tbody')).toContainText('No hay facturas con estos filtros.');
      await page.selectOption('#fac-estado', 'abono');
      await expect(page.locator('#facturas-lista tbody tr')).toHaveCount(1);
      await page.fill('#fac-buscar', 'FAC-E2E');
      await expect(page.locator('#facturas-lista tbody')).toContainText('No hay facturas con estos filtros.');
      await page.selectOption('#fac-estado', 'por_cobrar');
      await expect(page.locator('#facturas-lista tbody tr')).toHaveCount(3);
      // «Vencidas 60 días» (usuario, 2026-11-26): por fecha de emisión + 60, no por su vencimiento.
      await expect(page.locator('#fac-estado option')).toHaveText(['Todas', 'Por cobrar (pendientes y vencidas)', 'Vencidas 60 días', 'Pagadas', 'Abonos', 'Anuladas']);
      await page.selectOption('#fac-estado', 'vencida_60');
      await expect(page.locator('#facturas-lista tbody')).toContainText('No hay facturas con estos filtros.');
      await sv.from('facturas_emitidas').update({ fecha_emision: dia(-62) }).eq('ref_externa', 'e2e-fac-2');
      await page.selectOption('#fac-estado', 'todas');
      await page.selectOption('#fac-estado', 'vencida_60');
      await expect(page.locator('#facturas-lista tbody tr')).toHaveCount(1);
      await expect(page.locator('#facturas-lista tbody tr', { hasText: 'FAC-E2E-2' }).locator('.fac-dias')).toHaveText(/^6[23] días desde la factura$/);
      await sv.from('facturas_emitidas').update({ fecha_emision: dia(-5) }).eq('ref_externa', 'e2e-fac-2');
      await page.selectOption('#fac-estado', 'por_cobrar');
      await page.selectOption('#fac-estado', 'anulada');
      await expect(page.locator('#facturas-lista tbody tr')).toHaveCount(1);
      await page.selectOption('#fac-estado', 'todas');
      await page.fill('#fac-buscar', 'ajena no cliente');
      await expect(page.locator('#facturas-lista tbody tr')).toHaveCount(1);
      await page.locator('#fac-periodo').selectOption('entre');
      await expect(f.getByLabel('Desde')).toBeVisible();
      await expect(f.getByLabel('Hasta')).toBeVisible();

      // El cliente: solo las suyas, sin la anulada, sin datos internos y sin nombrar el programa.
      await entrar(page, 'cliente');
      await page.goto('/panel/administracion');
      await page.locator('#sec-facturas .tabs').getByRole('button', { name: 'Facturas' }).click();
      await expect(page.locator('#facturas-lista thead')).not.toContainText('Cuenta contable');
      await expect(page.locator('#facturas-lista thead')).not.toContainText('Empresa');
      await page.fill('#fac-buscar', 'FAC-E2E');
      await expect(page.locator('#facturas-lista tbody tr')).toHaveCount(3);
      await expect(page.locator('#facturas-totales')).toContainText(/Pendiente de pago:\s*1\.510,50/);
      await expect(page.locator('#facturas')).not.toContainText(/Holded|Ajena|días tarde|programa de facturación/);
      await expect(page.locator('#facturas-nota')).toHaveCount(0);
      await expect(page.locator('#facturas-actualizar')).toHaveCount(0);
      // El PDF: el de otra empresa, como si no existiera; el suyo pasa el permiso (en este
      // entorno la facturación no está conectada, así que no hay PDF que servir).
      expect((await page.request.get(`/api/facturas/${AJENA}/pdf`)).status()).toBe(404);
      expect((await page.request.get(`/api/facturas/${SUYA}/pdf`)).status()).toBe(502);
      // Su abono también lo ve (y puede abrirlo), con la factura que corrige.
      await page.fill('#fac-buscar', 'ABO-E2E');
      await expect(page.locator('#facturas-lista tbody tr')).toHaveCount(1);
      await expect(page.locator('#facturas-lista tbody tr .fac-rectifica')).toHaveText('de la factura FAC-E2E-3');
      await expect(page.locator('#facturas-lista tbody tr')).toContainText('Por compensar');
      expect((await page.request.get(`/api/facturas/${ABONO}/pdf`)).status()).toBe(502);
      expect((await page.request.get('/api/facturas/ffffffffffffffffffffffff/pdf')).status()).toBe(404);
    } finally {
      await sv.from('facturas_emitidas').delete().like('numero', 'FAC-E2E-%');
      await sv.from('facturas_emitidas').delete().like('numero', 'ABO-E2E-%');
      await sv.from('holded_cuentas').delete().eq('cuenta_id', CUENTA);
      await sv.from('holded_uso').delete().eq('mes', MES);
    }
  });

  test('filtro de fecha único: periodos y «Entre dos fechas» con calendarios en envíos, incidencias, penalizaciones y proformas', async ({ page }) => {
    await entrar(page, 'dynamo');
    // Envíos: filtra en el servidor, por la URL.
    await page.goto('/panel/envios');
    // En el móvil los filtros van plegados tras el botón «Filtros»: se abren si hace falta.
    const abrirFiltros = async () => {
      const t = page.locator('.filters-toggle');
      if (await t.isVisible() && (await t.getAttribute('aria-expanded')) !== 'true') await t.click();
    };
    await abrirFiltros();
    const fe = page.getByLabel('Filtrar por fecha de carga');
    await expect(fe.locator('option')).toContainText(['Todas las fechas', 'Hoy', 'Mañana', 'Este trimestre', 'Año pasado', 'Entre dos fechas…']);
    await fe.selectOption('trim');
    await expect(page).toHaveURL(/fr=trim/);
    await abrirFiltros();
    await page.getByLabel('Filtrar por fecha de carga').selectOption('entre');
    await expect(page).toHaveURL(/fr=entre/);
    await expect(page.getByLabel('Desde')).toBeVisible();
    await expect(page.getByLabel('Hasta')).toBeVisible();
    // Las listas que filtran en el navegador: el mismo desplegable y sus dos calendarios.
    for (const [ruta, etiqueta] of [['/panel/incidencias', 'Filtrar por fecha de registro'], ['/panel/penalizaciones', 'Filtrar por fecha de la penalización'], ['/panel/administracion?tab=proformas', 'Filtrar por fecha de la proforma']] as const) {
      await page.goto(ruta);
      await abrirFiltros();
      const sel = page.getByLabel(etiqueta);
      await expect(sel.locator('option')).toContainText(['Todas las fechas', 'Últimos 7 días', 'Mes pasado', 'Trimestre pasado', 'Entre dos fechas…']);
      await sel.selectOption('anio-pasado');
      await abrirFiltros();
      await sel.selectOption('entre');
      await expect(page.getByLabel('Desde')).toBeVisible();
      await expect(page.getByLabel('Hasta')).toBeVisible();
    }
  });

  test('sugerencias y fallos: el cliente manda una con foto desde Soporte y Dynamo la revisa', async ({ page }) => {
    const texto = `En el móvil no se ve bien el filtro (prueba ${Date.now()})`;
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
    await entrar(page, 'cliente');
    // También desde la tarjeta de contacto de arriba (en cualquier pantalla), con su círculo.
    await page.goto('/panel/envios');
    await page.getByRole('button', { name: 'Soporte con Álvaro' }).click();
    await page.locator('#contacto-sugerencia').click();
    await expect(page.getByRole('dialog')).toContainText('Sugerencias y fallos');
    await page.keyboard.press('Escape');
    await page.goto('/panel/soporte');
    await page.locator('#soporte-sugerencias').getByRole('button', { name: 'Enviar una sugerencia' }).click();
    const m = page.getByRole('dialog');
    await expect(m.getByText('Hacer foto')).toBeVisible();
    await expect(m.getByText('Subir foto')).toBeVisible();
    await m.locator('input[type=file]:not([capture])').setInputFiles({ name: 'captura.png', mimeType: 'image/png', buffer: png });
    await expect(m.locator('#sug-fotos')).toContainText('captura.png');
    await m.locator('#sug-texto').fill(texto);
    await m.locator('#sug-enviar').click();
    await expect(m.locator('#sug-ok')).toContainText('Tu sugerencia nos ha llegado');
    const fila = await bd().from('sugerencias').select('id, estado, pagina, cliente_id').eq('texto', texto).single();
    expect(fila.data?.estado).toBe('activa');
    expect(fila.data?.pagina).toBe('/panel/soporte');
    expect(fila.data?.cliente_id).not.toBeNull();
    await expect.poll(async () => (await bd().from('documentos').select('id', { count: 'exact', head: true }).eq('sugerencia_id', fila.data!.id)).count).toBe(1);

    // Dynamo: en el menú, en su lista, y al pulsarla la ficha con el comentario y la foto.
    await entrar(page, 'dynamo');
    await page.goto('/panel/sugerencias');
    const f = page.locator('#sugerencias-lista tbody tr', { hasText: texto });
    await expect(f).toContainText('Activa');
    await f.click();
    const ficha = page.locator('#sug-ficha');
    await expect(ficha).toContainText(texto);
    await expect(ficha).toContainText('/panel/soporte');
    await expect(ficha.locator('#sug-fotos-ficha img')).toHaveCount(1);
    await ficha.locator('[data-estado="realizada"]').click();
    await ficha.locator('#sug-nota').fill('Arreglado');
    await page.locator('#sug-guardar').click();
    await expect.poll(async () => (await bd().from('sugerencias').select('estado, nota_dynamo').eq('id', fila.data!.id).single()).data?.estado).toBe('realizada');
  });

  test('Nuevo envío: el aviso del corte solo con el primer día posible; la entrega estimada sigue a la recogida elegida', async ({ page }) => {
    await entrar(page, 'cliente');
    await page.goto('/panel/nuevo-envio');
    const sitio = page.locator('.ptar-route-row input[type=text]');
    await sitio.nth(0).fill('Sevilla'); await page.locator('.ptar-sug li').first().click();
    await sitio.nth(1).fill('Madrid'); await page.locator('.ptar-sug li').first().click();
    await page.getByRole('button', { name: /Siguiente/ }).click();
    await page.getByRole('button', { name: /Siguiente/ }).click();
    const sel = page.locator('select').filter({ has: page.locator('option', { hasText: 'Elige la fecha de recogida' }) });
    // El primer día posible: sale el aviso del corte.
    await sel.selectOption({ index: 1 });
    await expect(page.locator('.ptar-cutoff-note')).toBeVisible();
    // Un día posterior: el corte ya no le afecta, no sale; y la entrega estimada es posterior a esa recogida.
    const opciones = await sel.locator('option').evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value).filter((v) => /^\d{4}-\d{2}-\d{2}$/.test(v)));
    const tarde = opciones[opciones.length - 1];
    await sel.selectOption(tarde);
    await expect(page.locator('.ptar-cutoff-note')).toHaveCount(0);
    const caja = page.locator('#caja-entrega-estimada .v');
    await expect(caja).toContainText(/\d{2}\/\d{2}\/\d{2}/);
    const txt = (await caja.textContent()) ?? '';
    const [d, m, a] = (/(\d{2})\/(\d{2})\/(\d{2})/.exec(txt) ?? []).slice(1);
    expect(`20${a}-${m}-${d}` > tarde).toBe(true);
  });

  test('resumen de la ficha: cada parada con su día y hora del seguimiento (prevista o hecha)', async ({ page }) => {
    const { e } = await envioProgramadoDelTransportista();
    await entrar(page, 'dynamo');
    await page.goto(`/panel/envios?ver=${e.id}`);
    const fechas = page.locator('.fecha-parada');
    await expect(fechas.first()).toContainText(/Prevista: .*\d{2}\/\d{2}\/\d{2}/);
    expect(await fechas.count()).toBeGreaterThanOrEqual(2);
  });
  test('mapa del envío: se abre desde la lista y desde la ficha, con las paradas y el estado del camión', async ({ page }) => {
    const { e } = await envioProgramadoDelTransportista('id, referencia_gx');
    await entrar(page, 'dynamo');
    await page.goto('/panel/envios?f=todas');
    const fila = page.getByRole('button', { name: `Ver en el mapa el envío #${e.referencia_gx}` });
    // La lista puede no tenerlo en la primera página: entonces se mira desde la ficha.
    if (await fila.count()) {
      await fila.first().click();
      await expect(page.getByRole('heading', { name: `Mapa del envío #${e.referencia_gx}` })).toBeVisible();
      // Un clic dentro del mapa NO abre la ficha de la fila.
      await page.locator('[data-mapa-envio]').click({ position: { x: 30, y: 30 } });
      await expect(page).not.toHaveURL(/ver=/);
      await page.keyboard.press('Escape');
      await expect(page.locator('[data-mapa-envio]')).toHaveCount(0);
    }
    await page.goto(`/panel/envios?ver=${e.id}`);
    await page.getByRole('button', { name: `Ver en el mapa el envío #${e.referencia_gx}` }).first().click();
    await expect(page.locator('[data-mapa-estado]')).toContainText(/Aún no ha salido/);
    await expect(page.locator('[data-mapa-envio].leaflet-container')).toBeVisible();
    // Las dos paradas, numeradas, en el mapa (los sitios de prueba tienen coordenadas).
    await expect(page.locator('[data-mapa-envio] .leaflet-marker-icon')).toHaveCount(2);
    // Al pulsar una parada, la ruta se resalta y salen las etiquetas de TODAS sus paradas, en
    // varias líneas y con la hora (prevista o real); pulsando fuera se apagan al momento.
    await page.locator('[data-mapa-envio] .parada-mapa').first().click();
    const etiquetas = page.locator('[data-mapa-envio] .leaflet-tooltip.tt-parada');
    await expect(etiquetas).toHaveCount(2);
    await expect(etiquetas.first()).toContainText(/Recogida 1/);
    await expect(etiquetas.first()).toContainText(/Prevista|Cargado|Llegó/);
    const caja = (await page.locator('[data-mapa-envio]').boundingBox())!;
    // En el móvil el mapa es cuadrado (usuario, 2026-11-25); en el ordenador, apaisado.
    if ((page.viewportSize()?.width ?? 1280) <= 760) expect(Math.abs(caja.width - caja.height)).toBeLessThanOrEqual(2);
    else expect(caja.height).toBeLessThanOrEqual(462);
    await page.locator('[data-mapa-envio]').click({ position: { x: caja.width - 25, y: 25 } });
    await expect(etiquetas).toHaveCount(0);
    // La lista de paradas también dice la hora.
    await expect(page.locator('.mapa-paradas li').first()).toContainText(/Prevista|Cargado|Llegó/);
    await expect(page.getByLabel('Leyenda del mapa')).toContainText('Camión (posición estimada)');
  });
  test('verificación de albaranes: entran por la clave, Dynamo los revisa en carrusel y al aceptarlos los ve el cliente', async ({ page, request }) => {
    const clave = process.env.ENTRADA_DOCUMENTOS_TOKEN!;
    const { e } = await envioProgramadoDelTransportista('id, referencia_gx');
    // PDF mínimo de una página, válido para el visor.
    const pdf = (() => {
      const objs = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
        '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
        // Texto distinto en cada pasada: el mismo contenido no entra dos veces (se descarta repetido).
        ((c: string) => `<< /Length ${c.length} >>\nstream\n${c}\nendstream`)(`BT /F1 14 Tf 20 100 Td (ALBARAN ${Date.now()}) Tj ET`),
        '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
      let t = '%PDF-1.4\n'; const pos: number[] = [];
      objs.forEach((o, k) => { pos.push(t.length); t += `${k + 1} 0 obj\n${o}\nendobj\n`; });
      const x = t.length;
      t += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${pos.map((p) => `${String(p).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${x}\n%%EOF`;
      return Buffer.from(t, 'latin1');
    })();
    const base = process.env.E2E_URL ?? 'http://localhost:3484';
    // Sin la clave no entra nada.
    expect((await request.post(`${base}/api/documentos-entrada`, { data: { accion: 'iniciar', nombre: 'x.pdf' } })).status()).toBe(401);
    const nombre = `${e.referencia_gx}_ALB_20261030_41001-SEVILLA_28001-MADRID_1234ABC.pdf`;
    const ini = await (await request.post(`${base}/api/documentos-entrada`, { headers: { Authorization: `Bearer ${clave}` },
      data: { accion: 'iniciar', nombre, origen: 'drive', origen_id: `e2e-${Date.now()}` } })).json();
    expect(ini.resultado).toBe('ok');
    const put = await request.put(ini.subir_a, { headers: { 'content-type': 'application/pdf' }, data: pdf });
    expect(put.ok()).toBeTruthy();
    const conf = await (await request.post(`${base}/api/documentos-entrada`, { headers: { Authorization: `Bearer ${clave}` }, data: { accion: 'confirmar', id: ini.id } })).json();
    expect(conf.resultado).toBe('ok');
    expect(conf.envio_id).toBe(e.id);
    // Antes de verificarlo, el envío no tiene ese documento.
    const { count: antes } = await bd().from('documentos').select('*', { count: 'exact', head: true }).eq('envio_id', e.id).eq('visible_cliente', true).eq('tipo', 'albaran');

    await entrar(page, 'dynamo');
    await page.goto('/panel/verificacion-albaranes');
    await expect(page.getByRole('heading', { name: /Verificación de albaranes/ })).toBeVisible();
    await page.getByRole('tab', { name: e.referencia_gx! }).click();
    await expect(page.locator('[data-verif-envio]')).toContainText(`Envío #${e.referencia_gx}`);
    await expect(page.locator('[data-verif-nombre]')).toHaveText(nombre);
    // El PDF se dibuja (una página).
    await expect(page.locator('[data-verif-paginas] canvas')).toHaveCount(1, { timeout: 20_000 });
    await page.getByRole('button', { name: /Aceptar/ }).click();
    await expect(page.getByText(/Aceptado: ya lo ve el cliente/)).toBeVisible();
    await expect.poll(async () => {
      const { count } = await bd().from('documentos').select('*', { count: 'exact', head: true }).eq('envio_id', e.id).eq('visible_cliente', true).eq('tipo', 'albaran');
      return (count ?? 0) - (antes ?? 0);
    }).toBe(1);
  });
  test('mapa general: el cliente y Dynamo ven sus envíos en curso, con filtro y encuadre', async ({ page }) => {
    await envioProgramadoDelTransportista('id');
    for (const quien of ['cliente', 'dynamo'] as const) {
      await entrar(page, quien);
      await page.goto('/panel/mapa');
      await expect(page.getByRole('heading', { name: 'Mapa de envíos' })).toBeVisible();
      await expect(page.locator('[data-mapa-general].leaflet-container')).toBeVisible();
      const cajaGeneral = (await page.locator('[data-mapa-general]').boundingBox())!;
      if ((page.viewportSize()?.width ?? 1280) <= 760) expect(Math.abs(cajaGeneral.width - cajaGeneral.height)).toBeLessThanOrEqual(2);
      // Al menos un envío programado o en marcha, pintado (punto o camión).
      await expect.poll(async () => page.locator('[data-mapa-general] .leaflet-interactive, [data-mapa-general] .leaflet-marker-icon').count(), { timeout: 15_000 }).toBeGreaterThan(0);
      await page.getByRole('tab', { name: /^Programados/ }).click();
      await expect(page.getByRole('tab', { name: /^Programados/ })).toHaveAttribute('aria-selected', 'true');
      await expect(page.getByLabel('Leyenda del mapa general')).toContainText('En marcha');
      // Al pulsar un programado, su ruta sale resaltada con las etiquetas de sus paradas y se
      // apaga sola a los 4 segundos.
      // Se pulsa con «force» (los puntos de varios envíos caen unos encima de otros), y eso se
      // salta la espera a que el mapa esté quieto: justo después de cambiar de pestaña el mapa
      // se vuelve a encuadrar, y con él en movimiento (o repintándose al llegar las rutas) la
      // pulsación puede caer fuera del punto. Como haría una persona, se vuelve a pulsar hasta
      // que la ruta sale resaltada (fallaba así en Firefox y en el iPhone, 2026-11-24).
      const etiquetas = page.locator('[data-mapa-general] .leaflet-tooltip.tt-parada');
      await expect(async () => {
        await page.locator('[data-mapa-general] .punto-programado').last().click({ force: true });
        await expect.poll(async () => etiquetas.count(), { timeout: 1_500 }).toBeGreaterThan(0);
      }).toPass({ timeout: 20_000 });
      await expect(etiquetas.first()).toContainText(/Prevista|Cargado|Llegó|Entrega|Recogida/);
      await expect(etiquetas).toHaveCount(0, { timeout: 7_000 });
      // «Encuadrar» devuelve el mapa a todo lo pintado tras moverlo o acercarse.
      await page.getByRole('tab', { name: /^Todos/ }).click();
      await page.locator('[data-mapa-general] .leaflet-control-zoom-in').click();
      await page.locator('[data-mapa-general] .leaflet-control-zoom-in').click();
      await page.getByRole('button', { name: 'Encuadrar todos los envíos' }).click();
      // El menú de la cuenta queda POR ENCIMA del mapa (antes el mapa lo tapaba): se puede pulsar.
      await page.locator('.topbar-user').click();
      await page.getByRole('menuitem', { name: 'Mi cuenta' }).click({ trial: true });
      await page.context().clearCookies();
    }
  });
});
