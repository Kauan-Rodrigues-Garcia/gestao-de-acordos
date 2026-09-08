import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:8080',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:8080',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    /*
     * `VITE_TENANT_SLUG` porque o app é multiempresa e resolve o tenant pelo
     * HOSTNAME (`src/lib/tenant.ts`). Em `localhost` nenhum domínio bate, e
     * `tenantSlug` fica vazio — o que desabilita o botão de cadastro
     * (`disabled={loading || tenantLoading || !tenantSlug}`) e fazia dois
     * testes esperarem para sempre por um clique que nunca era aceito.
     *
     * Não é remendo: sem tenant, a tela está CERTA em se recusar a enviar. O
     * que faltava era o teste dizer de qual empresa ele fala.
     */
    env: { VITE_TENANT_SLUG: 'pagueplay' },
  },
});
