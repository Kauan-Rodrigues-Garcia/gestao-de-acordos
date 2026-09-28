/**
 * A guarda que o Plantão Elite depende, conferida no SQL da migration.
 *
 * ## O incidente (28/09/2026)
 *
 *   10:41  o líder importa o 58 do Receptivo: Matheus com R$ 4.925,66 pagos
 *          hoje.
 *   11:07  o robô do 59 sincroniza. O 59 ainda não traz esses pagamentos, e
 *          `fn_mestre_sincronizar_analitico_aplicar` apagava toda linha que o
 *          59 não tivesse — 58 incluído. O Matheus voltava para R$ 234,01.
 *
 * Não é o 59 errado, é o 59 ATRASADO: tudo o que a sincronização tirou do 58
 * entre 22 e 26/09 apareceu no 59 depois, na mesma data.
 *
 * A migration 20260928200000 consertou. Estes testes existem porque a guarda
 * mora dentro de um `delete ... where` de trinta linhas, numa função que é
 * reescrita inteira a cada `CREATE OR REPLACE`: some sem deixar rastro, e o
 * sintoma só aparece no Plantão Elite de um dia de movimento. Foi assim que
 * ela nunca existiu até agora.
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

const BRUTO = migration('_sync_59_preserva_58_recente.sql');
const SQL = BRUTO.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ');
/** Espaços colapsados: a asserção não depende da quebra de linha. */
const LISO = SQL.replace(/\s+/g, ' ');

/** O corpo de uma das duas funções que a migration reescreve. */
function corpoDe(nome: string): string {
  const i = LISO.indexOf(`FUNCTION public.${nome}`);
  expect(i, `função ${nome} não está na migration`).toBeGreaterThan(-1);
  const fim = LISO.indexOf('$function$;', i);
  return LISO.slice(i, fim === -1 ? undefined : fim);
}

describe('as duas funções da sincronização estão na migration', () => {
  /*
   * A troca de fonte do setor para o 59 (`..._interno`) faz o mesmo delete. Uma
   * guarda só numa delas deixa o buraco aberto pelo outro caminho.
   */
  it('a do lote e a da troca de fonte do setor', () => {
    expect(LISO).toContain('FUNCTION public.fn_mestre_sincronizar_analitico_aplicar');
    expect(LISO).toContain('FUNCTION public.fn_mestre_aplicar_no_analitico_interno');
  });
});

describe.each([
  ['fn_mestre_sincronizar_analitico_aplicar'],
  ['fn_mestre_aplicar_no_analitico_interno'],
])('%s — o 58 recente não é apagado', (nome) => {
  const corpo = corpoDe(nome);

  it('ancora «hoje» no fuso de São Paulo, não no do servidor', () => {
    // `now()::date` puro viraria o dia às 21h de Brasília e a guarda cairia
    // justamente no fim do plantão.
    expect(corpo).toMatch(/now\(\) at time zone 'America\/Sao_Paulo'\)::date/);
  });

  it('a janela é hoje e ontem', () => {
    expect(corpo).toMatch(/data_pagamento >= v_hoje - 1/);
  });

  it('a guarda vale só para o 58', () => {
    expect(corpo).toMatch(/a\.procedencia = 'relatorio_58' and a\.data_pagamento >= v_hoje - 1/);
  });

  it('a guarda casa por NR + data, sem exigir forma nem usuário', () => {
    /*
     * De propósito: o 59 pode trazer o mesmo pagamento com outra forma ou
     * outro operador. Exigir a chave inteira faria a linha do 58 sobreviver ao
     * lado da do 59 — contagem dupla, que é o defeito oposto.
     */
    const guarda = corpo.slice(corpo.indexOf("a.procedencia = 'relatorio_58' and a.data_pagamento >= v_hoje - 1"));
    expect(guarda).toMatch(/\.codigo = a\.codigo and \w+\.data_pagamento = a\.data_pagamento\s*\)/);
    expect(guarda.slice(0, 400)).not.toMatch(/forma_pagamento = a\.forma_pagamento/);
  });

  it('o 59 que já trouxe o NR manda — a linha do 58 sai', () => {
    /*
     * A guarda é `and not (é do 58 E é recente E o 59 não conhece)`: assim que
     * o 59 conhece, a condição inteira cai e o delete pega a linha do 58.
     *
     * As duas funções consultam a mesma coisa por caminhos diferentes: a
     * horária cruza `_sync_59` e `_sync_contrib` direto; a da troca de fonte
     * pré-calcula a união das duas em `_aplicar_59_recente`.
     */
    expect(corpo).toMatch(/and not \(a\.procedencia = 'relatorio_58'/);
    const guarda = corpo.slice(corpo.indexOf("and not (a.procedencia = 'relatorio_58'"));
    if (nome === 'fn_mestre_sincronizar_analitico_aplicar') {
      expect(guarda).toContain('_sync_59');
      expect(guarda).toContain('_sync_contrib');
    } else {
      expect(guarda).toContain('_aplicar_59_recente');
    }
  });
});

