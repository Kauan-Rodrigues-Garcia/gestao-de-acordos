/**
 * logs-retencao.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * A retenção da trilha é 730 dias — faixa única, decidida em 17/08/2026. Esse
 * número vive em TRÊS lugares que não conversam entre si:
 *
 *   1. `RETENCAO_LOGS_DIAS`, que preenche o diálogo de expurgo;
 *   2. o `DEFAULT` de `fn_logs_expurgar`, para uma chamada sem argumento;
 *   3. o trabalho `logs-retencao-730d` do pg_cron, que aplica sozinho.
 *
 * Divergência aqui não dá erro em lugar nenhum — dá apagamento com o prazo
 * errado, uma vez por mês, em silêncio, numa tabela que existe justamente para
 * não ter buracos. É o pior tipo de defeito para se descobrir depois.
 *
 * O `180` fixo no diálogo era a versão anterior desse problema: sugeria meio
 * ano quando ninguém havia decidido nada, e depois de haver política teria
 * convidado o administrador a apagar ano e meio de trilha achando que estava
 * seguindo a regra.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { RETENCAO_LOGS_DIAS, RETENCAO_LOGS_MINIMA_DIAS } from '../logs-catalogo';

const RAIZ = path.resolve(__dirname, '../../..');
const MIGRATIONS = path.join(RAIZ, 'supabase/migrations');

/** A migration que estabelece a política, pelo nome. */
const SQL = (() => {
  // `endsWith('.sql')`: um `.sql.bk`/`.sql.orig` no diretório casaria com o
  // padrão e, mais longo com o mesmo prefixo, ordenaria à frente do arquivo real
  // — a guarda leria o backup e aprovaria divergência no arquivo verdadeiro.
  const arquivo = fs.readdirSync(MIGRATIONS)
    .filter(f => f.endsWith('.sql') && /logs_retencao/.test(f))
    .sort()
    .reverse()[0];
  if (!arquivo) throw new Error('Nenhuma migration de retenção de logs encontrada.');
  return fs.readFileSync(path.join(MIGRATIONS, arquivo), 'utf8');
})();

describe('a política tem um número, e é o mesmo em todo lugar', () => {
  it('o front usa 730 dias', () => {
    expect(RETENCAO_LOGS_DIAS).toBe(730);
  });

  it('o trabalho agendado aplica o mesmo prazo', () => {
    expect(SQL).toContain(`fn_logs_retencao_aplicar(${RETENCAO_LOGS_DIAS})`);
  });

  it('o padrão da função de expurgo manual acompanha a política', () => {
    // `create or replace function public.fn_logs_expurgar(p_dias integer default 730, ...`
    const assinatura = /fn_logs_expurgar\s*\(\s*\n?\s*p_dias\s+integer\s+default\s+(\d+)/i.exec(SQL);
    expect(assinatura, 'a assinatura de fn_logs_expurgar mudou de forma').not.toBeNull();
    expect(Number(assinatura![1])).toBe(RETENCAO_LOGS_DIAS);
  });

  it('o piso do expurgo manual é o mesmo dos dois lados', () => {
    expect(RETENCAO_LOGS_MINIMA_DIAS).toBe(30);
    expect(SQL).toMatch(/p_dias\s*<\s*30/);
  });
});

describe('o trabalho automático é seguro por construção', () => {
  /**
   * O piso automático é maior que o manual de propósito: o botão tem um humano
   * que digitou "EXPURGAR" e escolheu o número; o cron não tem ninguém olhando
   * e roda todo mês.
   */
  it('o piso automático é mais conservador que o manual', () => {
    const piso = /p_dias\s*<\s*365/.exec(SQL);
    expect(piso, 'o piso de 365 dias da retenção automática saiu').not.toBeNull();
    expect(365).toBeGreaterThan(RETENCAO_LOGS_MINIMA_DIAS);
  });

  it('não é alcançável por quem tem um token', () => {
    expect(SQL).toMatch(
      /revoke\s+all\s+on\s+function\s+public\.fn_logs_retencao_aplicar\(integer\)\s+from\s+public,\s*anon,\s*authenticated/i,
    );
  });

  /**
   * Um trabalho destrutivo silencioso é indistinguível de um trabalho que parou
   * de rodar. Nos primeiros dois anos a linha de zero remoções vai ser a única
   * coisa que ele produz — e é ela que prova que está vivo.
   */
  it('registra a execução mesmo quando não apaga nada', () => {
    expect(SQL).toMatch(/nenhum registro com mais de/i);
    expect(SQL).toMatch(/insert\s+into\s+public\.logs_sistema/i);
  });

  /** `fn_log_registrar` sem sessão não resolve empresa e devolve NULL sem inserir. */
  it('grava direto na tabela em vez de passar por fn_log_registrar', () => {
    const corpo = /create or replace function public\.fn_logs_retencao_aplicar[\s\S]*?\n\$\$;/i.exec(SQL);
    expect(corpo).not.toBeNull();
    expect(corpo![0]).not.toMatch(/fn_log_registrar\s*\(/);
  });

  it('conta empresa por empresa, não um total global', () => {
    const corpo = /create or replace function public\.fn_logs_retencao_aplicar[\s\S]*?\n\$\$;/i.exec(SQL);
    expect(corpo![0]).toMatch(/for\s+r\s+in\s+select\s+id,\s*nome\s+from\s+public\.empresas/i);
    expect(corpo![0]).toMatch(/where\s+empresa_id\s*=\s*r\.id/i);
  });
});

describe('o agendamento respeita o que já existe', () => {
  /**
   * `comemoracao-faxina` roda às 04:17 e `composicao-mes-congelar` às 02:50.
   * Nada quebraria numa colisão — o pg_cron roda em paralelo —, mas não há
   * motivo para dois DELETE grandes disputarem I/O na mesma janela.
   */
  it('não usa o horário de um trabalho já agendado', () => {
    const agenda = /cron\.schedule\(\s*'logs-retencao-730d',\s*'([^']+)'/.exec(SQL);
    expect(agenda, 'o agendamento mudou de forma').not.toBeNull();
    expect(['17 4 * * *', '50 2 * * *', '*/10 * * * *']).not.toContain(agenda![1]);
  });

  it('o nome segue a convenção kebab-case dos outros trabalhos', () => {
    expect(SQL).toMatch(/cron\.schedule\(\s*'logs-retencao-730d'/);
    expect(SQL).not.toMatch(/cron\.schedule\(\s*'logs_retencao/);
  });

  it('reaplicar a migration não duplica o trabalho', () => {
    expect(SQL).toMatch(/cron\.unschedule\('logs-retencao-730d'\)/);
  });
});
