/**
 * detalheOperador.test.ts — as contas da linha expandida da aba Quartis.
 *
 * O foco é onde a matemática costuma mentir: primeiro dia do mês, mês fechado,
 * operador sem meta, empate no ranking e a diferença entre "% da meta" e
 * "% de projeção" — dois números parecidos que respondem coisas diferentes e
 * aparecem lado a lado na mesma linha.
 */
import { describe, it, expect } from 'vitest';
import { detalharOperador } from './detalheOperador';
import { QUARTIS_PADRAO } from '@/lib/diasUteis';

/** Mês de 20 dias úteis, meta 10.000 → diária 500. */
const BASE = { totalUteis: 20, decorridos: 10, quartis: QUARTIS_PADRAO, meta: 10_000 };

describe('estimativa de fechamento', () => {
  it('mantendo o ritmo, projeta o mês inteiro', () => {
    // 10 de 20 dias, R$ 5.000 → média 500/dia → fecha em 10.000
    const d = detalharOperador({ ...BASE, recebido: 5_000 });
    expect(d.mediaDiaria).toBe(500);
    expect(d.diasRestantes).toBe(10);
    expect(d.projecaoFechamento).toBe(10_000);
    expect(d.sobraProjetada).toBe(0);
    expect(d.fechaBatendo).toBe(true);
  });

  it('no primeiro dia do mês não divide por zero', () => {
    const d = detalharOperador({ ...BASE, decorridos: 0, recebido: 800 });
    expect(d.mediaDiaria).toBe(0);
    // Sem dia trabalhado não há ritmo a projetar: a estimativa é o acumulado.
    expect(d.projecaoFechamento).toBe(800);
    expect(Number.isFinite(d.projecaoFechamento)).toBe(true);
  });

  it('em mês fechado a estimativa é exatamente o recebido', () => {
    const d = detalharOperador({ ...BASE, decorridos: 20, recebido: 8_700 });
    expect(d.diasRestantes).toBe(0);
    expect(d.projecaoFechamento).toBe(8_700);
  });

  it('quem está atrás fecha abaixo da meta', () => {
    const d = detalharOperador({ ...BASE, recebido: 3_000 });
    expect(d.projecaoFechamento).toBe(6_000);
    expect(d.sobraProjetada).toBe(-4_000);
    expect(d.fechaBatendo).toBe(false);
  });
});

describe('ritmo necessário', () => {
  it('divide o que falta pelos dias que RESTAM, não pelo mês', () => {
    // Falta 6.000 em 10 dias → 600/dia, acima da diária de 500 do mês.
    const d = detalharOperador({ ...BASE, recebido: 4_000 });
    expect(d.faltaMeta).toBe(6_000);
    expect(d.ritmoNecessario).toBe(600);
  });

  it('meta batida não pede ritmo nenhum', () => {
    const d = detalharOperador({ ...BASE, recebido: 12_000 });
    expect(d.faltaMeta).toBe(0);
    expect(d.ritmoNecessario).toBeNull();
  });

  /**
   * Sem dia útil sobrando não existe ritmo capaz de resolver. Um número aqui
   * mentiria — dividiria por zero e devolveria Infinity, que a tela imprimiria.
   */
  it('sem dia restante não há ritmo que resolva', () => {
    const d = detalharOperador({ ...BASE, decorridos: 20, recebido: 4_000 });
    expect(d.ritmoNecessario).toBeNull();
  });
});

