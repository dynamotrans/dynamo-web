// ENLACE DE PAGO PÚBLICO (usuario, 2026-11-25): el botón «Pagar el envío» del email abre una
// página SIN entrar en la plataforma, para poder reenviarlo a quien paga. Solo enseña lo mínimo
// del envío pendiente de pago y deja avisar de la transferencia (y pagar con tarjeta donde está
// conectada). Con una llave que no existe, nada.
import { expect } from '@playwright/test';
import { test, entrar, ultimoEnvio, bd, crearEnvioDeCliente } from './ayudas';

test.describe('enlace de pago público', () => {
  test('sin sesión: lo mínimo del envío, aviso de transferencia y nada con una llave inventada', async ({ page, browser }) => {
    await entrar(page, 'cliente');
    await crearEnvioDeCliente(page);
    const e = await ultimoEnvio();
    const sv = bd();
    const { error } = await sv.from('envios').update({ estado_pago_previo: 'pendiente', pago_motivo: 'Pedido por Dynamo', pago_pendiente_en: new Date().toISOString(), pago_avisado_en: null }).eq('id', e.id);
    expect(error).toBeNull();
    const { data: fila } = await sv.from('envios').select('pago_token, referencia_gx').eq('id', e.id).single();
    const token = fila!.pago_token as string;
    expect(token).toMatch(/^[0-9a-f-]{36}$/);

    // Un navegador limpio, SIN sesión: como quien recibe el email reenviado.
    const otro = await browser.newContext();
    const p = await otro.newPage();
    try {
      await p.goto(`/pago/${token}`);
      await expect(p).toHaveURL(new RegExp(`/pago/${token}`));   // no manda a entrar
      await expect(p.locator('h1')).toContainText(`Pago del envío #${fila!.referencia_gx}`);
      await expect(p.locator('#pago-pub-caja')).toContainText(/Pendiente de pago · .*€/);
      await expect(p.locator('#pago-plazo .cuenta-atras-grande')).toContainText(/Te quedan .*\d.* para pagar/);
      // La ruta por paradas: qué es cada una, dónde (sin calle) y su hora prevista.
      const datos = p.locator('#pago-pub-datos');
      await expect(datos).toContainText(/Fecha de carga.*1 · Recogida.*Sevilla.*Prevista:.*2 · Entrega.*Madrid.*Prevista:.*Mercancía.*Precio \(sin IVA\).*Total con IVA/s);
      await expect(p.locator('[data-parada]')).toHaveCount(2);
      // Nada de la plataforma: ni menú, ni enlaces al panel, ni nombres de los sitios.
      await expect(p.locator('.sidebar')).toHaveCount(0);
      expect(await p.locator('a[href^="/panel"]').count()).toBe(0);
      // «Ya he hecho la transferencia»: pregunta antes, con el aviso de las fechas, y para el plazo.
      await p.locator('#pago-avisar').click();
      await expect(p.locator('#pago-avisar-fechas')).toContainText(/hasta el día siguiente.*desde que validamos el pago/s);
      await p.getByRole('button', { name: /Sí, ya está hecha/ }).click();
      await expect(p.locator('#pago-avisado')).toContainText('La estamos validando');
      await expect(p.locator('#pago-plazo')).toHaveCount(0);
      await expect(p.locator('#pago-avisar')).toHaveCount(0);
      await expect.poll(async () => (await sv.from('envios').select('pago_avisado_en').eq('id', e.id).single()).data?.pago_avisado_en ?? null).not.toBeNull();
      // Una llave inventada (o mal copiada) no enseña nada.
      await p.goto('/pago/00000000-0000-4000-8000-000000000000');
      await expect(p.locator('#pago-pub-mal')).toContainText('Enlace de pago no válido');
      await p.goto('/pago/no-es-una-llave');
      await expect(p.locator('#pago-pub-mal')).toBeVisible();
      // Pagado: la página solo lo dice.
      await sv.from('envios').update({ estado_pago_previo: 'pagado', pagado_en: new Date().toISOString() }).eq('id', e.id);
      await p.goto(`/pago/${token}`);
      await expect(p.locator('#pago-pub-pagado')).toContainText('Envío pagado');
      await expect(p.locator('#pago-pub-datos')).toHaveCount(0);
    } finally {
      await otro.close();
    }
    // Dynamo ve el aviso de la transferencia hecha desde el enlace.
    const { data: avisos } = await sv.from('avisos').select('texto').eq('envio_id', e.id).eq('tipo', 'pago_avisado').eq('para', 'dynamo');
    expect((avisos ?? []).some((a) => /desde el enlace de pago/.test(a.texto ?? ''))).toBe(true);
  });
});
