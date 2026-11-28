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

// La deuda del cliente en su ficha (usuario, 2026-11-26): lo que debe, lo pasado de 60 días y
// la lista de esas facturas para reclamarlas. Solo Dynamo.
test.describe('deuda en la ficha', () => {
  test('la ficha del cliente enseña lo que debe y las facturas de más de 60 días', async ({ page }) => {
    const { bd } = await import('./ayudas');
    const { data: c } = await bd().from('clientes').select('id, nombre_visible').eq('estado', 'activa').order('creado_en').limit(1).single();
    const hoy = new Date();
    const dia = (n: number) => new Date(hoy.getTime() - n * 86_400_000).toISOString().slice(0, 10);
    const refs = ['e2e-deuda-1', 'e2e-deuda-2'];
    await bd().from('facturas_emitidas').delete().in('ref_externa', refs);
    const { error } = await bd().from('facturas_emitidas').insert([
      { ref_externa: refs[0], cliente_id: c!.id, numero: 'E2E-D1', fecha_emision: dia(75), fecha_vencimiento: dia(-45), total: 1210, pendiente: 1210, estado: 'pendiente', tipo: 'factura' },
      { ref_externa: refs[1], cliente_id: c!.id, numero: 'E2E-D2', fecha_emision: dia(10), fecha_vencimiento: dia(-110), total: 242, pendiente: 242, estado: 'pendiente', tipo: 'factura' },
    ]);
    expect(error).toBeNull();
    try {
      await entrar(page, 'dynamo');
      await page.goto(`/panel/clientes?ver=${c!.id}`);
      const deuda = page.locator('#cli-deuda');
      await expect(deuda).toContainText('Debe (facturas)');
      await expect(page.locator('#cli-deuda-pasado')).toContainText('1.210');
      await expect(page.locator('#cli-deuda-llamar')).toContainText('E2E-D1');
      await expect(page.locator('#cli-deuda-llamar')).not.toContainText('E2E-D2');
    } finally {
      await bd().from('facturas_emitidas').delete().in('ref_externa', refs);
    }
  });
});