describe('a troca de fonte do setor monta a mesma janela', () => {
  /*
   * `_aplicar_59_recente` é a união do que o 59 projeta com o que outro setor
   * contribuiu, nos dois últimos dias. Perder o `union` deixaria a
   * contribuição de fora e o 58 dela sobreviveria ao lado da linha do 59.
   */
  const corpo = corpoDe('fn_mestre_aplicar_no_analitico_interno');

  it('une projeção e contribuição', () => {
    const tabela = corpo.slice(
      corpo.indexOf('create temp table _aplicar_59_recente'),
      corpo.indexOf('select coalesce(sum(valor_recebido), 0) into v_valor_antes'),
    );
    expect(tabela).toContain('vw_mestre_projecao_analitico');
    expect(tabela).toContain('vw_mestre_contribuicao_analitico');
    expect(tabela).toContain('union');
  });

  it('a janela da tabela é a mesma do delete: hoje e ontem', () => {
    const tabela = corpo.slice(corpo.indexOf('create temp table _aplicar_59_recente'));
    const janelas = tabela.slice(0, tabela.indexOf('v_valor_antes')).match(/data_pagamento >= v_hoje - 1/g) ?? [];
    expect(janelas.length).toBe(2);
  });

  it('o snapshot e o delete usam exatamente a mesma condição', () => {
    // Divergir aqui apagaria linha que o snapshot não guardou.
    const cond = /a\.procedencia in \('relatorio_58', 'relatorio_59', 'contribuicao_59'\) and not \(a\.procedencia = 'relatorio_58' and a\.data_pagamento >= v_hoje - 1 and not exists \(select 1 from _aplicar_59_recente r where r\.codigo = a\.codigo and r\.data_pagamento = a\.data_pagamento\)\)/g;
    expect((corpo.match(cond) ?? []).length).toBe(2);
  });
});

describe('a hora de chegada não pula de faixa', () => {
  /*
   * O Plantão Elite monta o quadro pela hora em que a linha CHEGOU
   * (`importado_em`). Se a sincronização carimbasse `now()`, todo o 58 do dia
   * pularia para a faixa das 11h quando o robô passasse — o quadro mentiria
   * sobre a hora mesmo com o valor certo.
   */
  const corpo = corpoDe('fn_mestre_sincronizar_analitico_aplicar');

  it('existe a tabela com a chegada original do 58', () => {
    expect(corpo).toContain('_sync_chegada');
    expect(corpo).toMatch(/min\(a\.importado_em\) as chegou/);
    expect(corpo).toMatch(/_sync_chegada[\s\S]*?procedencia = 'relatorio_58'/);
  });

  it('o update guarda a hora quando a linha era do 58 e o operador não mudou', () => {
    expect(corpo).toMatch(
      /importado_em = case when a\.procedencia = 'relatorio_58' and a\.operador_id is not distinct from m\.operador_id then a\.importado_em else now\(\) end/,
    );
  });

  it('a troca de operador carimba a hora nova', () => {
    // Mudou de dono: a linha é outra história, e a hora de chegada dela é agora.
    const trecho = corpo.slice(corpo.indexOf('importado_em = case'));
    expect(trecho.slice(0, 200)).toContain('else now() end');
  });

  it('o insert do 59 reaproveita a chegada do 58 quando existe', () => {
    expect(corpo).toMatch(/coalesce\(ch\.chegou, now\(\)\)/);
    expect(corpo).toMatch(/left join _sync_chegada ch on ch\.codigo = n\.codigo and ch\.data_pagamento = n\.data_pagamento/);
  });
});

describe('o que a guarda NÃO pode ter mudado', () => {
  const corpo = corpoDe('fn_mestre_sincronizar_analitico_aplicar');

  it('o que sai continua indo para o snapshot antes do delete', () => {
    // `analitico_removidos` é o registro do que a importação apagou
    // (migration 20260914021223). Sem ele o rollback não existe.
    expect(corpo).toContain('insert into analitico_removidos');
    expect(corpo.indexOf('delete from analitico_recebimentos'))
      .toBeLessThan(corpo.indexOf('insert into analitico_removidos'));
  });

  it('correção manual segue fora do alcance do delete', () => {
    // Só estas três procedências são apagadas; 'manual' nunca entra.
    expect(corpo).toMatch(
      /a\.procedencia in \('relatorio_58', 'relatorio_59', 'contribuicao_59'\)/,
    );
    expect(corpo).not.toMatch(/procedencia in \([^)]*'manual'/);
  });

  it('a troca de dono zera a tabulação, como antes', () => {
    expect(corpo).toMatch(/status_tabulacao = case when a\.operador_id is distinct from m\.operador_id then 'nao_tabulado'/);
  });
});

describe('a migration é aplicável mais de uma vez', () => {
  it('só CREATE OR REPLACE, nada de DROP de tabela', () => {
    expect(BRUTO).toMatch(/CREATE OR REPLACE FUNCTION/);
    // Os `drop table if exists` são das temporárias do próprio corpo.
    const dropsDeVerdade = BRUTO.match(/drop table if exists (?!_sync|_aplicar)/gi) ?? [];
    expect(dropsDeVerdade).toEqual([]);
  });

  it('roda dentro de uma transação, com lock_timeout', () => {
    expect(BRUTO).toMatch(/^begin;/m);
    expect(BRUTO).toMatch(/^commit;/m);
    expect(BRUTO).toContain("set local lock_timeout");
  });
});
