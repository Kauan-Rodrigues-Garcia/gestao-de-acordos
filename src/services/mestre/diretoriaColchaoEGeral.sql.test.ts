/**
 * As duas correções de 14/09/2026 no Painel Diretoria, conferidas no SQL.
 *
 * Não há Postgres nos testes: o que se prova aqui é que a regra ESTÁ ESCRITA e
 * que nenhuma refatoração futura a tirou. Mesmo recurso de
 * `fechamentoOperadores.sql.test.ts`.
 *
 * As duas regras têm o mesmo perfil de risco: erradas, elas não quebram nada —
 * devolvem um número plausível numa tela que ninguém confere porque já veio
 * pronta. Foi exatamente assim que a diferença do colchão passou dias sem nome
 * e que a Retenção apareceu como «carteira sem setor vinculado».
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const raiz = path.resolve(__dirname, '../../../supabase/migrations');
const ler = (arquivo: string) => fs.readFileSync(path.join(raiz, arquivo), 'utf8');

const VISAO_GERAL = ler('20260914180000_diretoria_visao_geral_mostra_o_colchao.sql');
const SO_NO_GERAL = ler('20260914181000_diretoria_separa_o_que_conta_so_no_geral.sql');

/** O SQL sem comentários — um comentário que cita a regra não é a regra. */
const semComentarios = (sql: string) => sql.replace(/--.*$/gm, '');

describe('a Visão Geral mostra o colchão que ela soma', () => {
  const codigo = semComentarios(VISAO_GERAL);

  it('devolve o bloco `colchao` no jsonb', () => {
    expect(codigo).toContain("'colchao',");
    expect(codigo).toContain('colchao_atual');
    expect(codigo).toContain('colchao_ant');
  });

  /**
   * O ponto que decide o número: colchão de 01 a 14/08/2026 CONTA para setor.
   * Um `where colchao` cru aqui faria este bloco explicar uma diferença que não
   * é a que existe naquele mês — e a régua passaria a viver em dois lugares.
   */
  it('a régua é `fn_mestre_conta_na_meta`, não um `where colchao` cru', () => {
    expect(codigo).toContain('not fn_mestre_conta_na_meta(colchao, dt_pgto)');
    expect(codigo).not.toMatch(/where\s+colchao\s+is\s+(true|not\s+false)/i);
  });

  it('o total da empresa continua com o colchão dentro', () => {
    // `tot_atual` soma `atual` inteiro. Um filtro ali mudaria o total da
    // empresa, que é justamente o que a diretoria decidiu NÃO mudar em 13/09.
    const tot = codigo.slice(codigo.indexOf('tot_atual as ('), codigo.indexOf('tot_ant as ('));
    expect(tot).toContain('from atual');
    expect(tot).not.toContain('fn_mestre_conta_na_meta');
  });
});

describe('«conta só no geral» deixa de ser «sem setor vinculado»', () => {
  const codigo = semComentarios(SO_NO_GERAL);

  it('a linha passa a dizer que conta só no geral', () => {
    expect(codigo).toContain("when 'somente_geral' then 'somente_geral'");
  });

  it('as outras origens continuam como eram', () => {
    expect(codigo).toContain("when 'outro_setor'   then 'movido'");
    expect(codigo).toContain("else 'proprio'");
    expect(codigo).toContain("'integral'");
  });

  /**
   * O conserto em si. Sem este filtro, a Retenção de uma carteira JÁ vinculada
   * vira card em «Ainda sem setor vinculado» — foi o que produziu os dois cards
   * «COB RECEPTIVO - BEATRIZ» em setembro/2026.
   */
  it('a lista de carteiras sem setor exclui o que conta só no geral', () => {
    expect(codigo).toContain("a.setor_id is null and a.origem <> 'somente_geral'");
    expect(codigo).toContain("b.setor_id is null and b.origem <> 'somente_geral'");
  });

  it('o que conta só no geral vira bloco próprio', () => {
    expect(codigo).toContain('so_geral as (');
    expect(codigo).toContain("a.origem = 'somente_geral'");
    expect(codigo).toContain("'somente_geral', jsonb_build_object(");
  });

  /**
   * Nenhum total muda: `somente_geral` sempre contou no total da empresa, e
   * continuar somando ali é o que mantém a Visão Geral e esta aba de acordo
   * sobre tudo que não seja o colchão.
   */
  it('o total da empresa continua somando tudo que não é a 2ª perna do Integral', () => {
    expect(codigo).toContain("from atual a where a.origem <> 'integral'");
  });

  it('a função interna continua fechada para quem chama de fora', () => {
    expect(codigo).toContain(
      'revoke all on function public.fn_mestre_diretoria_linhas(uuid, text, integer) from public, anon, authenticated',
    );
  });
});
