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
  reporter: process.env.CI ? [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]] : 'list',
  use: {
    baseURL: process.env.E2E_URL ?? 'http://localhost:3000',
    locale: 'es-ES',
    timezoneId: 'Europe/Madrid',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
