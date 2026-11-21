// Lo que se ha ido añadiendo a la plataforma y conviene que no se rompa sin enterarnos
// (usuario, 2026-11-17: «amplía las pruebas automáticas y, si ves fallos, me lo dices»).
// Van después de los flujos clave (orden alfabético de ficheros, un solo trabajador) y
// usan los mismos datos de prueba. Cada prueba prepara lo suyo.
import { expect } from '@playwright/test';
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
    await expect(page.locator('#pago-plazo')).toContainText('tendrás que crear un envío nuevo');
    await page.goto('/panel/administracion');
    const proforma = page.locator('#sec-facturas table.data tbody tr', { hasText: e.referencia_gx });
    await expect(proforma.locator('.pago-plazo .cuenta-atras')).toBeVisible();
    // Avisa de su transferencia (con una pregunta antes): el temporizador desaparece y queda «validando».
    await page.goto(`/panel/envios?ver=${e.id}`);
    await page.locator('#pago-avisar').click();
    await page.getByRole('button', { name: /Sí, ya la he hecho/ }).click();
    await expect(page.locator('#pago-avisado')).toContainText('La estamos validando');
    await expect(page.locator('#pago-plazo')).toHaveCount(0);
    await expect(page.locator('#pago-avisar')).toHaveCount(0);
    await expect.poll(async () => (await sv.from('envios').select('pago_avisado_en').eq('id', e.id).single()).data?.pago_avisado_en ?? null).not.toBeNull();
    await page.goto('/panel/administracion');
    await expect(proforma).toContainText('Validando tu transferencia');
    // Dynamo: lo ve en la lista y en la ficha, con el plazo parado.
    await entrar(page, 'dynamo');
    await page.goto('/panel/envios?f=sin-pagar');
    await expect(page.locator('table.data tbody tr', { hasText: e.referencia_gx })).toContainText('Transferencia avisada · validar');
    await page.goto(`/panel/envios?ver=${e.id}`);
    await expect(page.locator('#pago-avisado')).toContainText('El cliente avisó de su transferencia');
    await expect(page.getByRole('button', { name: 'Ha llegado la transferencia' })).toBeVisible();
    // En Proformas, «por validar»; no le consta el cobro: «Pago no recibido» anula el envío.
    await page.goto('/panel/administracion');
    const fila = page.locator('#sec-facturas table.data tbody tr', { hasText: e.referencia_gx });
    await expect(fila).toContainText('Transferencia avisada · validar');
    await fila.locator('.pago-no-recibido').click();
    await page.locator('#adm-rechazo').fill('no aparece en el banco');
    await page.getByRole('button', { name: 'Sí, anular el envío' }).click();
    await expect.poll(async () => (await sv.from('envios').select('estado').eq('id', e.id).single()).data?.estado).toBe('cancelado');
    await expect(fila).toHaveCount(0);
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
    await expect.poll(async () => (await ultimoEnvio()).estado).toBe('cancelado');
    const { data: mails } = await bd().from('emails_enviados').select('estado').eq('envio_id', id);
    expect((mails ?? []).filter((m) => m.estado !== 'omitido')).toEqual([]);
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
      await page.locator('#mt-tfno').fill('600290390');
      if (await page.locator('#mt-dia').count()) await page.locator('#mt-dia').selectOption({ index: 1 });
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
  // «¿Los empleados tienen el doble paso? Dímelo tú» (usuario, 2026-11-20): cuadro en Usuarios.
  test('Usuarios: el Admin Master ve quién del equipo tiene el doble paso', async ({ page }) => {
    await entrar(page, 'dynamo');
    await page.goto('/panel/usuarios');
    const c = page.locator('#doble-paso-equipo');
    await expect(c).toContainText(/Doble paso del equipo de Dynamo: \d+ de \d+ lo tienen activado/);
    await expect(c.locator('li', { hasText: EMAIL.dynamo }).or(c.locator('li').first())).toBeVisible();
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

  test('Administración → Facturas: Dynamo ve ingresos y gastos con filtros de tipo y periodo (solo lectura); el cliente, solo las suyas', async ({ page }) => {
    await entrar(page, 'dynamo');
    await page.goto('/panel/administracion');
    await page.locator('#sec-facturas .tabs').getByRole('button', { name: 'Facturas' }).click();
    await expect(page.locator('#facturas-sin-conectar')).toContainText('menos las de gastos financieros');
    await expect(page.locator('#facturas-dynamo')).toContainText('Solo lectura');
    await expect(page.locator('#facturas-lista thead')).toContainText(/Fecha.*Tipo.*Concepto.*Empresa.*CIF.*Base.*IVA.*Retención.*Total.*Pago/);
    await expect(page.locator('#fac-tipo option')).toHaveText(['Todas (ingresos y gastos)', 'Ingresos · emitidas', 'Gastos · recibidas']);
    await page.locator('#fac-periodo').selectOption('trim');
    await page.locator('#fac-periodo').selectOption('entre');
    await expect(page.locator('#facturas-dynamo').getByLabel('Desde')).toBeVisible();
    await expect(page.locator('#facturas-dynamo').getByLabel('Hasta')).toBeVisible();
    await entrar(page, 'cliente');
    await page.goto('/panel/administracion');
    await page.locator('#sec-facturas .tabs').getByRole('button', { name: 'Facturas' }).click();
    await expect(page.locator('#sec-facturas')).toContainText('te las seguimos enviando por email');
    await expect(page.locator('#facturas-dynamo')).toHaveCount(0);
  });

  test('filtro de fecha único: periodos y «Entre dos fechas» con calendarios en envíos, incidencias, penalizaciones y proformas', async ({ page }) => {
    await entrar(page, 'dynamo');
    // Envíos: filtra en el servidor, por la URL.
    await page.goto('/panel/envios');
    const fe = page.getByLabel('Filtrar por fecha de carga');
    await expect(fe.locator('option')).toContainText(['Todas las fechas', 'Hoy', 'Mañana', 'Este trimestre', 'Año pasado', 'Entre dos fechas…']);
    await fe.selectOption('trim');
    await expect(page).toHaveURL(/fr=trim/);
    await page.getByLabel('Filtrar por fecha de carga').selectOption('entre');
    await expect(page).toHaveURL(/fr=entre/);
    await expect(page.getByLabel('Desde')).toBeVisible();
    await expect(page.getByLabel('Hasta')).toBeVisible();
    // Las listas que filtran en el navegador: el mismo desplegable y sus dos calendarios.
    for (const [ruta, etiqueta] of [['/panel/incidencias', 'Filtrar por fecha de registro'], ['/panel/penalizaciones', 'Filtrar por fecha de la penalización'], ['/panel/administracion', 'Filtrar por fecha de la proforma']] as const) {
      await page.goto(ruta);
      const sel = page.getByLabel(etiqueta);
      await expect(sel.locator('option')).toContainText(['Todas las fechas', 'Últimos 7 días', 'Mes pasado', 'Trimestre pasado', 'Entre dos fechas…']);
      await sel.selectOption('anio-pasado');
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
});
