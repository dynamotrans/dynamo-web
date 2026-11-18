// Lo que se ha ido añadiendo a la plataforma y conviene que no se rompa sin enterarnos
// (usuario, 2026-11-17: «amplía las pruebas automáticas y, si ves fallos, me lo dices»).
// Van después de los flujos clave (orden alfabético de ficheros, un solo trabajador) y
// usan los mismos datos de prueba. Cada prueba prepara lo suyo.
import { expect } from '@playwright/test';
import { test, entrar, ultimoEnvio, bd, como, crearEnvioDeCliente, envioListo, CIF_TRANSPORTISTA } from './ayudas';

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

  test('ningún sitio queda marcado «sin medios de carga» sin que nadie lo ponga', async () => {
    const { count, error } = await bd().from('sitios').select('id', { count: 'exact', head: true }).eq('tiene_medios_carga', false);
    expect(error).toBeNull();
    expect(count).toBe(0);
  });
});
