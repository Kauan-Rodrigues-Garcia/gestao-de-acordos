/**
 * desempenhoEquipe.test.ts — as contas do card expandido.
 *
 * O foco é onde a matemática costuma mentir: divisão por zero no primeiro dia do
 * mês, extrapolação em mês fechado, e a diferença entre "recebeu menos" e "está
 * mais atrás do ritmo".
 */
import { describe, it, expect } from 'vitest';
import { detalharEquipe, enriquecerOperadores, type OperadorNaEquipe } from './desempenhoEquipe';
import { QUARTIS_PADRAO } from '@/lib/diasUteis';

/** Mês de 20 dias úteis, meta 100.000 → diária 5.000. */
const BASE = { totalUteis: 20, quartis: QUARTIS_PADRAO, meta: 100_000 };

function op(nome: string, recebido: number, meta: number | null): OperadorNaEquipe {
  return { id: nome, nome, recebido, meta };
}

describe('ritmo e projeção de fechamento', () => {
  it('no primeiro dia do mês não divide por zero', () => {
    const d = detalharEquipe({ ...BASE, acumulado: 3_000, decorridos: 0, operadores: [] });
    expect(d.mediaDiaria).toBe(0);
    expect(Number.isFinite(d.projecaoFechamento)).toBe(true);
  });

  /**
   * Sem dia trabalhado não há ritmo a projetar. Devolver o acumulado é a única
   * leitura honesta: nem zero (a equipe já recebeu), nem uma extrapolação de um
   * dia que não aconteceu.
   */
  it('sem dia trabalhado a estimativa é o próprio acumulado', () => {
    const d = detalharEquipe({ ...BASE, acumulado: 3_000, decorridos: 0, operadores: [] });
    expect(d.projecaoFechamento).toBe(3_000);
  });

  it('mantendo o ritmo, projeta o mês inteiro', () => {
    // 10 de 20 dias, R$ 50.000 → média 5.000/dia → fecha em 100.000
    const d = detalharEquipe({ ...BASE, acumulado: 50_000, decorridos: 10, operadores: [] });
    expect(d.mediaDiaria).toBe(5_000);
    expect(d.diasRestantes).toBe(10);
    expect(d.projecaoFechamento).toBe(100_000);
    expect(d.sobraProjetada).toBe(0);
  });

  it('em mês fechado a estimativa é exatamente o acumulado', () => {
    const d = detalharEquipe({ ...BASE, acumulado: 87_000, decorridos: 20, operadores: [] });
    expect(d.diasRestantes).toBe(0);
    expect(d.projecaoFechamento).toBe(87_000);
  });

  it('dias decorridos além do total não geram dias restantes negativos', () => {
    const d = detalharEquipe({ ...BASE, acumulado: 1_000, decorridos: 25, operadores: [] });
    expect(d.diasRestantes).toBe(0);
  });
});

describe('ritmo necessário para bater a meta', () => {
  it('divide o que falta pelos dias que RESTAM, não pelo mês', () => {
    // Falta 60.000 em 10 dias → 6.000/dia, acima da diária de 5.000 do mês.
    const d = detalharEquipe({ ...BASE, acumulado: 40_000, decorridos: 10, operadores: [] });
    expect(d.faltaMeta).toBe(60_000);
    expect(d.ritmoNecessario).toBe(6_000);
  });

  it('meta já batida não pede ritmo nenhum', () => {
    const d = detalharEquipe({ ...BASE, acumulado: 120_000, decorridos: 10, operadores: [] });
    expect(d.faltaMeta).toBe(0);
    expect(d.ritmoNecessario).toBeNull();
  });

  /** Sem dia útil sobrando não existe ritmo que resolva — um número mentiria. */
  it('sem dia restante devolve null em vez de um valor impossível', () => {
    const d = detalharEquipe({ ...BASE, acumulado: 40_000, decorridos: 20, operadores: [] });
    expect(d.faltaMeta).toBe(60_000);
    expect(d.ritmoNecessario).toBeNull();
  });

  it('sem meta não há falta nem ritmo', () => {
    const d = detalharEquipe({ ...BASE, meta: null, acumulado: 40_000, decorridos: 10, operadores: [] });
    expect(d.faltaMeta).toBeNull();
    expect(d.ritmoNecessario).toBeNull();
    expect(d.sobraProjetada).toBeNull();
    expect(d.degraus).toEqual([]);
  });
});

