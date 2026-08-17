/**
 * logs-contexto-de-rede.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * De onde veio a ação é metade de um registro de auditoria. Em 17/08/2026 a
 * produção mostrou que a metade estava faltando justamente nas duas ações mais
 * sensíveis do sistema:
 *
 *   impersonar_inicio   103 linhas — 0 com IP, 0 com navegador
 *   senha_redefinida     28 linhas — 0 com IP, 0 com navegador
 *
 * As duas são escritas pelas funções serverless em `api/`, com `service_role` e
 * INSERT direto — o que está certo e documentado, porque ali não existe
 * `auth.uid()` e `fn_log_registrar` gravaria autor nulo. O que faltava era
 * repassar o endereço de quem chamou.
 *
 * Duas defesas foram criadas, e este arquivo guarda as duas:
 *
 *   1. no banco, `trg_log_contexto_padrao` completa `ip`/`user_agent` quando o
 *      INSERT não os traz — cobre os seis RPCs que escrevem log direto e
 *      qualquer função futura;
 *   2. em `api/`, o handler manda o IP REAL do cliente. O gatilho não serve
 *      aqui: o cabeçalho que o Postgres veria naquela chamada é o do servidor
 *      da Vercel, não o de quem clicou.
 *
 * O item 2 não dá para testar por unidade sem subir a função inteira. O que dá,
 * e é o que pega a regressão real — alguém acrescentar um terceiro handler que
 * grava log e esquecer o endereço —, é checar o CONTRATO no fonte.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const RAIZ = path.resolve(__dirname, '../../..');
const API = path.join(RAIZ, 'api');
const MIGRATIONS = path.join(RAIZ, 'supabase/migrations');

/** Arquivos de `api/` que gravam em `logs_sistema` por REST. */
function handlersQueGravamLog(): string[] {
  if (!fs.existsSync(API)) return [];
  return fs.readdirSync(API)
    .filter(f => /\.ts$/.test(f))
    .filter(f => /rest\/v1\/logs_sistema/.test(fs.readFileSync(path.join(API, f), 'utf8')));
}

describe('os handlers serverless registram de onde a ação partiu', () => {
  const handlers = handlersQueGravamLog();

  it('existem handlers gravando log — senão este teste não guarda nada', () => {
    expect(handlers.length).toBeGreaterThan(0);
  });

  it.each(handlersQueGravamLog())('%s manda ip e user_agent', (arquivo) => {
    const fonte = fs.readFileSync(path.join(API, arquivo), 'utf8');

    expect(
      /\bip:\s*enderecoCliente\(req\)/.test(fonte),
      `${arquivo} grava em logs_sistema sem mandar o IP do cliente. `
      + `O gatilho do banco NÃO cobre este caso: ali o cabeçalho é o do servidor `
      + `da Vercel. Use \`ip: enderecoCliente(req)\`.`,
    ).toBe(true);

    expect(
      /user_agent:\s*header\(req,\s*'user-agent'\)/.test(fonte),
      `${arquivo} grava em logs_sistema sem o navegador de quem chamou.`,
    ).toBe(true);
  });

  /**
   * `x-forwarded-for` chega como cadeia quando há intermediários
   * ("cliente, proxy1, proxy2"). Guardar a cadeia inteira polui a coluna, e
   * guardar o ÚLTIMO registra o proxy em vez da pessoa.
   */
  it.each(handlersQueGravamLog())('%s pega o primeiro endereço da cadeia', (arquivo) => {
    const fonte = fs.readFileSync(path.join(API, arquivo), 'utf8');
    const fn = /function enderecoCliente[\s\S]*?\n}/.exec(fonte);
    expect(fn, `${arquivo} não define enderecoCliente`).not.toBeNull();
    expect(fn![0]).toMatch(/split\(','\)\[0\]/);
    expect(fn![0], 'cabeçalho é entrada externa: corte o tamanho').toMatch(/slice\(0,\s*400\)/);
  });
});

describe('o banco completa o contexto de quem esqueceu', () => {
  const sql = fs.readdirSync(MIGRATIONS)
    .filter(f => f.endsWith('.sql'))
    .map(f => fs.readFileSync(path.join(MIGRATIONS, f), 'utf8'))
    .join('\n');

  it('existe gatilho BEFORE INSERT em logs_sistema', () => {
    expect(sql).toMatch(/create\s+trigger\s+trg_log_contexto_padrao/i);
    expect(sql).toMatch(/before\s+insert\s+on\s+public\.logs_sistema/i);
  });

  /**
   * Só completa o que faltou. Se sobrescrevesse, apagaria justamente o IP real
   * que os handlers de `api/` acabaram de mandar, trocando-o pelo endereço do
   * servidor — o oposto da correção.
   */
  it('preenche apenas quando o campo vem nulo', () => {
    expect(sql).toMatch(/if\s+new\.ip\s+is\s+null\s+then/i);
    expect(sql).toMatch(/if\s+new\.user_agent\s+is\s+null\s+then/i);
  });

  it('o gatilho fica fora do alcance do PostgREST', () => {
    expect(sql).toMatch(
      /revoke\s+all\s+on\s+function\s+public\.fn_log_contexto_padrao\(\)\s+from\s+public,\s*anon,\s*authenticated/i,
    );
  });
});
