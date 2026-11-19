// CÓMO SE VEN las pantallas que más se usan (usuario, 2026-11-18: «¿compruebas bien todo o
// podrías mejorar?»). Los flujos comprueban que la plataforma FUNCIONA; esto, que no se
// descoloca. Dos comprobaciones por pantalla, en cada navegador (Chrome, Safari y móvil):
//
//   1. DISEÑO, con medidas (no depende de la letra ni del día): nada se sale por la
//      derecha, ningún campo se queda enano y ningún botón queda cortado.
//   2. FOTO: la pantalla se compara con su foto de referencia (tests/e2e/fotos). Si un
//      cambio de diseño es A PROPÓSITO, las fotos se rehacen lanzando el CI a mano con la
//      casilla «fotos» (lo hace el propio CI, que es donde se sacan: en otro ordenador la
//      letra sale distinta y no valdrían).
//
// Va el último (orden alfabético) y prepara sus propios envíos.
import { expect, type Page, type Locator } from '@playwright/test';
import { existsSync } from 'node:fs';
import { test, entrar, bd, envioListo, CIF_TRANSPORTISTA } from './ayudas';

// ---- 1. Diseño con medidas ---------------------------------------------------------
async function comprobarDiseno(page: Page, nombre: string, raiz: Locator) {
  const fallos = await raiz.evaluate((el) => {
    const out: string[] = [];
    const ancho = document.documentElement.clientWidth;
    if (document.documentElement.scrollWidth > ancho + 1) out.push(`la página se desplaza de lado (${document.documentElement.scrollWidth} px de contenido en ${ancho} px de pantalla)`);
    const visible = (e: Element) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0.05; };
    const quien = (e: Element) => `${e.tagName.toLowerCase()}${e.id ? '#' + e.id : ''}${e.getAttribute('placeholder') ? `[${e.getAttribute('placeholder')}]` : ''}${e.className && typeof e.className === 'string' ? '.' + e.className.split(' ').filter(Boolean).slice(0, 2).join('.') : ''}`;
    // Campos de escribir y desplegables: ninguno por debajo de 90 px (las cajitas de un
    // código de cifras y lo marcado con data-campo-corto se quedan fuera: son cortos a propósito).
    for (const c of el.querySelectorAll('input:not([type=checkbox]):not([type=radio]):not([type=hidden]):not([type=file]):not([type=range]), select, textarea')) {
      if (!visible(c) || c.closest('[data-campo-corto], .otp-box, .otp') || c.classList.contains('otp-box')) continue;
      const r = c.getBoundingClientRect();
      if (r.width < 90) out.push(`campo enano (${Math.round(r.width)} px): ${quien(c)}`);
      if (r.right > ancho + 1 || r.left < -1) out.push(`campo fuera de la pantalla: ${quien(c)}`);
    }
    // Botones: dentro de la pantalla y con su texto entero.
    for (const b of el.querySelectorAll('button, a.btn-primary, a.btn-ghost, a.btn-secondary')) {
      if (!visible(b)) continue;
      const r = b.getBoundingClientRect();
      const texto = (b.textContent ?? '').trim().slice(0, 40);
      if (r.right > ancho + 1 || r.left < -1) out.push(`botón fuera de la pantalla: «${texto}» ${quien(b)}`);
      if ((b as HTMLElement).scrollWidth > (b as HTMLElement).clientWidth + 2 && getComputedStyle(b).overflow !== 'visible') out.push(`botón con el texto cortado: «${texto}» ${quien(b)}`);
    }
    return out;
  });
  expect(fallos, `Diseño de «${nombre}»`).toEqual([]);
}

// ---- 2. Foto ------------------------------------------------------------------------
// Antes de la foto se quita lo que no es de la pantalla o cambia solo: la cabecera fija del
// panel (lleva contadores), la cuenta atrás de la hora de corte… y lo que cambia de un día
// a otro (fechas y referencias de envío) se sustituye por un texto fijo. Así ni la foto ni
// el tamaño de las cajas dependen del día en que se pasa la prueba.
// El aviso de festivo depende del calendario: sale o no según caiga la ventana de la fecha que
// se elige (la última que se ofrece, que salta un día al pasar la hora de corte).
const QUITAR = ['.topbar', '.ptar-cutoff-note', '.aviso-festivo'];
// Lo que cambia en cada envío pero ocupa sitio (el QR de la hoja de firma): se deja el hueco.
const TAPAR = ['.qr-movil-img img'];
async function fijar(page: Page, quitar: string[]) {
  await page.addStyleTag({ content: `${[...QUITAR, ...quitar].join(', ')} { display: none !important; } ${TAPAR.join(', ')} { visibility: hidden !important; }` });
  await page.evaluate(() => {
    const DIA = '(?:Lun|Mar|Mié|Jue|Vie|Sáb|Dom)';
    const MES = '(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)';
    const cambios: [RegExp, string][] = [
      [new RegExp(`${DIA}\\.? \\d{1,2}/\\d{1,2}/\\d{2,4}`, 'g'), 'Lun 01/01/26'],
      [/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g, '01/01/26'],
      [new RegExp(`(?:lunes|martes|miércoles|jueves|viernes|sábado|domingo),? \\d{1,2} de ${MES}(?: de \\d{4})?`, 'gi'), 'lunes 1 de enero'],
      [new RegExp(`\\b\\d{1,2} de ${MES}(?: de \\d{4})?`, 'gi'), '1 de enero'],
      [/GX\d{6,}/g, 'GX000000000'],
    ];
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      let t = n.nodeValue ?? '';
      const antes = t;
      for (const [re, por] of cambios) t = t.replace(re, por);
      if (t !== antes) n.nodeValue = t;
    }
  });
}

