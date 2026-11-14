// Auditoría de ACCESIBILIDAD (axe, WCAG 2.1 AA) de las pantallas clave, por rol — la
// exigencia legal de accesibilidad web y el repaso de contraste/aria/foco de la revisión
// de usabilidad del 2026-11-12. Corre con la misma pila local que los flujos.
//
// Criterio: un problema GRAVE o CRÍTICO (serious/critical: contraste insuficiente, campos
// sin nombre accesible, aria rota…) tira la prueba; los leves se imprimen como aviso para
// la siguiente pasada. Las páginas públicas del transportista (/carga, /cmr) se auditan
// con un enlace no válido: comparten la hoja de estilos y la tarjeta con las de verdad.
import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { entrar } from './ayudas';

async function auditar(page: Page, url: string) {
  await page.goto(url);
  // 'networkidle' NUNCA llega en el panel: la conexión «en vivo» (websocket de Supabase)
  // queda abierta a propósito. Carga + un respiro para lo que pinta el cliente.
  await page.waitForLoadState('load');
  await page.waitForTimeout(600);
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  const graves = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  const leves = r.violations.filter((v) => !graves.includes(v));
  for (const v of leves) console.log(`  (leve) ${url} · ${v.id}: ${v.help} — ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
  expect(graves.map((v) => `${url} · ${v.id}: ${v.help}\n${v.nodes.slice(0, 5).map((n) => `  → ${n.target.join(' ')}: ${(n.any[0]?.message ?? '').slice(0, 140)}`).join('\n')}`), `Accesibilidad en ${url}`).toEqual([]);
}

test.describe('accesibilidad (axe · WCAG 2.1 AA)', () => {
  test('páginas sin sesión', async ({ page }) => {
    for (const u of ['/panel/entrar', '/panel/registro', '/panel/olvido',
      '/carga/00000000-0000-0000-0000-000000000000', '/cmr/00000000-0000-0000-0000-000000000000']) await auditar(page, u);
  });

  test('panel del cliente', async ({ page }) => {
    await entrar(page, 'cliente');
    for (const u of ['/panel', '/panel/envios', '/panel/nuevo-envio', '/panel/sitios', '/panel/operadores',
      '/panel/administracion', '/panel/incidencias', '/panel/mi-cuenta', '/panel/uso']) await auditar(page, u);
  });

  test('panel de Dynamo', async ({ page }) => {
    await entrar(page, 'dynamo');
    for (const u of ['/panel/dashboard-admin', '/panel/para-hoy', '/panel/envios', '/panel/clientes',
      '/panel/transportistas', '/panel/usuarios', '/panel/parametros', '/panel/altas']) await auditar(page, u);
  });

  test('panel del transportista', async ({ page }) => {
    await entrar(page, 'transportista');
    for (const u of ['/panel', '/panel/mi-cuenta', '/panel/recursos']) await auditar(page, u);
  });
});