describe('degraus até cada quartil', () => {
  /**
   * O pedido explícito: quem está no 4º precisa ver o 3º, o 2º E o 1º. Uma
   * resposta só ("próximo quartil") esconde a distância até bater a meta.
   */
  it('no 4º quartil mostra o caminho até o 1º', () => {
    // 10 dias, esperado 50.000; recebeu 10.000 → 20% → 4º quartil.
    const d = detalharEquipe({ ...BASE, acumulado: 10_000, decorridos: 10, operadores: [] });
    expect(d.projecaoPct).toBe(20);
    expect(d.faixaAtual?.quartil).toBe(4);

    const falta = Object.fromEntries(d.degraus.map(x => [x.quartil, x.falta]));
    expect(falta[3]).toBe(15_000);   // 50% de 50.000 = 25.000 − 10.000
    expect(falta[2]).toBe(30_000);   // 80% de 50.000 = 40.000 − 10.000
    expect(falta[1]).toBe(40_000);   // 100%    = 50.000 − 10.000
  });

  it('vem ordenado do 1º ao 4º, que é a ordem de leitura da tela', () => {
    const d = detalharEquipe({ ...BASE, acumulado: 10_000, decorridos: 10, operadores: [] });
    expect(d.degraus.map(x => x.quartil)).toEqual([1, 2, 3, 4]);
  });

  it('faixa já alcançada vem marcada, não omitida', () => {
    // 90% → está no 2º; o 3º e o 4º já passaram.
    const d = detalharEquipe({ ...BASE, acumulado: 45_000, decorridos: 10, operadores: [] });
    expect(d.faixaAtual?.quartil).toBe(2);
    const porQ = Object.fromEntries(d.degraus.map(x => [x.quartil, x.alcancado]));
    expect(porQ[4]).toBe(true);
    expect(porQ[3]).toBe(true);
    expect(porQ[2]).toBe(true);
    expect(porQ[1]).toBe(false);
  });

  it('a faixa de 0% conta como alcançada mesmo sem nada recebido', () => {
    const d = detalharEquipe({ ...BASE, acumulado: 0, decorridos: 10, operadores: [] });
    expect(d.degraus.find(x => x.quartil === 4)?.alcancado).toBe(true);
  });
});

describe('distribuição dos operadores por quartil', () => {
  const operadores = [
    op('Bateu',    12_000, 20_000),   // esperado 10.000 → 120% → 1º
    op('Perto',     8_500, 20_000),   // 85%  → 2º
    op('Atras',     6_000, 20_000),   // 60%  → 3º
    op('Longe',     2_000, 20_000),   // 20%  → 4º
    op('SemMeta',   9_000, null),     // fora da distribuição
  ];

  it('conta quantos estão em cada faixa', () => {
    const d = detalharEquipe({ ...BASE, acumulado: 37_500, decorridos: 10, operadores });
    const qtd = Object.fromEntries(d.porQuartil.map(f => [f.quartil, f.qtd]));
    expect(qtd).toEqual({ 1: 1, 2: 1, 3: 1, 4: 1 });
  });

  it('operador sem meta fica fora da distribuição e é contado à parte', () => {
    const d = detalharEquipe({ ...BASE, acumulado: 37_500, decorridos: 10, operadores });
    expect(d.semMeta).toBe(1);
    expect(d.totalOperadores).toBe(5);
    expect(d.porQuartil.reduce((s, f) => s + f.qtd, 0)).toBe(4);
  });

  it('lista os nomes de cada faixa, maior recebimento primeiro', () => {
    const dois = [op('Menor', 8_000, 20_000), op('Maior', 8_800, 20_000)];
    const d = detalharEquipe({ ...BASE, acumulado: 16_800, decorridos: 10, operadores: dois });
    expect(d.porQuartil.find(f => f.quartil === 2)?.nomes).toEqual(['Maior', 'Menor']);
  });

  /**
   * O ponto da separação de dias úteis: a MESMA equipe, com o mês reduzido de
   * treinamento, coloca gente em outra faixa. Era exatamente onde a aba Quartis
   * (mês cheio) discordava desta (mês reduzido).
   */
  it('dias úteis reduzidos mudam a faixa — e é por isso que vêm por parâmetro', () => {
    const um = [op('Treino', 5_000, 20_000)];

    // Mês cheio: esperado = 20.000/20 × 10 = 10.000 → 50% → 3º quartil.
    const cheio = detalharEquipe({
      ...BASE, acumulado: 5_000, decorridos: 10, operadores: um,
    });
    expect(cheio.porQuartil.find(f => f.quartil === 3)?.qtd).toBe(1);

    // Treinamento (10 dias úteis, 5 trabalhados): esperado = 20.000/10 × 5 =
    // 10.000 → 50% também. Para divergir de fato, basta um recorte diferente:
    const reduzido = detalharEquipe({
      ...BASE, totalUteis: 10, acumulado: 5_000, decorridos: 3, operadores: um,
    });
    // esperado = 2.000 × 3 = 6.000 → 5.000/6.000 = 83% → 2º quartil.
    expect(reduzido.porQuartil.find(f => f.quartil === 2)?.qtd).toBe(1);
    expect(reduzido.porQuartil.find(f => f.quartil === 3)?.qtd).toBe(0);
  });
});

