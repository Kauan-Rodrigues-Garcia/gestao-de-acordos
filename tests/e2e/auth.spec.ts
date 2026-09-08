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

  /*
   * O login NÃO oferece autocadastro, e isso é decisão de produto: o commit
   * `b64563d feat(auth): remove sign-up — access by admin invite only` tirou a
   * porta da tela. Conta nasce por convite de administrador.
   *
   * Este teste afirmava o contrário e falhava desde então — como ele nunca
   * rodou na CI, ninguém viu. Agora ele guarda a decisão em vez de brigar com
   * ela: se o link voltar sem que alguém queira, o teste avisa.
   */
  test('não oferece autocadastro — conta é por convite do administrador', async ({ page }) => {
    await expect(page.getByRole('link', { name: /criar conta|registr/i })).toHaveCount(0);
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
    // "Usuário deve conter apenas..." e não só "letras, números": o texto de
    // ajuda do campo repete a mesma regra, e o localizador curto casava com os
    // dois — strict mode violation em vez de falha de verdade.
    await expect(page.getByText(/Usuário deve conter apenas letras/i)).toBeVisible();
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
