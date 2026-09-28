/**
 * `fn_analitico_mudancas_do_mes` conferida no SQL da migration.
 *
 * O que estes testes protegem é o ESCOPO. A RLS de `analitico_removidos` é
 * `fn_can_access_empresa`: qualquer usuário da empresa lê a tabela inteira. É
 * a função que recorta — se o recorte cair, um operador passa a ver a carteira
 * de todo mundo, e não há erro nem tela vermelha avisando: só dado a mais.
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

const BRUTO = migration('_analitico_mudancas_entre_importacoes.sql');
const SQL = BRUTO.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ');
const LISO = SQL.replace(/\s+/g, ' ');

describe('a porta de entrada', () => {
  it('é SECURITY DEFINER — é ela que aplica o escopo, não a RLS', () => {
    expect(LISO).toMatch(/FUNCTION public\.fn_analitico_mudancas_do_mes[\s\S]*?SECURITY DEFINER/);
  });

  it('é STABLE e não escreve nada', () => {
    expect(LISO).toContain('STABLE');
    expect(LISO).not.toMatch(/\b(insert into|update |delete from)\b/i);
  });

  it('fixa o search_path', () => {
    expect(LISO).toContain("SET search_path TO 'public'");
  });

  it('exige empresa alcançável e a permissão de ver o analítico', () => {
    expect(LISO).toContain('NOT public.fn_can_access_empresa(p_empresa_id)');
    expect(LISO).toContain("NOT public.fn_user_tem('ver_analitico')");
  });

  it('anon não executa; authenticated sim', () => {
    expect(BRUTO).toMatch(/REVOKE ALL ON FUNCTION public\.fn_analitico_mudancas_do_mes[^;]*FROM PUBLIC, anon/);
    expect(BRUTO).toMatch(/GRANT EXECUTE ON FUNCTION public\.fn_analitico_mudancas_do_mes[^;]*TO authenticated/);
  });

  it('o limite é preso entre 1 e 500 — nenhum cliente pede o mês inteiro', () => {
    expect(LISO).toMatch(/LEAST\(GREATEST\(COALESCE\(p_limite, 200\), 1\), 500\)/);
  });
});

describe('o escopo', () => {
  it('sai de fn_user_escopo(\'analitico\'), a mesma régua do resumo por operador', () => {
    expect(LISO).toContain("public.fn_user_escopo('analitico')");
  });

  it('usa fn_equipes_de_alcance — o líder tem equipe (20260928210000)', () => {
    /*
     * Ler `perfis.equipe_id` direto era o defeito que a 20260928210000
     * consertou: em 33 dos 50 líderes ativos a coluna está vazia, e o líder
     * ficava sem equipe nenhuma.
     */
    expect(LISO).toContain('public.fn_equipes_de_alcance(auth.uid())');
    expect(LISO).toContain('public.fn_setores_do_operador(auth.uid())');
  });

  it('escopo 2 alcança o setor, clones incluídos', () => {
    const t = LISO.slice(LISO.indexOf('IF v_escopo = 2'), LISO.indexOf('RETURN QUERY'));
    expect(t).toContain('pf.setor_id = ANY(v_setores)');
    expect(t).toContain('equipe_operadores_clones');
  });

  it('abaixo de 2, sem equipe nenhuma, sobra só a própria linha', () => {
    expect(LISO).toMatch(/ELSIF v_escopo < 2 THEN v_ops := ARRAY\[auth\.uid\(\)\]/);
  });

  it('só o escopo 3+ dispensa o filtro por operador', () => {
    const w = LISO.slice(LISO.indexOf('AND ( v_escopo >= 3'));
    expect(w).toMatch(/v_escopo >= 3 OR p\.op_antes = ANY\(v_ops\) OR p\.op_depois = ANY\(v_ops\)/);
  });

  it('as duas pontas contam: o que saiu de mim e o que chegou em mim', () => {
    // «se sumiu um acordo meu, foi para outra pessoa, aparece para mim» — e o
    // que entrou vindo de outro também é notícia para quem recebeu.
    expect(LISO).toContain('p.op_antes = ANY(v_ops)');
    expect(LISO).toContain('p.op_depois = ANY(v_ops)');
  });
});

