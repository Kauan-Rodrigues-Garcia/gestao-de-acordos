/**
 * CardsMetas — o que aparece e, principalmente, o que NÃO aparece.
 *
 * A regra que mais custa caro se quebrar: card sem o que dizer some, em vez de
 * mostrar R$ 0,00. Um zero na tela parece dado real.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CardsMetas } from './CardsMetas';
import { calcularProjecao } from '@/lib/projecaoMetas';
import { QUARTIS_PADRAO } from '@/lib/diasUteis';
import type { DadosPainelMetas } from '@/hooks/usePainelMetas';

function dados(over: Partial<DadosPainelMetas> = {}): DadosPainelMetas {
  return {
    carregando: false,
    dbAtiva: true,
    semRelatorio: false,
    diasUteisTotal: 21,
    diasUteisPassados: 6,
    diasUteisRestantes: 15,
    totalRecebido: 65_611.62,
    diretoExtra: null,
    extraTabulado: null,
    naoTabulado: 0,
    naoTabuladoQtd: 0,
    porForma: {},
    meta: 130_000,
    quartis: QUARTIS_PADRAO,
    projecao: calcularProjecao({
      meta: 130_000, recebido: 65_611.62,
      totalUteis: 21, decorridos: 6, quartis: QUARTIS_PADRAO,
    }),
    porDia: {},
    agendadoPorDia: [],
    baixaAnterior: null,
    equipesDisponiveis: [],
    podeVerSetor: false,
    escopoRotulo: 'individual',
    modoAgregado: false,
    noMesAtual: true,
    ...over,
  };
}

const render0 = (d: DadosPainelMetas) => render(<CardsMetas dados={d} mes="2026-08" />);

/** Atalho para os casos de escopo agregado (equipe ou setor). */
const daEquipe = (over: Partial<DadosPainelMetas> = {}) =>
  dados({ escopoRotulo: 'da equipe Matheus', modoAgregado: true, ...over });

describe('CardsMetas — recebimento', () => {
  it('mostra o total com a meta individual no subtexto', () => {
    render0(dados());
    expect(screen.getByText('Total recebido')).toBeInTheDocument();
    expect(screen.getByText(/Meta individual: R\$\s*130\.000,00/i)).toBeInTheDocument();
  });

  it('omite o subtexto de meta quando não há meta', () => {
    render0(dados({ meta: null, projecao: null }));
    expect(screen.queryByText(/Meta individual/i)).not.toBeInTheDocument();
  });

  it('no escopo agregado nomeia a equipe e avisa do Receptivo', () => {
    render0(daEquipe());
    // Com dois-pontos: o subtexto do Total recebido, e não o rodapé do donut
    // ("meta da equipe Matheus"), que casaria igual num regex sem âncora.
    expect(screen.getByText(/Meta da equipe Matheus: R\$/)).toBeInTheDocument();
    expect(screen.getByText(/Receptivo não entra/i)).toBeInTheDocument();
  });
});

const DIRETO_EXTRA = {
  direto: 37_870.98, extra: 27_740.64, naoTabulado: 0,
  qtdDireto: 40, qtdExtra: 12, qtdNaoTabulado: 0,
};

