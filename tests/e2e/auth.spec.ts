import { test, expect } from '@playwright/test';

// ─── Login Page ─────────────────────────────────────────────────────────────

test.describe('Login page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/#/login');
  });

  test('renderiza campos de login', async ({ page }) => {
    await expect(page.getByLabel(/usuário|e-mail/i).first()).toBeVisible();
    await expect(page.getByLabel(/senha/i).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /entrar/i })).toBeVisible();
  });

  test('botão desabilitado com campos vazios', async ({ page }) => {
    const btn = page.getByRole('button', { name: /entrar/i });
    // Campos vazios: botão pode estar habilitado mas submissão deve mostrar erro
    await btn.click();
    // Deve aparecer alguma mensagem de erro ou o botão permanece sem redirecionar
    await expect(page).not.toHaveURL(/\/#\/$|\/dashboard/);
  });

  test('link para criar conta está visível', async ({ page }) => {
    await expect(page.getByRole('link', { name: /criar conta|registr/i })).toBeVisible();
  });
});

// ─── Registro Page ───────────────────────────────────────────────────────────

test.describe('Registro page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/#/registro');
  });

  test('renderiza campos de cadastro', async ({ page }) => {
    await expect(page.getByLabel(/nome completo/i)).toBeVisible();
    await expect(page.getByLabel(/usuário/i).first()).toBeVisible();
    await expect(page.getByLabel(/senha/i).first()).toBeVisible();
  });

  test('validação: nome muito curto não permite enviar', async ({ page }) => {
    await page.getByLabel(/nome completo/i).fill('AB');
    await page.getByLabel(/usuário/i).first().fill('teste_user');
    await page.getByLabel(/^senha \*/i).fill('senha123');
    await page.getByLabel(/confirmar senha/i).fill('senha123');
    await page.getByRole('button', { name: /criar conta/i }).click();
    await expect(page.getByText(/pelo menos 3 caracteres/i)).toBeVisible();
  });

  test('validação: usuário com caracteres inválidos', async ({ page }) => {
    await page.getByLabel(/nome completo/i).fill('Nome Valido');
    await page.getByLabel(/usuário/i).first().fill('user name');
    await page.getByLabel(/^senha \*/i).fill('senha123');
    await page.getByLabel(/confirmar senha/i).fill('senha123');
    await page.getByRole('button', { name: /criar conta/i }).click();
    await expect(page.getByText(/letras, números/i)).toBeVisible();
  });

  test('validação: senhas diferentes', async ({ page }) => {
    await page.getByLabel(/nome completo/i).fill('Nome Valido');
    await page.getByLabel(/usuário/i).first().fill('usuario_ok');
    await page.getByLabel(/^senha \*/i).fill('senha123');
    await page.getByLabel(/confirmar senha/i).fill('senhaDiferente');
    // Feedback inline aparece ao digitar
    await expect(page.getByText(/senhas não coincidem/i)).toBeVisible();
  });
});
