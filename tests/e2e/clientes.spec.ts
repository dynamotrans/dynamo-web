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