describe('CardsMetas — Direto/Extra', () => {
  it('sem a lógica ativa os cards de vínculo somem', () => {
    render0(dados());
    expect(screen.queryByText('Recebimento direto')).not.toBeInTheDocument();
    expect(screen.queryByText('Recebimento extra')).not.toBeInTheDocument();
    expect(screen.queryByText('Sem vínculo definido')).not.toBeInTheDocument();
  });

  it('com a lógica ativa mostra direto e extra', () => {
    render0(dados({ diretoExtra: DIRETO_EXTRA }));
    expect(screen.getByText('Recebimento direto')).toBeInTheDocument();
    expect(screen.getByText('Recebimento extra')).toBeInTheDocument();
  });

  it('tudo tabulado não mostra o card de sem vínculo', () => {
    render0(dados({ diretoExtra: DIRETO_EXTRA }));
    expect(screen.queryByText('Sem vínculo definido')).not.toBeInTheDocument();
  });

  it('sobra sem acordo tabulado vira card próprio, para a soma fechar', () => {
    render0(dados({
      diretoExtra: { ...DIRETO_EXTRA, naoTabulado: 4_000, qtdNaoTabulado: 7 },
    }));
    expect(screen.getByText('Sem vínculo definido')).toBeInTheDocument();
    expect(screen.getByText(/7 pagamentos sem acordo tabulado/)).toBeInTheDocument();
  });

  /**
   * Setor que ainda não tabulou (Receptivo, 0 de 269 linhas com acordo) daria
   * dois cards de R$ 0,00 e um terceiro repetindo o total. O aviso de não
   * tabulado logo acima já conta essa história.
   */
  it('nada tabulado: os três cards somem em vez de mostrar dois zeros', () => {
    render0(dados({
      diretoExtra: {
        direto: 0, extra: 0, naoTabulado: 96_761.65,
        qtdDireto: 0, qtdExtra: 0, qtdNaoTabulado: 269,
      },
    }));
    expect(screen.queryByText('Recebimento direto')).not.toBeInTheDocument();
    expect(screen.queryByText('Recebimento extra')).not.toBeInTheDocument();
    expect(screen.queryByText('Sem vínculo definido')).not.toBeInTheDocument();
    // O total continua lá — é ele que carrega o número.
    expect(screen.getByText('Total recebido')).toBeInTheDocument();
  });

  it('só extra tabulado já basta para a separação aparecer', () => {
    render0(dados({
      diretoExtra: {
        direto: 0, extra: 5_000, naoTabulado: 1_000,
        qtdDireto: 0, qtdExtra: 3, qtdNaoTabulado: 2,
      },
    }));
    expect(screen.getByText('Recebimento extra')).toBeInTheDocument();
    expect(screen.getByText('Sem vínculo definido')).toBeInTheDocument();
  });
});

/**
 * PaguePlay: o extra vem da TABULAÇÃO, não do relatório.
 *
 * Em agosto/2026 o analítico da PaguePlay tem 0 de 1.859 linhas com "Tipo
 * comissão", e nenhuma das 792 linhas com acordo aponta para um acordo extra —
 * o card mostrava R$ 0,00 com 29 extras tabulados no mesmo mês.
 */
describe('CardsMetas — extra por tabulação (PaguePlay)', () => {
  /** Números reais de agosto/2026: 27 acordos pagos. */
  const EXTRA_PP = { bruto: 35_348.64, ho: 8_823.02, qtd: 27 };

  /** É o caso da PaguePlay: o analítico não sabe classificar nenhum extra. */
  const SO_DIRETO = {
    direto: 463_653.86, extra: 0, naoTabulado: 577_563.95,
    qtdDireto: 792, qtdExtra: 0, qtdNaoTabulado: 1_067,
  };

  it('o valor do card vem da tabulação, não do zero do analítico', () => {
    render0(dados({ diretoExtra: SO_DIRETO, extraTabulado: EXTRA_PP }));
    expect(screen.getByText('Recebimento extra')).toBeInTheDocument();
    expect(screen.getByText(/R\$\s*35\.348,64/)).toBeInTheDocument();
  });

  /**
   * A linha mais importante do card. Sem ela alguém soma extra + total de
   * cabeça e conclui que a meta está errada.
   */
  it('avisa que está fora da meta', () => {
    render0(dados({ diretoExtra: SO_DIRETO, extraTabulado: EXTRA_PP }));
    expect(screen.getByText(/27 acordos pagos · fora da meta, só acompanhamento/))
      .toBeInTheDocument();
  });

  /**
   * O erro fácil seria somar o extra ao total. 65.611,62 + 35.348,64 =
   * 100.960,26 — se esse número aparecer em qualquer lugar da tela, alguém
   * somou.
   */
  it('não soma o extra ao total recebido', () => {
    render0(dados({
      totalRecebido: 65_611.62, diretoExtra: SO_DIRETO, extraTabulado: EXTRA_PP,
    }));
    expect(screen.queryByText(/R\$\s*100\.960,26/)).not.toBeInTheDocument();
    // O total segue sendo o do analítico — aparece no card e no rodapé do donut.
    expect(screen.getAllByText(/R\$\s*65\.611,62/).length).toBeGreaterThan(0);
  });

  /**
   * Sem esta regra o bloco inteiro sumiria justamente no setor da PaguePlay que
   * tabula extra: `extra` do analítico é 0 e a decisão olhava só para ele.
   */
  it('extra só de tabulação já abre o bloco de vínculo', () => {
    render0(dados({
      diretoExtra: { ...SO_DIRETO, direto: 0, qtdDireto: 0 },
      extraTabulado: EXTRA_PP,
    }));
    expect(screen.getByText('Recebimento extra')).toBeInTheDocument();
  });

  it('nenhum extra tabulado no mês volta a ler o analítico', () => {
    render0(dados({
      diretoExtra: DIRETO_EXTRA,
      extraTabulado: { bruto: 0, ho: 0, qtd: 0 },
    }));
    expect(screen.getByText(/12 pagamentos/)).toBeInTheDocument();
  });

  it('singular não escreve "1 acordos pagos"', () => {
    render0(dados({
      diretoExtra: SO_DIRETO,
      extraTabulado: { bruto: 291.07, ho: 72.66, qtd: 1 },
    }));
    expect(screen.getByText(/1 acordo pago · fora da meta/)).toBeInTheDocument();
  });

  /** BookPlay: `tipo_comissao` vem preenchido e o caminho normal está certo. */
  it('sem tabulação (BookPlay) o card segue vindo do relatório', () => {
    render0(dados({ diretoExtra: DIRETO_EXTRA, extraTabulado: null }));
    expect(screen.getByText(/12 pagamentos/)).toBeInTheDocument();
  });
});

