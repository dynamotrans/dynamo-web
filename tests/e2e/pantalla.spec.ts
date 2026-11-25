// «Hueco vacío al final de la página» (usuario, 2026-11-22 y 2026-11-25). El fallo es del
// navegador del iPhone y aquí no se puede provocar, así que se comprueba lo que sí depende de
// nosotros: que ninguna pantalla mida más que su contenido, que el vigilante no toque una
// pantalla que está bien y que, cuando avisa, el apunte llegue a Mantenimiento.
import { expect } from '@playwright/test';
import { test, entrar, bd } from './ayudas';

const medir = () => ({
  doc: document.documentElement.scrollHeight, alto: window.innerHeight,
  contenido: Math.round(document.body.getBoundingClientRect().bottom + window.scrollY),
  y: Math.round(window.scrollY),
});

test.describe('pantalla sin hueco al final', () => {
  test('las pantallas principales acaban donde acaba su contenido, y el vigilante no las toca', async ({ page }) => {
    const sv = bd();
    await sv.from('pantalla_descuadres').delete().neq('causa', '');
    await entrar(page, 'cliente');
    for (const ruta of ['/panel/dashboard', '/panel/envios', '/panel/sitios', '/panel/soporte']) {
      await page.goto(ruta);
      await page.waitForLoadState('load');
      // Hasta el final, y un rato quieta para que el vigilante mida.
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await page.waitForTimeout(1800);
      const m = await page.evaluate(medir);
      expect(m.doc - Math.max(m.contenido, m.alto), `${ruta}: la página mide más que su contenido`).toBeLessThanOrEqual(60);
      expect(m.y, `${ruta}: bajada más allá del final`).toBeLessThanOrEqual(Math.max(0, m.doc - m.alto) + 2);
    }
    // De una pantalla larga a una corta, por el menú (sin recargar): arriba y sin hueco.
    await page.goto('/panel/envios');
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.evaluate(() => { (document.querySelector('a[href="/panel/soporte"]') as HTMLElement | null)?.click(); });
    await page.waitForURL(/\/panel\/soporte/);
    await page.waitForTimeout(1800);
    const m = await page.evaluate(medir);
    expect(m.y).toBeLessThanOrEqual(Math.max(0, m.doc - m.alto) + 2);
    // El vigilante no ha apuntado nada: todo estaba bien.
    const { count } = await sv.from('pantalla_descuadres').select('id', { count: 'exact', head: true });
    expect(count ?? 0).toBe(0);
  });

  test('cuando el navegador avisa de un descuadre, queda apuntado y Dynamo lo ve en Mantenimiento', async ({ page }) => {
    const sv = bd();
    await sv.from('pantalla_descuadres').delete().neq('causa', '');
    try {
      await entrar(page, 'cliente');
      const estado = await page.evaluate(async () => (await fetch('/api/vista-informe', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          causa: 'pasado_del_final', motivo: 'scroll', ruta: '/panel/dashboard?x=1', corregido: true,
          antes: { y: 1250, alto: 750, doc: 2000, vvAlto: 750, vvArriba: 650, vvPagina: 1900, escala: 1, secreto: 'no se guarda' },
          despues: { y: 1250, alto: 750, doc: 2000, vvAlto: 750, vvArriba: 0, vvPagina: 1250, escala: 1 },
        }),
      })).status);
      expect(estado).toBe(204);
      // Una causa inventada no se apunta.
      await page.evaluate(() => fetch('/api/vista-informe', { method: 'POST', body: JSON.stringify({ causa: 'otra', ruta: '/x' }) }));
      const { data } = await sv.from('pantalla_descuadres').select('causa, ruta, corregido, datos');
      expect(data).toHaveLength(1);
      expect(data![0].ruta).toBe('/panel/dashboard');
      expect(data![0].corregido).toBe(true);
      expect(JSON.stringify(data![0].datos)).not.toContain('secreto');
      // El cliente no lo ve por la API; Dynamo sí, en Mantenimiento.
      await page.context().clearCookies();
      await entrar(page, 'dynamo');
      await page.goto('/panel/mantenimiento');
      const caja = page.locator('#descuadres-pantalla');
      await expect(caja).toContainText('Recolocada sola');
      await expect(caja).toContainText('La pantalla miraba más allá del final de la página, al desplazarse');
      await expect(caja).toContainText('/panel/dashboard');
      await expect(caja).toContainText('vvPagina 1900');
    } finally {
      await sv.from('pantalla_descuadres').delete().neq('causa', '');
    }
  });
});
