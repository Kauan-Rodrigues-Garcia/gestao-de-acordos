/**
 * AdminDados.banco-dados-gate.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Regressão do item #8: o card "Banco de Dados / Migrations" é visível APENAS
 * para quem tem `ver_banco_dados` — que nasce ligada só no acesso total.
 *
 * ## O gate mudou de dono em 24/08/2026
 *
 * Era `isPerfilAdmin(perfil.perfil)` — uma lista de cargo escrita na tela. Hoje
 * é a chave do painel, e o comportamento nasceu idêntico.
 *
 * ## O card mudou de casa em 29/09/2026
 *
 * Morava em Configurações › Geral; o Mapa de Abas o levou para Administração ›
 * Dados e importações, junto com o «Importar acordos» (restaurar tabulações).
 * A chave veio junto. A checagem continua estática — renderizar as telas
 * exigiria supabase, auth e as sub-páginas lazy.
 *
 * O que se garante:
 *   1. O card não voltou para Configurações.
 *   2. A aba «Banco de dados» de Dados só aparece com `ver_banco_dados`, e a
 *      régua dela é a de `lib/mapaAbas.ts` — a mesma do menu.
 *   3. `isPerfilAdmin` não voltou a nenhuma das pontas.
 *   4. A sonda do card só LÊ (`select … limit(0)`).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ler = (rel: string) => readFileSync(resolve(__dirname, rel), 'utf-8');
const CONFIG = ler('../AdminConfiguracoes.tsx');
const DADOS  = ler('../AdminDados/index.tsx');
const MAPA   = ler('../../lib/mapaAbas.ts');
const CARD   = ler('../../components/admin/CardBancoDeDados.tsx');
const MENU   = ler('../../lib/menuLateral.ts');

describe('Dados e importações — gate do card "Banco de Dados / Migrations" (#8)', () => {
  it('o card saiu de Configurações', () => {
    expect(CONFIG).not.toMatch(/Banco de Dados \/ Migrations/);
    expect(CONFIG).not.toMatch(/CardBancoDeDados|ImportarAcordosCard/);
  });

  it('a régua pergunta ao PAINEL, e não ao cargo', () => {
    expect(MAPA).toMatch(/banco:\s*temPermissao\(\s*['"]ver_banco_dados['"]\s*\)/);
    expect(MAPA).toMatch(/restaurar:\s*temPermissao\(\s*['"]ver_banco_dados['"]\s*\)/);
    for (const src of [DADOS, MAPA, CARD]) expect(src).not.toMatch(/isPerfilAdmin\s*\(/);
  });

  it('as abas de Dados só aparecem pela régua de `abasDosDados`', () => {
    expect(DADOS).toMatch(/abasDosDados\(\s*temPermissao/);
    expect(DADOS).toMatch(/chave:\s*'banco'[\s\S]{0,120}visivel:\s*abas\.banco/);
    expect(DADOS).toMatch(/chave:\s*'restaurar'[\s\S]{0,120}visivel:\s*abas\.restaurar/);
  });

  it('o menu e a rota de Dados aceitam a mesma chave', () => {
    expect(MENU).toMatch(/label:\s*'Dados e importações'[\s\S]{0,220}permissoes:\s*\[\s*'ver_banco_dados'/);
    expect(MENU).toMatch(/ROUTE_PATHS\.ADMIN_DADOS\)\s*return\s+algumaAba\(abasDosDados/);
  });

  it('a sonda do card só lê a coluna', () => {
    expect(CARD).toMatch(/from\('acordos'\)\.select\('instituicao'\)\.limit\(0\)/);
    expect(CARD).toContain('Banco de Dados / Migrations');
  });

  it('Configurações continua com o item de menu só para administrador', () => {
    // super_admin passa pelo bypass. Se alguém relaxar isso no futuro, a
    // chave `ver_configuracoes` ainda segura a rota.
    expect(MENU).toMatch(
      /label:\s*['"]Configurações['"][\s\S]{0,180}roles:\s*\[\s*['"]administrador['"]\s*\]/,
    );
  });
});