// Verificación de empresa (usuario, 2026-11-26): sin verificar, crédito 0 y pago previo. Dynamo
// la quita; el cliente la pide por transferencia de 0,01 € con su código; Dynamo la ve en Altas
// y la verifica desde la ficha (con motivo y contraseña).
test.describe('verificación de empresa', () => {
  test('Dynamo la quita, el cliente la pide por transferencia y Dynamo la vuelve a verificar', async ({ page }) => {
    const { bd, CLAVE, EMAIL } = await import('./ayudas');
    const { data: u } = await bd().from('usuarios').select('cliente_id').eq('email', EMAIL.cliente).single();
    const cid = u!.cliente_id as string;
    const { data: c } = await bd().from('clientes').select('cif, estado_verificacion').eq('id', cid).single();
    expect(c!.estado_verificacion).toBe('verificada');

    await entrar(page, 'dynamo');
    await page.goto(`/panel/clientes?ver=${cid}`);
    await expect(page.locator('#cli-verificacion-estado')).toContainText('Verificada');
    await page.locator('#btn-cli-quitar-verificacion').click();
    await page.fill('#cli-verificar-motivo', 'Prueba e2e: quitar y volver a verificar');
    await page.fill('#cli-verificar-clave', CLAVE);
    await page.locator('#btn-cli-verificar-confirmar').click();
    await expect(page.locator('#cli-verificacion-estado')).toContainText('Sin verificar');

    try {
      await entrar(page, 'cliente');
      await page.goto('/panel/mi-cuenta');
      // Arriba, el aviso: verde si tiene crédito esperándole, azul si no (usuario, 2026-11-27).
      await expect(page.locator('#aviso-verificacion-credito, #aviso-verificacion-sin-credito')).toBeVisible();
      const tarjeta = page.locator('#tarjeta-verificacion');
      await expect(tarjeta).toContainText('Sin verificar');
      await page.locator('#btn-abrir-verificacion').click();
      await expect(page.locator('.dash-modal-card')).toContainText('¿Tienes dudas');
      // Solo céntimo (usuario, 2026-11-27): sin elegir vía y sin «Subir un documento».
      await expect(page.locator('#via-documento, #via-transferencia')).toHaveCount(0);
      // El concepto es el CIF de la empresa (usuario, 2026-11-27).
      await expect(page.locator('#verificacion-concepto')).toContainText(c!.cif.replace(/[^A-Za-z0-9]/g, '').toUpperCase().replace(/^ES(?=[A-Z0-9]{9}$)/, ''));
      // Cada dato con su botón de copiar (usuario, 2026-11-27).
      await expect(page.locator('#copiar-verificacion-concepto')).toBeVisible();
      await expect(page.locator('#copiar-verificacion-beneficiario')).toBeVisible();
      await page.locator('#copiar-verificacion-concepto').click();
      await expect(page.locator('#copiar-verificacion-concepto')).toContainText(/Copiado|Cópialo a mano/);
      // Sin «Copiar todos los datos» (usuario, 2026-11-28).
      await expect(page.locator('#copiar-verificacion-todo')).toHaveCount(0);
      // «Solo el código» y «no se devuelve» van en el globo junto al 0,01 € (usuario, 2026-11-27).
      await page.locator('#tip-centimo .tip-i-btn').click();
      await expect(page.locator('#tip-centimo .tip-i-pop')).toBeVisible();
      await expect(page.locator('#tip-centimo .tip-i-pop')).toContainText('no se devuelve');
      await page.locator('#btn-transferencia-hecha').click();
      await expect(page.locator('#verificacion-enviada')).toBeVisible();
      // Una sola petición a la vez (usuario, 2026-11-27): ya avisada, no se vuelve a pedir.
      await page.reload();
      await expect(tarjeta).toContainText('En revisión');
      await page.locator('#btn-abrir-verificacion').click();
      await expect(page.locator('#verificacion-ya-pedida')).toContainText('transferencia');
      await expect(page.locator('#btn-transferencia-hecha')).toHaveCount(0);
      // El concepto es el CIF de la empresa (usuario, 2026-11-27).
      await expect(page.locator('#verificacion-concepto')).toContainText(c!.cif.replace(/[^A-Za-z0-9]/g, '').toUpperCase().replace(/^ES(?=[A-Z0-9]{9}$)/, ''));

      await entrar(page, 'dynamo');
      await page.goto('/panel/altas');
      await expect(page.locator('#empresas-por-verificar')).toContainText(c!.cif);
      await page.goto(`/panel/clientes?ver=${cid}`);
      await page.locator('#btn-cli-verificar').click();
      await expect(page.locator('#cli-verificar-metodo')).toHaveValue('transferencia');
      await page.fill('#cli-verificar-motivo', 'Prueba e2e: llega 0,01 € con su código');
      await page.fill('#cli-verificar-clave', CLAVE);
      await page.locator('#btn-cli-verificar-confirmar').click();
      await expect(page.locator('#cli-verificacion-estado')).toContainText('Verificada');
    } finally {
      const { data: f } = await bd().from('clientes').select('estado_verificacion').eq('id', cid).single();
      expect(f!.estado_verificacion, 'la empresa del cliente de pruebas debe acabar verificada').toBe('verificada');
    }
  });
});

