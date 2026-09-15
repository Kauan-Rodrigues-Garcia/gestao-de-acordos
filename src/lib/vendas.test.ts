import { describe, it, expect } from 'vitest';
import {
  contaNaMeta, classificarVenda, valorParaMeta, resumirVendas,
  diaDaVenda, agruparPorDia, origemSobrepoe, pareceLoginDeIa,
  GAVETAS_EM_ORDEM, SITUACOES_VENDA,
  type SituacaoVenda, type VendaSomavel,
} from './vendas';

function venda(p: Partial<VendaSomavel> = {}): VendaSomavel {
  return {
    situacao: 'confirmada',
    contrato_assinado: true,
    valor_total: 5_572,
    ...p,
  };
}

/*
 * Os números aqui saíram do relatório de prospecção de setembro/2026, empresa
 * toda — não são inventados. Se a régua mudar, estes testes dizem exatamente
 * quanto dinheiro muda de lado.
 */
describe('a régua: confirmada E assinada', () => {
  it('conta quando as duas condições valem', () => {
    expect(contaNaMeta(venda())).toBe(true);
  });

  it('não conta confirmada SEM assinatura — são 109 vendas, R$ 536.355,71', () => {
    expect(contaNaMeta(venda({ contrato_assinado: false }))).toBe(false);
  });

  it('não conta devolvida que CONTINUA assinada — são 187 vendas, R$ 877.917,32', () => {
    expect(contaNaMeta(venda({ situacao: 'devolvida' }))).toBe(false);
  });

  it('não conta cancelada que continua assinada — existe 1 em setembro', () => {
    expect(contaNaMeta(venda({ situacao: 'cancelada' }))).toBe(false);
  });

  it('não conta aberta, nem assinada', () => {
    expect(contaNaMeta(venda({ situacao: 'aberta' }))).toBe(false);
    expect(contaNaMeta(venda({ situacao: 'aberta', contrato_assinado: true }))).toBe(false);
  });

  it('a assinatura sozinha nunca basta, em nenhuma situação que não seja confirmada', () => {
    const fora = SITUACOES_VENDA.filter((s): s is SituacaoVenda => s !== 'confirmada');
    for (const situacao of fora) {
      expect(contaNaMeta(venda({ situacao, contrato_assinado: true }))).toBe(false);
    }
  });
});

describe('as gavetas do que fica de fora', () => {
  it('confirmada e assinada é o placar', () => {
    expect(classificarVenda(venda())).toBe('na_meta');
  });

  it('confirmada sem assinatura é cobrança do líder, não perda', () => {
    expect(classificarVenda(venda({ contrato_assinado: false }))).toBe('pendente_assinatura');
  });

  it('devolvida é devolvida mesmo com o contrato assinado', () => {
    expect(classificarVenda(venda({ situacao: 'devolvida' }))).toBe('devolvida');
    expect(classificarVenda(venda({ situacao: 'devolvida', contrato_assinado: false })))
      .toBe('devolvida');
  });

  it('cancelada idem — a situação vem antes da assinatura', () => {
    expect(classificarVenda(venda({ situacao: 'cancelada' }))).toBe('cancelada');
  });

  it('aberta é aberta', () => {
    expect(classificarVenda(venda({ situacao: 'aberta' }))).toBe('aberta');
  });

  it('toda situação cai em alguma gaveta conhecida', () => {
    for (const situacao of SITUACOES_VENDA) {
      for (const assinado of [true, false]) {
        const g = classificarVenda(venda({ situacao, contrato_assinado: assinado }));
        expect(GAVETAS_EM_ORDEM).toContain(g);
      }
    }
  });
});

describe('valor para meta', () => {
  it('é o valor da venda quando ela conta', () => {
    expect(valorParaMeta(venda({ valor_total: 5_572 }))).toBe(5_572);
  });

  it('é ZERO fora da régua — somar a lista não exige lembrar de filtrar', () => {
    expect(valorParaMeta(venda({ contrato_assinado: false }))).toBe(0);
    expect(valorParaMeta(venda({ situacao: 'devolvida' }))).toBe(0);
  });
});