describe('destaque e atenção', () => {
  it('destaque é o maior recebimento', () => {
    const d = detalharEquipe({
      ...BASE, acumulado: 30_000, decorridos: 10,
      operadores: [op('A', 10_000, 20_000), op('B', 20_000, 90_000)],
    });
    expect(d.destaque?.nome).toBe('B');
  });

  /**
   * A decisão documentada no módulo: atenção é a menor % de projeção, não o
   * menor recebimento. Quem tem meta pequena e recebeu pouco pode estar em dia;
   * quem tem meta grande pode estar atrás recebendo o dobro.
   */
  it('atenção é a menor projeção, não o menor recebimento', () => {
    const d = detalharEquipe({
      ...BASE, acumulado: 30_000, decorridos: 10,
      operadores: [
        op('PoucoMasEmDia', 10_000, 20_000),   // esperado 10.000 → 100%
        op('MuitoMasAtras', 20_000, 90_000),   // esperado 45.000 →  44%
      ],
    });
    expect(d.destaque?.nome).toBe('MuitoMasAtras');
    expect(d.atencao?.nome).toBe('MuitoMasAtras');
    expect(d.atencao?.nome).not.toBe('PoucoMasEmDia');
  });

  it('operador sem meta não vira atenção — não há ritmo a comparar', () => {
    const d = detalharEquipe({
      ...BASE, acumulado: 10_000, decorridos: 10,
      operadores: [op('ComMeta', 10_000, 20_000), op('SemMeta', 0, null)],
    });
    expect(d.atencao?.nome).toBe('ComMeta');
  });

  it('equipe vazia não quebra', () => {
    const d = detalharEquipe({ ...BASE, acumulado: 0, decorridos: 5, operadores: [] });
    expect(d.destaque).toBeNull();
    expect(d.atencao).toBeNull();
    expect(d.mediaPorOperador).toBe(0);
    expect(d.totalOperadores).toBe(0);
  });
});

describe('enriquecerOperadores', () => {
  const identidade = {
    ana:  { nome: 'Ana Souza' },
    bruno: { nome: 'Bruno Lima' },
  };

  it('dá nome, recebimento e meta aos ids recebidos', () => {
    const lista = enriquecerOperadores({
      ids: new Set(['ana', 'bruno']),
      identidade,
      recebidoPorOperador: { ana: 100, bruno: 300 },
      metaPorOperador: { ana: 500 },
    });
    expect(lista.map(o => o.nome)).toEqual(['Bruno Lima', 'Ana Souza']);   // maior primeiro
    expect(lista.find(o => o.id === 'ana')?.meta).toBe(500);
    expect(lista.find(o => o.id === 'bruno')?.meta).toBeNull();
  });

  it('recebimento ausente vira 0, não undefined', () => {
    const lista = enriquecerOperadores({
      ids: new Set(['ana']), identidade,
      recebidoPorOperador: {}, metaPorOperador: {},
    });
    expect(lista[0].recebido).toBe(0);
  });

  /**
   * A tela só carrega quem conta no recebimento E está ativo. Um id que sobrou de
   * `operadorEquipeMap` sem identidade é justamente alguém fora desse recorte —
   * exibi-lo criaria uma linha sem nome.
   */
  it('id sem identidade carregada é ignorado, não vira linha vazia', () => {
    const lista = enriquecerOperadores({
      ids: new Set(['ana', 'fantasma']),
      identidade: { ana: { nome: 'Ana Souza' } },
      recebidoPorOperador: {}, metaPorOperador: {},
    });
    expect(lista.map(o => o.id)).toEqual(['ana']);
  });

  it('conjunto vazio devolve lista vazia', () => {
    expect(enriquecerOperadores({
      ids: new Set(), identidade, recebidoPorOperador: {}, metaPorOperador: {},
    })).toEqual([]);
  });
});
