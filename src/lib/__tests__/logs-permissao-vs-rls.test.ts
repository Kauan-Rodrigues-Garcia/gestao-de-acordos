/**
 * logs-permissao-vs-rls.test.ts
 *
 * ## O defeito que este arquivo existia para impedir
 *
 * Até 2026-08-23, `logs_sis_admin` decidia por CARGO — uma lista escrita dentro
 * da policy — e `ver_logs` era uma chave do painel que ninguém no banco
 * consultava. Conceder `ver_logs` a outro cargo não dava acesso: dava uma ABA
 * VAZIA, porque o RLS devolvia zero linhas. Sem erro e sem explicação.
 *
 * Estes testes comparavam os dois lados e quebravam a CI quando o padrão da
 * chave prometia mais do que a lista de cargo permitia.
 *
 * ## Por que eles mudaram
 *
 * A policy passou a perguntar `fn_user_tem('ver_logs')`. Os dois lados não
 * podem mais divergir, porque viraram o mesmo lado — o que é uma garantia mais
 * forte do que a que se checava antes.
 *
 * O que ainda pode quebrar, e é o que se checa agora: alguém devolver a lista
 * de cargo para dentro da policy. Isso reabriria o defeito inteiro.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { PERMISSOES } from '../permissoes-catalogo';

const MIGRATIONS = path.resolve(__dirname, '../../../supabase/migrations');

/** A definição mais recente da política, pelo nome ordenável do arquivo. */
function policiaDeLogs(): string {
  const arquivo = fs.readdirSync(MIGRATIONS)
    .filter(f => f.endsWith('.sql'))
    .sort()
    .reverse()
    .find(f => /CREATE\s+POLICY\s+"?logs_sis_admin"?/i
      .test(fs.readFileSync(path.join(MIGRATIONS, f), 'utf8')));

  if (!arquivo) throw new Error('Nenhuma migration define a política logs_sis_admin.');

  const sql = fs.readFileSync(path.join(MIGRATIONS, arquivo), 'utf8');
  const i = sql.search(/CREATE\s+POLICY\s+"?logs_sis_admin"?/i);
  // Do CREATE até o `;` que fecha — a expressão inteira, e não só a primeira linha.
  return sql.slice(i, sql.indexOf(';', i));
}

const POLICY = policiaDeLogs();

describe('a trilha de auditoria obedece ao painel', () => {
  it('a política pergunta pela chave, e não por cargo', () => {
    expect(
      /fn_user_tem\(\s*'ver_logs'\s*\)/.test(POLICY),
      'logs_sis_admin deixou de perguntar por `ver_logs`',
    ).toBe(true);
  });

  it('nenhuma lista de cargo voltou para dentro da política', () => {
    // Era este o defeito: a lista no banco e a chave na tela discordando em
    // silêncio. Se `fn_user_has_any_role` voltar aqui, ele volta junto.
    expect(
      /fn_user_has_any_role/i.test(POLICY),
      'logs_sis_admin voltou a decidir por cargo — o painel deixa de mandar',
    ).toBe(false);
  });

  it('`ver_logs` continua no catálogo, senão a política ficaria sem dono', () => {
    const chave = PERMISSOES.find(p => p.key === 'ver_logs');
    expect(chave, '`ver_logs` sumiu do catálogo').toBeDefined();
  });

  it('o padrão de `ver_logs` não liga a trilha para ninguém sem decisão', () => {
    /*
     * Agora que a policy segue a chave, o padrão vira concessão de verdade —
     * antes era inócuo, porque o RLS negava de qualquer jeito. Ligar alguém
     * aqui passa a dar acesso à auditoria no mesmo deploy.
     */
    const chave = PERMISSOES.find(p => p.key === 'ver_logs')!;
    const ligados = Object.entries(chave.padrao).filter(([, v]) => v).map(([c]) => c);
    expect(ligados, 'alguém nasceria com a trilha de auditoria ligada').toEqual([]);
  });
});