describe('CardsMetas — formas de pagamento', () => {
  const FORMAS = {
    'Pix':    { bruto: 40_000, qtd: 80 },
    'Boleto': { bruto: 20_000, qtd: 30 },
    'Cartão': { bruto: 5_611.62, qtd: 4 },
  };

  /**
   * As formas deixaram de ser uma fileira de cards: eram sete ou oito números
   * competindo com meta e projeção. Agora vivem no breakdown do donut.
   */
  it('não existe mais um card solto por forma de pagamento', () => {
    render0(dados({ porForma: FORMAS }));
    // O rótulo aparece na lista dentro do donut, nunca como card de métrica.
    for (const forma of Object.keys(FORMAS)) {
      const achados = screen.queryAllByText(forma);
      for (const el of achados) {
        expect(el.className).not.toMatch(/uppercase/); // classe do label de MetricCard
      }
    }
  });

  it('as duas maiores aparecem no resumo do donut', () => {
    render0(dados({ porForma: FORMAS }));
    expect(screen.getByText('Top formas de pagamento')).toBeInTheDocument();
    expect(screen.getByText('Pix')).toBeInTheDocument();
    expect(screen.getByText('Boleto')).toBeInTheDocument();
    expect(screen.getByText(/\+1 mais/)).toBeInTheDocument();
  });

  it('sem formas, a seção inteira some', () => {
    render0(dados());
    expect(screen.queryByText('Top formas de pagamento')).not.toBeInTheDocument();
  });
});

