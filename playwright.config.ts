// Pruebas en navegador (Playwright) de los 5 flujos clave, contra un Supabase LOCAL con
// datos de prueba (tests/e2e/semilla.mjs). En el CI: supabase start → semilla → next start.
// En local: E2E_URL=http://localhost:3000 npx playwright test
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  workers: 1,                       // los flujos se encadenan (el envío del 1 sigue en el 2…)
  retries: process.env.CI ? 1 : 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  // Fotos de referencia de las pantallas (tests/e2e/vistas.spec.ts): una carpeta por navegador.
  // Se sacan SIEMPRE en el CI (E2E_FOTOS_DIR las desvía en local para no mezclarlas).
  snapshotPathTemplate: `${process.env.E2E_FOTOS_DIR ?? 'tests/e2e/fotos'}/{projectName}/{arg}{ext}`,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]] : 'list',
  use: {
    baseURL: process.env.E2E_URL ?? 'http://localhost:3000',
    locale: 'es-ES',
    timezoneId: 'Europe/Madrid',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  // UN proyecto por pasada (E2E_PROYECTO): los flujos se encadenan y cambian la base de
  // datos, así que cada navegador necesita la suya limpia. En el CI son tres trabajos en
  // paralelo, cada uno con su Supabase:
  //   chromium · Chrome de escritorio (el de siempre)
  //   safari   · el motor de Safari (WebKit) en escritorio
  //   movil    · un iPhone (WebKit, pantalla de teléfono y dedo)
  // (E2E_MOVIL_MOTOR=chromium pasa el móvil con un Pixel, para probar en local sin WebKit.)
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'safari', use: { ...devices['Desktop Safari'] } },
    { name: 'movil', use: { ...(process.env.E2E_MOVIL_MOTOR === 'chromium' ? devices['Pixel 7'] : devices['iPhone 14']) } },
  ].filter((p) => p.name === (process.env.E2E_PROYECTO ?? 'chromium')),
});