describe('degraus de quartil', () => {
  it('mede cada faixa contra o esperado até hoje, igual à % da linha', () => {
    // Esperado até hoje = 500 × 10 = 5.000. Recebido 2.500 → 50% → 3º quartil.
    const d = detalharOperador({ ...BASE, recebido: 2_500 });
    expect(d.esperadoHoje).toBe(5_000);
    expect(d.projecaoPct).toBe(50);
    expect(d.faixaAtual?.quartil).toBe(3);

    const falta = Object.fromEntries(d.degraus.map(g => [g.quartil, g.falta]));
    expect(falta[1]).toBe(2_500);   // 100% de 5.000 = 5.000 → faltam 2.500
    expect(falta[2]).toBe(1_500);   //  80% de 5.000 = 4.000 → faltam 1.500
    expect(falta[3]).toBe(0);       // já alcançado
    expect(falta[4]).toBe(0);
  });

  it('traz o caminho inteiro, com as faixas já alcançadas marcadas', () => {
    const d = detalharOperador({ ...BASE, recebido: 5_000 });
    expect(d.degraus).toHaveLength(4);
    expect(d.degraus.every(g => g.alcancado)).toBe(true);
    expect(d.faixaAtual?.quartil).toBe(1);
    expect(d.proximaFaixa).toBeNull();   // já está na melhor faixa
  });

  it('sem meta não há faixa a alcançar', () => {
    const d = detalharOperador({ ...BASE, meta: null, recebido: 5_000 });
    expect(d.degraus).toEqual([]);
    expect(d.projecaoPct).toBeNull();
    expect(d.faixaAtual).toBeNull();
    expect(d.esperadoHoje).toBeNull();
    // O que não depende de meta continua existindo.
    expect(d.mediaDiaria).toBe(500);
    expect(d.projecaoFechamento).toBe(10_000);
    expect(d.faltaMeta).toBeNull();
  });
});

describe('% da meta × % de projeção', () => {
  /**
   * Os dois números aparecem na mesma linha e não são o mesmo: a projeção mede
   * contra o ESPERADO até hoje, a % da meta mede contra o mês inteiro. Metade do
   * mês com metade da meta é 100% de projeção e 50% da meta.
   */
  it('metade do mês com metade da meta é 100% de projeção e 50% da meta', () => {
    const d = detalharOperador({ ...BASE, recebido: 5_000 });
    expect(d.projecaoPct).toBe(100);
    expect(d.pctMeta).toBe(50);
  });

  it('sem meta os dois somem, em vez de virarem zero', () => {
    const d = detalharOperador({ ...BASE, meta: null, recebido: 5_000 });
    expect(d.pctMeta).toBeNull();
    expect(d.projecaoPct).toBeNull();
  });
});

describe('pagamentos, ticket e H.O.', () => {
  it('ticket médio é o recebido dividido pelos pagamentos', () => {
    const d = detalharOperador({ ...BASE, recebido: 5_000, pagamentos: 20 });
    expect(d.ticketMedio).toBe(250);
    expect(d.pagamentos).toBe(20);
  });

  it('zero pagamento não vira divisão por zero', () => {
    const d = detalharOperador({ ...BASE, recebido: 0, pagamentos: 0 });
    expect(d.ticketMedio).toBeNull();
  });

  it('pagamentos e H.O. ausentes vêm null, não zero', () => {
    const d = detalharOperador({ ...BASE, recebido: 5_000 });
    expect(d.pagamentos).toBeNull();
    expect(d.ho).toBeNull();
  });

  it('H.O. informado passa adiante', () => {
    const d = detalharOperador({ ...BASE, recebido: 5_000, ho: 1_200 });
    expect(d.ho).toBe(1_200);
  });
});

describe('posição e participação no grupo', () => {
  it('conta quantos receberam mais, e soma um', () => {
    const d = detalharOperador({
      ...BASE, recebido: 3_000, recebidosDoGrupo: [9_000, 5_000, 3_000, 1_000],
    });
    expect(d.posicao).toBe(3);
    expect(d.tamanhoGrupo).toBe(4);
  });

  /** Dois com o mesmo valor não são 2º e 3º: dividem o mesmo lugar. */
  it('empate divide a mesma posição', () => {
    const d = detalharOperador({
      ...BASE, recebido: 5_000, recebidosDoGrupo: [9_000, 5_000, 5_000, 1_000],
    });
    expect(d.posicao).toBe(2);
  });

  it('participação é a fatia do recebimento do grupo, com uma casa', () => {
    const d = detalharOperador({
      ...BASE, recebido: 2_500, recebidosDoGrupo: [5_000, 2_500, 2_500],
    });
    expect(d.participacaoPct).toBe(25);
  });

  it('sem grupo não inventa "1º de 1"', () => {
    const d = detalharOperador({ ...BASE, recebido: 5_000 });
    expect(d.posicao).toBeNull();
    expect(d.tamanhoGrupo).toBe(0);
    expect(d.participacaoPct).toBeNull();
  });

  it('grupo que não recebeu nada não divide por zero', () => {
    const d = detalharOperador({
      ...BASE, recebido: 0, recebidosDoGrupo: [0, 0, 0],
    });
    expect(d.participacaoPct).toBeNull();
    expect(d.posicao).toBe(1);
  });
});
