/**
 * O destino do subgrupo, conferido no SQL das migrations.
 *
 * ## A armadilha que estes testes guardam
 *
 * `mestre_equipes.destino` é regra de TRÊS vias — `proprio`, `outro_setor`,
 * `somente_geral` — e a tela `Mestre59Detalhe` deixa escolher as três desde que
 * a coluna existe. Mas quase toda função de leitura implementava só duas:
 * filtravam `<> 'somente_geral'` e deixavam `outro_setor` passar direto, caindo
 * no setor da CARTEIRA — justamente o setor de onde o dinheiro deveria sair.
 *
 * Quem usasse a opção veria o mesmo dinheiro num setor numa tela e noutro em
 * outra. Ninguém percebeu porque ninguém usou: em 14/09/2026, das 124 linhas de
 * `mestre_equipes` da BookPlay, 122 eram `proprio`, 2 `somente_geral` e nenhuma
 * tinha `destino_setor_id`.
 *
 * O conserto foi tirar a regra de dentro de cada função e pôr num lugar só,
 * `fn_mestre_setor_resolvido`. O que estes testes travam é que ela CONTINUE
 * sendo um lugar só: reescrever `case ... when 'outro_setor'` à mão dentro de
 * uma função é como o problema nasceu.
 *
 * Quem garante o resultado é o Postgres. O que dá para provar aqui é que as
 * chamadas ESTÃO ESCRITAS — mesmo recurso de `numerosSituacoesPrazo.sql.test.ts`.
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

function semComentarios(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ');
}

const HELPER = semComentarios(migration('_fase4_setor_resolvido_um_lugar_so.sql'));

describe('fn_mestre_setor_resolvido — o lugar único', () => {
  it('cobre as três vias, e o padrão é o setor da carteira', () => {
    expect(HELPER).toContain("when 'outro_setor'   then p_destino_setor_id");
    expect(HELPER).toContain("when 'somente_geral' then null::uuid");
    expect(HELPER).toContain('else p_setor_do_grupo');
  });

  /*
   * Subgrupo que nunca apareceu em `mestre_equipes` chega com `destino` nulo, e
   * tem de se comportar como `proprio`. Sem o coalesce, o `case` cairia no
   * `else` por acidente em vez de por regra — e um dia alguém trocaria a ordem
   * dos ramos e o nulo viraria outra coisa.
   */
  it('subgrupo sem registro é tratado como próprio, explicitamente', () => {
    expect(HELPER).toContain("case coalesce(p_destino, 'proprio')");
  });

  /*
   * IMMUTABLE não é enfeite: é o que deixa o Postgres inlinear a chamada. Sem
   * isso, a função vira uma chamada por linha dentro de varreduras de dezenas
   * de milhares de recebimentos, e o custo aparece.
   */
  it('é IMMUTABLE, para o Postgres inlinear', () => {
    expect(HELPER).toContain('immutable');
  });
});

describe('quem precisa honrar o destino, honra', () => {
  const casos: Array<[string, string, string]> = [
    ['a aba «Por pessoa»', '_fase4_operadores_do_mes_honra_outro_setor.sql',
     'fn_mestre_operadores_do_mes'],
    ['a conferência 58 × 59', '_fase4_conferencia_e_pendencias_honram_outro_setor.sql',
     'fn_mestre_divergencias'],
    ['as pendências do 58', '_fase4_conferencia_e_pendencias_honram_outro_setor.sql',
     'fn_analitico_pendencias'],
    ['o detalhe da pessoa', '_fase4_operador_detalhe_honra_outro_setor.sql',
     'fn_mestre_operador_detalhe'],
  ];

  for (const [rotulo, arquivo, funcao] of casos) {
    it(`${rotulo} chama o lugar único`, () => {
      const sql = semComentarios(migration(arquivo));
      expect(sql).toContain(`function public.${funcao}(`);
      expect(sql).toContain('fn_mestre_setor_resolvido(');
    });
  }

  /*
   * O ponto de todo o conserto. Se alguém reescrever a regra dentro de uma
   * função — mesmo corretamente —, volta a existir mais de uma verdade, e a
   * próxima via nova (se houver) vai ser esquecida num dos lugares. Foi
   * exatamente assim que `outro_setor` ficou meio implementado.
   */
  for (const [rotulo, arquivo] of casos) {
    it(`${rotulo} não reescreve a regra à mão`, () => {
      const sql = semComentarios(migration(arquivo));
      expect(sql).not.toContain("when 'outro_setor'");
    });
  }
});

describe('o detalhe da pessoa separa carteira de destino', () => {
  const SQL = semComentarios(migration('_fase4_operador_detalhe_honra_outro_setor.sql'));

  /*
   * As duas quebras respondem perguntas diferentes e por isso não podem usar a
   * mesma coluna:
   *
   *   por_setor ..... para onde o dinheiro FOI (resolvido);
   *   por_carteira .. de quem é a carteira (setor da carteira).
   *
   * Colapsar nas duas seria mais curto e erraria uma delas — rotular a carteira
   * com o destino de um dos seus subgrupos é mentir sobre o cadastro.
   */
  it('por_setor usa o destino e por_carteira usa a carteira', () => {
    const porSetor = SQL.slice(SQL.indexOf('por_setor as ('), SQL.indexOf('por_carteira as ('));
    const porCarteira = SQL.slice(SQL.indexOf('por_carteira as ('), SQL.indexOf('por_equipe as ('));

    expect(porSetor).toContain('f.setor_de_destino');
    expect(porSetor).not.toContain('f.setor_da_carteira');

    expect(porCarteira).toContain('f.setor_da_carteira');
    expect(porCarteira).not.toContain('f.setor_de_destino');
  });
});
