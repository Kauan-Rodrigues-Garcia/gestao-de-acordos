import { test, expect } from '@playwright/test';

// ─── Redirecionamentos de proteção de rota ───────────────────────────────────
// Estes testes verificam que rotas protegidas redirecionam para /login
// quando o usuário não está autenticado — sem necessitar de credenciais reais.

test.describe('Rotas protegidas redirecionam para login', () => {
  const rotasProtegidas = [
    '/',
    '/acordos',
    '/acordos/novo',
    '/lider',
    '/diretoria',
    '/admin/usuarios',
    '/admin/configuracoes',
    '/admin/lixeira',
  ];

  for (const rota of rotasProtegidas) {
    test(`${rota} → /login quando não autenticado`, async ({ page }) => {
      await page.goto(`/#${rota}`);
      // Aguarda carregamento (auth check é assíncrono)
      await page.waitForTimeout(1500);
      await expect(page).toHaveURL(/\/#\/login/);
    });
  }
});

// ─── Rotas públicas não redirecionam ─────────────────────────────────────────

test.describe('Rotas públicas acessíveis sem autenticação', () => {
  test('/login carrega sem redirecionar', async ({ page }) => {
    await page.goto('/#/login');
    await expect(page).toHaveURL(/\/#\/login/);
    await expect(page.getByRole('button', { name: /entrar/i })).toBeVisible();
  });

  test('/registro carrega sem redirecionar', async ({ page }) => {
    await page.goto('/#/registro');
    await expect(page).toHaveURL(/\/#\/registro/);
    await expect(page.getByRole('button', { name: /criar conta/i })).toBeVisible();
  });
});

// ─── 404 ─────────────────────────────────────────────────────────────────────

test('rota inexistente exibe página 404', async ({ page }) => {
  await page.goto('/#/rota-que-nao-existe');
  await expect(page.getByText(/não encontrada|404|page not found/i)).toBeVisible();
});