describe('o antes e o depois', () => {
  it('o antes sai de analitico_removidos, lendo o conteudo jsonb', () => {
    expect(LISO).toContain('FROM public.analitico_removidos r');
    expect(LISO).toContain("r.conteudo->>'operador_id'");
    expect(LISO).toContain("r.conteudo->>'valor_recebido'");
    expect(LISO).toContain("r.conteudo->>'importado_em'");
  });

  it('linha já restaurada não conta como mudança', () => {
    // Voltou a ser o que era: avisar seria mentira.
    expect(LISO).toContain('r.restaurado_em IS NULL');
  });

  it('o depois casa na MESMA chave do snapshot: NR + data + forma', () => {
    /*
     * A chave de analitico_recebimentos e (empresa, codigo, data, forma,
     * operador_usuario). Agrupar so por NR + data somava as formas de um mesmo
     * pagamento contra o valor de UMA linha de snapshot — medido em produção
     * em 29/09/2026, toda conta de valor saía errada por isso.
     */
    expect(LISO).toContain('GROUP BY ar.codigo, ar.data_pagamento, ar.forma_pagamento');
    expect(LISO).toContain("r.conteudo->>'forma_pagamento'");
    expect(LISO).toMatch(
      /ARRAY_AGG\(ar\.operador_id ORDER BY ar\.valor_recebido DESC, ar\.operador_id\)\)\[1\]/,
    );
  });

  it('o LEFT JOIN é o que faz «sumiu» ser representável', () => {
    // Sem linha em `depois`, valor_depois vem NULL — e o TS lê isso como
    // 'removido'. Um INNER JOIN esconderia justamente o caso mais grave.
    expect(LISO).toMatch(
      /LEFT JOIN depois d ON d\.codigo = a\.codigo AND d\.data_pagamento = a\.data_pagamento AND d\.forma IS NOT DISTINCT FROM a\.forma/,
    );
  });

  it('um NR mexido várias vezes aparece uma vez, na mudança mais recente', () => {
    expect(LISO).toMatch(
      /ROW_NUMBER\(\) OVER \( PARTITION BY a\.codigo, a\.data_pagamento, a\.forma ORDER BY a\.removido_em DESC\)/,
    );
    expect(LISO).toContain('WHERE p.ordem = 1');
  });
});

describe('o 58 nao entra — e e isto que separa noticia de ruido', () => {
  /*
   * O 58 e previa por contrato; o 59 e que manda. Promover uma linha do 58 ao
   * 59, ou descarta-la quando o 59 nunca confirma (a guarda de dois dias da
   * 20260928200000), e o pipeline funcionando — nao «mexeram no meu
   * recebimento».
   *
   * Medido em produção no mes corrente, 29/09/2026:
   *
   *                       saindo do 58     ja definitivo
   *     removido ............. 689 ............. 12
   *     transferido .......... 739 ............. 91
   *     valor alterado ...... 2804 ............ 105
   *
   * Sem o corte sao 4.232 avisos por mes, 96% deles rotina, e ninguem le os
   * 5% que importam. Este teste existe para o corte nao cair sem querer: se
   * cair, o card volta a ser um firehose e nada quebra avisando.
   */
  it('corta a linha cuja procedencia era relatorio_58', () => {
    expect(LISO).toContain("COALESCE(r.conteudo->>'procedencia', '') <> 'relatorio_58'");
  });

  it('o corte usa COALESCE — snapshot antigo sem procedencia nao some', () => {
    // `conteudo` e jsonb de uma linha que pode ser anterior a coluna
    // `procedencia` (adicionada na 20260914010002). Sem o COALESCE, `null <>
    // 'relatorio_58'` daria NULL e a linha seria descartada em silencio.
    expect(LISO).not.toMatch(/r\.conteudo->>'procedencia' <> 'relatorio_58'/);
  });
});

describe('o que não é notícia fica no banco', () => {
  it('corta o que não mudou dinheiro nem dono', () => {
    /*
     * A sincronização grava o retrato antigo quando QUALQUER campo difere —
     * nome_cliente, forma_detalhe, e a procedência quando o 58 vira 59. São
     * milhares de linhas mudas por mês; trafegar isso para a tela filtrar
     * seria pagar duas vezes.
     */
    expect(LISO).toMatch(
      /p\.val_depois IS NULL OR p\.op_depois IS DISTINCT FROM p\.op_antes OR ROUND\(p\.val_depois, 2\) <> ROUND\(p\.val_antes, 2\)/,
    );
  });

  it('a comparação de valor é arredondada — centavo de numeric não vira mudança', () => {
    expect(LISO).toContain('ROUND(p.val_depois, 2) <> ROUND(p.val_antes, 2)');
  });
});

describe('a migration em si', () => {
  it('roda em transação, com lock_timeout', () => {
    expect(BRUTO).toMatch(/^begin;/m);
    expect(BRUTO).toMatch(/^commit;/m);
    expect(BRUTO).toContain('set local lock_timeout');
  });

  it('é reexecutável: só CREATE OR REPLACE, nenhum DROP', () => {
    expect(BRUTO).toContain('CREATE OR REPLACE FUNCTION');
    expect(BRUTO).not.toMatch(/\bdrop (table|function)\b/i);
  });

  it('não cria tabela nova — o registro já existe desde a 20260914021223', () => {
    expect(BRUTO).not.toMatch(/create table/i);
  });
});
