/**
 * logs-permissao-vs-rls.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * A permissão `ver_logs` abre a ABA e também decide quem LÊ a trilha no RLS.
 * Antes eram dois sistemas diferentes e, em 17/08/2026, eles discordavam:
 *
 *   • o catálogo concedia `ver_logs` por padrão a gerência e diretoria;
 *   • a política `logs_sis_admin` só admite `fn_user_is_super_admin()` ou o
 *     cargo `administrador` — que NÃO EXISTE nesta base (os cargos são
 *     diretoria, elite, gerencia, lider, operador, ouvidoria, super_admin).
 *
 * Resultado em produção: dois diretores da PaguePlay viam a aba de Logs e
 * recebiam ZERO linhas, e mais dois cargos (elite, gerência) estavam liberados
 * esperando alguém para afetar. `fn_logs_resumo` é SECURITY INVOKER, então até
 * os números do painel vinham zerados. Nenhum erro na tela — só o vazio, que
 * qualquer um lê como sistema quebrado.
 *
 * A matriz agora é a fonte única: a mesma chave governa menu, rota e política.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { PERMISSOES, CARGOS_CONFIGURAVEIS } from '../permissoes-catalogo';

const MIGRATIONS = path.resolve(__dirname, '../../../supabase/migrations');

/**
 * A política mais recente da trilha, extraída do SQL.
 *
 * Lê a definição MAIS RECENTE, pelo nome ordenável do arquivo: se uma migration
 * futura reescrever a política, o teste passa a comparar contra ela em vez de
 * contra uma cópia envelhecida aqui.
 */
function politicaQueLeATrilha(): { arquivo: string; sql: string } {
  const arquivo = fs.readdirSync(MIGRATIONS)
    .filter(f => f.endsWith('.sql'))
    .sort()
    .reverse()
    .find(f => /CREATE\s+POLICY\s+(?:"?logs_sis_admin"?|permissoes3_logs_select_gate)/i
      .test(fs.readFileSync(path.join(MIGRATIONS, f), 'utf8')));

  if (!arquivo) throw new Error('Nenhuma migration define a política de leitura dos logs.');

  const sql = fs.readFileSync(path.join(MIGRATIONS, arquivo), 'utf8');
  return { arquivo, sql };
}

const RLS = politicaQueLeATrilha();

const VER_LOGS = PERMISSOES.find(p => p.key === 'ver_logs');

describe('a política do banco continua sendo o piso', () => {
  it('a política mais recente consulta `ver_logs` na matriz', () => {
    expect(RLS.sql).toMatch(
      /CREATE\s+POLICY\s+permissoes3_logs_select_gate[\s\S]*?fn_tem_permissao\s*\(\s*'ver_logs'/i,
    );
  });

  it('o catálogo tem a chave `ver_logs`', () => {
    expect(VER_LOGS, 'a permissão ver_logs saiu do catálogo').toBeDefined();
  });
});

describe('`ver_logs` usa somente cargos reconhecidos pela matriz', () => {
  it('todo cargo do padrão é configurável', () => {
    const desconhecidos = Object.keys(VER_LOGS!.padrao ?? {})
      .filter(cargo => !(CARGOS_CONFIGURAVEIS as readonly string[]).includes(cargo));
    expect(desconhecidos).toEqual([]);
  });
});

/**
 * A migration que desligou a permissão tem de continuar existindo — sem ela,
 * um banco restaurado de backup antigo volta com as 6 pessoas na mesma
 * situação.
 */
describe('a correção está registrada em migration', () => {
  it('a migration dinâmica é a definição mais recente', () => {
    expect(RLS.arquivo).toBe('20260820145356_permissoes_totais.sql');
  });
});