async function revisar(page: Page, nombre: string, raiz: Locator, quitar: string[] = []) {
  await expect(raiz).toBeVisible();
  await comprobarDiseno(page, nombre, raiz);
  const info = test.info();
  const rehaciendo = info.config.updateSnapshots === 'all' || info.config.updateSnapshots === 'changed';
  // Sin foto de referencia todavía (pantalla nueva): se avisa y no se compara; la foto se
  // crea al rehacerlas. Así una pantalla recién añadida no deja el CI en rojo.
  if (!rehaciendo && !existsSync(info.snapshotPath(`${nombre}.png`))) {
    info.annotations.push({ type: 'sin foto de referencia', description: nombre });
    return;
  }
  await fijar(page, quitar);
  await expect(raiz).toHaveScreenshot(`${nombre}.png`, { maxDiffPixelRatio: 0.01, animations: 'disabled', caret: 'hide' });
}

test.describe('vistas', () => {
  // Pantalla MUY alta (mismo ancho): las ventanas emergentes caben enteras y la foto las
  // recoge con sus botones de abajo, en vez de cortarlas por donde acaba la pantalla.
  test.beforeEach(async ({ page }) => {
    const v = page.viewportSize();
    if (v) await page.setViewportSize({ width: v.width, height: 2400 });
  });

  test('Nuevo envío, paso a paso, y la ventana de confirmar', async ({ page }) => {
    await entrar(page, 'cliente');
    await page.goto('/panel/nuevo-envio');
    const asistente = page.locator('#sec-nueva-carga');
    const sitio = page.locator('.ptar-route-row input[type=text]');
    await sitio.nth(0).fill('Sevilla'); await page.locator('.ptar-sug li').first().click();
    await sitio.nth(1).fill('Madrid'); await page.locator('.ptar-sug li').first().click();
    await revisar(page, 'nuevo-envio-1-ruta', asistente);
    await page.getByRole('button', { name: /Siguiente/ }).click();
    await revisar(page, 'nuevo-envio-2-mercancia', asistente);
    await page.getByRole('button', { name: /Siguiente/ }).click();
    // La ÚLTIMA fecha que se ofrece (la opción de después abre el calendario): nunca es
    // «hoy», que añade avisos según la hora.
    const fecha = page.locator('select').filter({ has: page.locator('option', { hasText: 'Elige la fecha de recogida' }) });
    await expect(fecha).toBeVisible();
    const dias = await fecha.locator('option').evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value).filter((v) => /^\d{4}-\d{2}-\d{2}$/.test(v)));
    expect(dias.length).toBeGreaterThan(0);
    await fecha.selectOption(dias[dias.length - 1]);
    // La entrega estimada va en su caja, ANTES del precio y fuera de la tarjeta del importe.
    const entrega = page.locator('#caja-entrega-estimada');
    await expect(entrega).toContainText('Fecha de entrega estimada');
    await expect(entrega).not.toContainText('Trayecto');
    await expect(page.locator('.ptar-sug-card')).not.toContainText('entrega estimada');
    await revisar(page, 'nuevo-envio-3-fecha', asistente);
    await page.getByRole('button', { name: /Ver resumen/ }).click();
    await expect(page.locator('.ptar-sug-card .alm-price-base')).toBeVisible();
    await revisar(page, 'nuevo-envio-4-revision', asistente);
    // La proforma propone al cliente su propio email, igual que a Dynamo el del cliente.
    await page.getByRole('button', { name: 'Ver proforma' }).click();
    await expect(page.locator('#prof-enviar-a')).toContainText('cliente@e2e.test');
    await expect(page.getByRole('button', { name: 'Enviar a otro email' })).toBeVisible();
    await page.locator('.dash-modal-card .dash-modal-close').click();
    await expect(page.locator('.dash-modal-card')).toHaveCount(0);
    await page.getByRole('button', { name: 'Crear envío' }).click();
    await revisar(page, 'confirmar-envio', page.locator('.dash-modal-card'));
  });

  test('Asignar transportista', async ({ page }) => {
    const id = await envioListo(page);
    await entrar(page, 'dynamo');
    await page.goto(`/panel/envios?ver=${id}`);
    await page.getByRole('button', { name: /Asignar transportista/ }).click();
    await page.fill('#as-tra', 'Transportes Prueba');
    await page.locator('.buscador-lista button', { hasText: 'Transportes Prueba' }).first().click();
    await expect(page.locator('.buscador-elegido')).toContainText('Transportes Prueba');
    await revisar(page, 'asignar-transportista', page.locator('.dash-modal-card'));
  });

  test('Hoja de firma del CMR', async ({ page }) => {
    // Un envío con su transportista y su camión, para que la hoja de firma salga completa.
    const id = await envioListo(page);
    const { data: tr } = await bd().from('transportistas').select('id').eq('cif', CIF_TRANSPORTISTA).single();
    const { error } = await bd().from('envios').update({ transportista_id: tr!.id, importe_transportista: 500, matricula_camion: '7777JKL', matricula_remolque: 'R7777JKL', conductor_nombre: 'Marta Rueda', conductor_telefono: '+34611222333' }).eq('id', id);
    expect(error).toBeNull();
    await entrar(page, 'dynamo');
    await page.goto(`/panel/envios?ver=${id}`);
    await page.getByRole('button', { name: /eCMR/ }).first().click();
    const href = await page.locator('a[href^="/cmr/"]').first().getAttribute('href');
    expect(href).toBeTruthy();
    await page.context().clearCookies();
    await page.goto(href!);
    await expect(page.getByRole('button', { name: 'Firmar' }).first()).toBeVisible();
    await revisar(page, 'firma-cmr', page.locator('body'));
  });
});