// Baja de un compañero (usuario, 2026-11-26): se PIDE desde «Tu equipo» (motivo y contraseña);
// la cuenta queda sin acceso al momento y Dynamo la rehabilita (o confirma) en Altas pendientes.
test.describe('baja de un compañero', () => {
  test('el cliente pide la baja de un compañero y Dynamo la rehabilita', async ({ page }) => {
    const { bd, CLAVE, EMAIL } = await import('./ayudas');
    const { data: yo } = await bd().from('usuarios').select('cliente_id').eq('email', EMAIL.cliente).single();
    const email = `companero-${Date.now()}@e2e.test`;
    const { data: nuevo, error } = await bd().auth.admin.createUser({ email, password: CLAVE, email_confirm: true, user_metadata: { nombre: 'Compañero E2E' } });
    expect(error).toBeNull();
    const id = nuevo.user!.id;
    await bd().from('usuarios').update({ cliente_id: yo!.cliente_id, estado: 'activa' }).eq('id', id);
    try {
      await entrar(page, 'cliente');
      await page.goto('/panel/mi-cuenta');
      const fila = page.locator('#equipo-empresa .equipo-fila', { hasText: email });
      await fila.getByRole('button', { name: 'Pedir su baja' }).click();
      await page.fill('#equipo-baja-motivo', 'Ya no trabaja con nosotros (prueba e2e)');
      await page.fill('#equipo-baja-clave', CLAVE);
      await page.locator('#btn-equipo-baja-confirmar').click();
      await expect(fila).toContainText('Baja pedida');
      const { data: u } = await bd().from('usuarios').select('estado').eq('id', id).single();
      expect(u!.estado).toBe('suspendida_total');

      await entrar(page, 'dynamo');
      await page.goto('/panel/altas');
      const caja = page.locator('#bajas-solicitadas');
      await expect(caja).toContainText(email);
      await caja.locator('tr', { hasText: email }).getByRole('button', { name: 'Rehabilitar' }).click();
      await page.fill('#baja-nota', 'Llamado: no la reconoce (prueba e2e)');
      await page.fill('#baja-clave', CLAVE);
      await caja.getByRole('button', { name: 'Rehabilitar' }).last().click();
      await expect(page.getByText('Cuenta rehabilitada')).toBeVisible();
      const { data: u2 } = await bd().from('usuarios').select('estado').eq('id', id).single();
      expect(u2!.estado).toBe('activa');
    } finally {
      await bd().from('usuarios').update({ estado: 'suspendida' }).eq('id', id);
    }
  });
});

// Borrar un cliente (usuario, 2026-11-27): solo el Admin Master, con contraseña y CONFIRMAR, y solo
// si la empresa no tiene nada colgado. Con usuarios dice qué tiene y no borra.
test.describe('borrar cliente', () => {
  test('con usuarios no se borra; una empresa vacía sí', async ({ page }) => {
    const { bd, CLAVE, EMAIL } = await import('./ayudas');
    const { data: u } = await bd().from('usuarios').select('cliente_id').eq('email', EMAIL.cliente).single();
    const cid = u!.cliente_id as string;
    const cif = 'B' + String(Date.now()).slice(-8);
    const { data: nuevo, error } = await bd().from('clientes').insert({ razon_social: 'Borrar e2e S.L.', cif }).select('id').single();
    expect(error).toBeNull();
    const vacia = nuevo!.id as string;
    try {
      await entrar(page, 'dynamo');
      // La del cliente de pruebas tiene usuarios y envíos: no se borra y lo dice.
      await page.goto(`/panel/clientes?ver=${cid}`);
      await page.locator('#cli-borrar').click();
      await expect(page.locator('#cli-borrar-si')).toBeDisabled();
      await page.fill('#cli-borrar-clave', CLAVE);
      await page.fill('#cli-borrar-txt', 'CONFIRMAR');
      await page.locator('#cli-borrar-si').click();
      await expect(page.locator('#cli-borrar-error')).toContainText('No se puede borrar');
      await expect(page.locator('#cli-borrar-error')).toContainText('usuario');
      const { count } = await bd().from('clientes').select('id', { count: 'exact', head: true }).eq('id', cid);
      expect(count).toBe(1);

      // La vacía: se borra y desaparece.
      await page.goto(`/panel/clientes?ver=${vacia}`);
      await expect(page.locator('.dash-modal-card')).toContainText('Borrar e2e S.L.');
      await page.locator('#cli-borrar').click();
      await page.fill('#cli-borrar-clave', CLAVE);
      await page.fill('#cli-borrar-txt', 'CONFIRMAR');
      await page.locator('#cli-borrar-si').click();
      await expect(page.locator('.dash-modal-card')).toHaveCount(0);
      await expect.poll(async () => (await bd().from('clientes').select('id', { count: 'exact', head: true }).eq('id', vacia)).count).toBe(0);
    } finally {
      await bd().from('clientes').delete().eq('id', vacia);
    }
  });
});