describe('CardsMetas — projeção', () => {
  it('mostra a % de projeção e a base de dias úteis', () => {
    render0(dados());
    expect(screen.getByText('177%')).toBeInTheDocument();
    expect(screen.getByText('do esperado até hoje')).toBeInTheDocument();
    expect(screen.getByText('Com base em 6 de 21 dias úteis')).toBeInTheDocument();
  });

  it('o donut preservado mostra a META do mês, não a projeção', () => {
    render0(dados());
    expect(screen.getByText('Progresso da meta')).toBeInTheDocument();
    // 65.611,62 de 130.000 = 50%, e não os 177% da projeção
    expect(screen.getByText('50%')).toBeInTheDocument();
    expect(screen.getByText('da meta')).toBeInTheDocument();
    // O rodapé "R$ X de R$ Y" é um <p> com spans dentro — casa pelo texto todo.
    // Os valores soltos aparecem em mais de um card, então não servem de âncora.
    expect(screen.getByText(
      (_, el) => el?.tagName === 'P'
        && /R\$\s*65\.611,62\s*de\s*R\$\s*130\.000,00/.test(el.textContent ?? ''),
    )).toBeInTheDocument();
  });

  it('meta batida acende o aviso no donut', () => {
    render0(dados({
      totalRecebido: 140_000,
      projecao: calcularProjecao({
        meta: 130_000, recebido: 140_000,
        totalUteis: 21, decorridos: 6, quartis: QUARTIS_PADRAO,
      }),
    }));
    expect(screen.getByText('Meta atingida!')).toBeInTheDocument();
  });

  it('o rodapé do donut diz de quem é a meta', () => {
    render0(daEquipe());
    expect(screen.getByText('meta da equipe Matheus')).toBeInTheDocument();
  });

  it('acima do esperado mostra sinal de mais e a legenda certa', () => {
    render0(dados());
    expect(screen.getByText(/\+\s*R\$\s*28\.468,76/)).toBeInTheDocument();
    expect(screen.getByText('Acima da meta projetada')).toBeInTheDocument();
  });

  it('abaixo do esperado mostra sinal de menos', () => {
    render0(dados({
      totalRecebido: 10_000,
      projecao: calcularProjecao({
        meta: 130_000, recebido: 10_000,
        totalUteis: 21, decorridos: 6, quartis: QUARTIS_PADRAO,
      }),
    }));
    expect(screen.getByText('Abaixo da meta projetada')).toBeInTheDocument();
  });

  it('sem meta some tudo de projeção e explica por quê', () => {
    render0(dados({ meta: null, projecao: null }));
    expect(screen.queryByText('Progresso da meta')).not.toBeInTheDocument();
    expect(screen.queryByText('Valor esperado')).not.toBeInTheDocument();
    expect(screen.queryByText('Diferença para projeção')).not.toBeInTheDocument();
    expect(screen.queryByText('Análise por quartil')).not.toBeInTheDocument();
    expect(screen.getByText(/Sem meta cadastrada para este mês/i)).toBeInTheDocument();
    // O recebimento continua na tela.
    expect(screen.getByText('Total recebido')).toBeInTheDocument();
  });
});

describe('CardsMetas — quartil', () => {
  it('mostra a faixa, o quanto falta e a % alcançada', () => {
    render0(dados());
    expect(screen.getByText('1º Quartil')).toBeInTheDocument();
    expect(screen.getByText(/Faltam R\$\s*64\.388,38 · 50,5% da meta/)).toBeInTheDocument();
  });

  it('meta batida não mostra valor negativo faltando', () => {
    render0(dados({
      totalRecebido: 140_000,
      projecao: calcularProjecao({
        meta: 130_000, recebido: 140_000,
        totalUteis: 21, decorridos: 6, quartis: QUARTIS_PADRAO,
      }),
    }));
    expect(screen.getByText(/Meta alcançada — 107,7% dela/i)).toBeInTheDocument();
    expect(screen.queryByText(/Faltam/i)).not.toBeInTheDocument();
  });
});

describe('CardsMetas — baixa anterior', () => {
  it('mostra valor, dia da semana, data e contagem', () => {
    render0(dados({ baixaAnterior: { dia: 10, bruto: 18_384.11, qtd: 121 } }));
    expect(screen.getByText('Recebido baixa anterior')).toBeInTheDocument();
    expect(screen.getByText(/Segunda-feira \(10\/08\/2026\)/)).toBeInTheDocument();
    expect(screen.getByText(/121 registros/)).toBeInTheDocument();
  });

  it('singular quando é um registro só', () => {
    render0(dados({ baixaAnterior: { dia: 7, bruto: 100, qtd: 1 } }));
    expect(screen.getByText(/·\s*1 registro$/)).toBeInTheDocument();
  });

  it('sem meta o card ainda aparece — ele não depende de projeção', () => {
    render0(dados({
      meta: null, projecao: null,
      baixaAnterior: { dia: 10, bruto: 18_384.11, qtd: 121 },
    }));
    expect(screen.getByText('Recebido baixa anterior')).toBeInTheDocument();
  });

  it('sem dia anterior com movimento, o card some', () => {
    render0(dados({ baixaAnterior: null }));
    expect(screen.queryByText('Recebido baixa anterior')).not.toBeInTheDocument();
  });
});
