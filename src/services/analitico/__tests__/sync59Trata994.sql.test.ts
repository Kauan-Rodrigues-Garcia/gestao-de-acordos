/**
 * O 994 diante do 59, conferido no SQL da migration.
 *
 * ## O que o banco mostrou (27/10/2026)
 *
 * O 59 já grava a Retenção no Jornada (R$ 49.071,25 em outubro). Com a linha
 * do 994 fora da sincronização, o mesmo pagamento podia ficar duas vezes — o
 * 994 com uma data ou forma, o 59 com outra.
 *
 * A migration 20261027220000 faz a sincronização tratar `relatorio_994` como
 * `relatorio_58`. Estes testes existem pelo mesmo motivo dos irmãos: a função
 * é reescrita inteira a cada `CREATE OR REPLACE`, e uma reescrita a partir de
 * 20261002180000 devolveria o 994 para fora da regra sem erro nenhum.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const MIGRATIONS = path.resolve(__dirname, '../../../../supabase/migrations');

function migration(sufixo: string): string {
  const arquivo = fs.readdirSync(MIGRATIONS).find(f => f.endsWith(sufixo));
  expect(arquivo, `migration *${sufixo} não encontrada`).toBeTruthy();
  return fs.readFileSync(path.join(MIGRATIONS, arquivo as string), 'utf8');
}

const BRUTO = migration('_sync_59_trata_994_como_58.sql');
const LISO = BRUTO.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ').replace(/\s+/g, ' ');

function corpoDe(nome: string): string {
  const i = LISO.indexOf(`FUNCTION public.${nome}`);
  expect(i, `função ${nome} não está na migration`).toBeGreaterThan(-1);
  const fim = LISO.indexOf('$function$;', i);
  return LISO.slice(i, fim === -1 ? undefined : fim);
}

const PREVIA = "('relatorio_58', 'relatorio_994')";
const TODAS = "('relatorio_58', 'relatorio_994', 'relatorio_59', 'contribuicao_59')";

describe('fn_mestre_sincronizar_analitico_aplicar — o 994 é prévia como o 58', () => {
  const corpo = corpoDe('fn_mestre_sincronizar_analitico_aplicar');

  it('nenhum ponto trata o 58 sem o 994', () => {
    expect(corpo).not.toMatch(/procedencia = 'relatorio_58'/);
    expect(corpo).not.toContain("('relatorio_58', 'relatorio_59', 'contribuicao_59')");
  });

  it('apaga o que saiu do 59 e atualiza o que mudou, 994 incluído', () => {
    // passo 1 (delete), passo 2 (linha do 59 que mudou), passo 4 (contribuição)
    expect(corpo.split(TODAS).length - 1).toBe(3);
  });

  it('preserva o 994 de hoje e de ontem que o 59 ainda não trouxe', () => {
    expect(corpo).toContain(`and not (a.procedencia in ${PREVIA} and a.data_pagamento >= v_hoje - 1`);
  });

  it('a linha assumida pelo 59 guarda a hora em que chegou pelo 994', () => {
    expect(corpo).toContain(`when a.procedencia in ${PREVIA} and a.operador_id is not distinct from m.operador_id then a.importado_em`);
    const chegada = corpo.slice(corpo.indexOf('create temp table _sync_chegada'), corpo.indexOf('group by a.codigo'));
    expect(chegada).toContain(`a.procedencia in ${PREVIA}`);
  });

  it('mantém a herança do mês anterior (20261002180000)', () => {
    expect(corpo).toContain("a.mes_referencia = (p_mes - interval '1 month')::date");
    expect(corpo).toContain('r.restaurado_em is not null');
  });
});

describe('fn_analitico_mudancas_do_mes — o vai e vem do 994 não é aviso', () => {
  const corpo = corpoDe('fn_analitico_mudancas_do_mes');

  it('deixa o 58 e o 994 de fora', () => {
    expect(corpo).toContain(`NOT IN ${PREVIA}`);
  });

  it('mantém o escopo de quem pergunta', () => {
    expect(corpo).toContain('v_escopo >= 3');
  });
});

it('depende da procedência criada em 20261027210000', () => {
  const anterior = migration('_analitico_relatorio_994_retencao_jornada.sql');
  expect(anterior).toContain("'relatorio_994'))");
});