describe('resumo de uma lista', () => {
  const lista: VendaSomavel[] = [
    venda({ valor_total: 5_572, valor_recebido: 2_000, valor_entrada: 2_000 }),
    venda({ valor_total: 4_776, valor_recebido: 4_776, valor_entrada: 0 }),
    venda({ valor_total: 6_972, contrato_assinado: false }),          // pendente
    venda({ valor_total: 3_984, situacao: 'devolvida' }),             // devolvida
    venda({ valor_total: 2_800, situacao: 'cancelada' }),             // cancelada
    venda({ valor_total: 5_000, situacao: 'aberta' }),                // aberta
  ];
  const r = resumirVendas(lista);

  it('as duas réguas saem juntas: quantidade e valor', () => {
    expect(r.quantidade).toBe(2);
    expect(r.valor).toBe(10_348);
  });

  it('cada gaveta é contada, inclusive as que não somam', () => {
    expect(r.porGaveta).toEqual({
      na_meta: 2, pendente_assinatura: 1, aberta: 1, devolvida: 1, cancelada: 1,
    });
  });

  it('o faturamento de fora da régua não se perde', () => {
    expect(r.valorPorGaveta.pendente_assinatura).toBe(6_972);
    expect(r.valorPorGaveta.aberta).toBe(5_000);
  });

  it('percentual exclui as abertas do denominador — 5 confirmadas alguma vez', () => {
    // base = na_meta 2 + pendente 1 + devolvida 1 + cancelada 1 = 5
    expect(r.pctDevolucao).toBeCloseTo(1 / 5, 12);
    expect(r.pctCancelamento).toBeCloseTo(1 / 5, 12);
  });

  it('só a régua alimenta recebido e entrada', () => {
    expect(r.recebido).toBe(6_776);
    expect(r.entrada).toBe(2_000);
    expect(r.comEntrada).toBe(1);   // era assim que janeiro media: quantidade
  });

  it('lista vazia devolve null no percentual, nunca NaN nem zero enganoso', () => {
    const z = resumirVendas([]);
    expect(z.pctDevolucao).toBeNull();
    expect(z.pctCancelamento).toBeNull();
    expect(z.quantidade).toBe(0);
  });

  it('lista só com abertas também: não houve confirmação para dividir', () => {
    const z = resumirVendas([venda({ situacao: 'aberta' })]);
    expect(z.pctDevolucao).toBeNull();
  });
});

describe('os dois eixos de data', () => {
  const v = { data_venda: '2026-06-10', data_confirmacao: '2026-09-09 07:35:43.447' };

  it('o eixo oficial é a confirmação — venda de junho conta em setembro', () => {
    expect(diaDaVenda(v, 'confirmacao')).toBe('2026-09-09');
  });

  it('o eixo do trabalho do dia é a data da venda', () => {
    expect(diaDaVenda(v, 'venda')).toBe('2026-06-10');
  });

  it('sem confirmação, o eixo oficial cai na data da venda em vez de sumir', () => {
    expect(diaDaVenda({ data_venda: '2026-09-14', data_confirmacao: null }, 'confirmacao'))
      .toBe('2026-09-14');
  });

  it('timestamp e data viram os mesmos dez caracteres', () => {
    expect(diaDaVenda({ data_venda: '2026-09-14T16:48:45.913Z' }, 'venda')).toBe('2026-09-14');
  });
});

describe('agrupar por dia', () => {
  const vendas = [
    { id: 'a', data_venda: '2026-09-07', data_confirmacao: '2026-09-07' },
    { id: 'b', data_venda: '2026-09-07', data_confirmacao: '2026-09-08' },
    { id: 'c', data_venda: '2026-09-08', data_confirmacao: '2026-09-08' },
  ];

  it('o dia mais recente vem primeiro — a tela abre em hoje', () => {
    expect(agruparPorDia(vendas, 'venda').map(g => g.dia)).toEqual(['2026-09-08', '2026-09-07']);
  });

  it('o dia 07 guarda o que foi vendido no dia 07', () => {
    const g = agruparPorDia(vendas, 'venda').find(x => x.dia === '2026-09-07');
    expect(g?.vendas.map(v => v.id)).toEqual(['a', 'b']);
  });

  it('trocar o eixo remonta os grupos', () => {
    const g = agruparPorDia(vendas, 'confirmacao').find(x => x.dia === '2026-09-08');
    expect(g?.vendas.map(v => v.id)).toEqual(['b', 'c']);
  });
});

describe('precedência entre as três camadas', () => {
  it('o relatório do setor corrige o que o operador digitou', () => {
    expect(origemSobrepoe('manual', 'setor')).toBe(true);
  });

  it('o geral corrige os dois', () => {
    expect(origemSobrepoe('manual', 'geral')).toBe(true);
    expect(origemSobrepoe('setor', 'geral')).toBe(true);
  });

  it('a prévia NÃO desfaz o oficial', () => {
    expect(origemSobrepoe('geral', 'setor')).toBe(false);
    expect(origemSobrepoe('geral', 'manual')).toBe(false);
    expect(origemSobrepoe('setor', 'manual')).toBe(false);
  });

  it('reimportar a mesma origem é correção legítima', () => {
    expect(origemSobrepoe('geral', 'geral')).toBe(true);
  });
});

describe('palpite de login de robô', () => {
  it('reconhece os prefixos do relatório', () => {
    expect(pareceLoginDeIa('ia_rafael_comum')).toBe(true);
    expect(pareceLoginDeIa('ia_ana_ligia')).toBe(true);
    expect(pareceLoginDeIa('IA-camila')).toBe(true);
  });

  it('não confunde humano cujo nome começa com «ia»', () => {
    expect(pareceLoginDeIa('ian_pereira')).toBe(false);
    expect(pareceLoginDeIa('iara_santos')).toBe(false);
  });

  it('vazio não é robô', () => {
    expect(pareceLoginDeIa(null)).toBe(false);
    expect(pareceLoginDeIa('')).toBe(false);
  });
});
