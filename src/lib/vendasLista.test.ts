import { describe, it, expect } from 'vitest';
import {
  statusDaLinha, abaDaVenda, casaComBusca, lerValorDigitado, lerVendasColadas,
} from './vendasLista';

describe('statusDaLinha', () => {
  it('aberta lançada na mão espera o relatório; aberta da prévia está só em aberto', () => {
    expect(statusDaLinha({ situacao: 'aberta', contrato_assinado: false, origem: 'manual' }))
      .toBe('aguardando_relatorio');
    expect(statusDaLinha({ situacao: 'aberta', contrato_assinado: false, origem: 'setor' }))
      .toBe('em_aberto');
  });

  it('segue a régua: confirmada sem assinatura não está na meta', () => {
    expect(statusDaLinha({ situacao: 'confirmada', contrato_assinado: false, origem: 'geral' }))
      .toBe('falta_assinatura');
    expect(statusDaLinha({ situacao: 'confirmada', contrato_assinado: true, origem: 'geral' }))
      .toBe('na_meta');
    // Devolvida continua assinada no ERP — e continua devolvida.
    expect(statusDaLinha({ situacao: 'devolvida', contrato_assinado: true, origem: 'geral' }))
      .toBe('devolvida');
  });
});

describe('abaDaVenda', () => {
  it('pendência é aberta ou falta de assinatura; perda é devolvida ou cancelada', () => {
    expect(abaDaVenda({ situacao: 'aberta', contrato_assinado: false })).toBe('pendencias');
    expect(abaDaVenda({ situacao: 'confirmada', contrato_assinado: false })).toBe('pendencias');
    expect(abaDaVenda({ situacao: 'confirmada', contrato_assinado: true })).toBe('na_meta');
    expect(abaDaVenda({ situacao: 'cancelada', contrato_assinado: false })).toBe('perdas');
    expect(abaDaVenda({ situacao: 'devolvida', contrato_assinado: true })).toBe('perdas');
  });
});

describe('casaComBusca', () => {
  const venda = { nr_documento: '13073323', cliente: 'João Ávila', perfis: { nome: 'Natiele Souza' } };

  it('acha NR pelos dígitos, mesmo colado com pontos', () => {
    expect(casaComBusca(venda, '13.073.323')).toBe(true);
    expect(casaComBusca(venda, '0733')).toBe(true);
  });

  it('acha cliente e operador sem acento nem caixa', () => {
    expect(casaComBusca(venda, 'joao avila')).toBe(true);
    expect(casaComBusca(venda, 'NATIELE')).toBe(true);
    expect(casaComBusca(venda, 'maria')).toBe(false);
  });

  it('busca vazia deixa tudo passar', () => {
    expect(casaComBusca(venda, '   ')).toBe(true);
  });
});

describe('lerValorDigitado', () => {
  it('lê pt-BR, decimal com ponto e milhar sem centavos', () => {
    expect(lerValorDigitado('5.572,00')).toBe(5572);
    expect(lerValorDigitado('R$ 5.572,50')).toBe(5572.5);
    expect(lerValorDigitado('5572,5')).toBe(5572.5);
    // É aqui que `parseBRL` erra: lê 557.200.
    expect(lerValorDigitado('5572.00')).toBe(5572);
    expect(lerValorDigitado('159.0')).toBe(159);
    expect(lerValorDigitado('5.572')).toBe(5572);
    expect(lerValorDigitado('5572')).toBe(5572);
  });

  it('sem número devolve null, nunca zero', () => {
    expect(lerValorDigitado('')).toBeNull();
    expect(lerValorDigitado('abc')).toBeNull();
    expect(lerValorDigitado(null)).toBeNull();
  });
});

describe('lerVendasColadas', () => {
  it('lê o que o Excel manda: tabulação, com cabeçalho', () => {
    const r = lerVendasColadas(
      'NR\tCliente\tValor\n13073323\tMaria Souza\t5.572,00\n13073400\tJosé\t3.087,20',
      2026,
    );
    expect(r).toEqual([
      { linha: 2, nr: '13073323', valor: 5572, cliente: 'Maria Souza', data: null, erro: null },
      { linha: 3, nr: '13073400', valor: 3087.2, cliente: 'José', data: null, erro: null },
    ]);
  });

  it('lê a mensagem de WhatsApp, em qualquer ordem, com data', () => {
    const [a, b] = lerVendasColadas(
      'Maria da Silva - 13073323 - R$ 5.572,00 - 19/09\n'
      + '4.990,00 13073401 Carlos Lima',
      2026,
    );
    expect(a).toMatchObject({ nr: '13073323', valor: 5572, cliente: 'Maria da Silva', data: '2026-09-19' });
    expect(b).toMatchObject({ nr: '13073401', valor: 4990, cliente: 'Carlos Lima', erro: null });
  });

  it('valor antes do NR não vira documento: o NR é o número mais comprido', () => {
    const [a] = lerVendasColadas('12000;13073323;Ana');
    expect(a).toMatchObject({ nr: '13073323', valor: 12000, cliente: 'Ana' });
  });

  it('linha ruim volta com erro em vez de sumir', () => {
    const r = lerVendasColadas('Maria 5.572,00\n13073323 sem valor aqui\n13073323 100,00\n13073323 200,00');
    expect(r.map(x => x.erro)).toEqual([
      'sem NR (número do documento, só dígitos)',
      'sem valor',
      null,
      'NR repetido nesta colagem',
    ]);
  });

  it('data de dois dígitos no ano e data impossível', () => {
    const [a, b] = lerVendasColadas('13073323 100,00 01/08/26\n13073324 100,00 31/02/2026');
    expect(a.data).toBe('2026-08-01');
    expect(b.data).toBeNull();
  });
});
