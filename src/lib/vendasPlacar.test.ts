import { describe, it, expect } from 'vitest';
import {
  indexarPessoas, placarPorOperador, ordenarPlacar, separarAutomacao,
  placarPorEquipe, vendasPorUF, vendasPorFormaDePagamento,
  serieDiaria, destaqueDoDia, totalDoRecorte,
  type PessoaDoPlacar, type VendaAgrupavel,
} from './vendasPlacar';
import { resumirVendas } from './vendas';

/*
 * O cenário é o setor Vendas Bookplay em miniatura: três equipes, uma pessoa
 * sem equipe, e a automação junto — que é exatamente a forma do problema real.
 *
 * As gavetas estão todas representadas de propósito. Um teste que só usa venda
 * na régua não prova nada: a régua é justamente o que separa as populações, e
 * o defeito que ela existe para impedir é uma cancelada entrar no placar.
 */
const EQUIPE_PEC2 = 'e-pec2';
const EQUIPE_PEC5 = 'e-pec5';

const PESSOAS: PessoaDoPlacar[] = [
  { id: 'ana',  nome: 'Ana',  robo: false, equipe_id: EQUIPE_PEC2, equipe_nome: 'PEC 2', setor_id: 's1', setor_nome: 'Vendas' },
  { id: 'bea',  nome: 'Bea',  robo: false, equipe_id: EQUIPE_PEC2, equipe_nome: 'PEC 2', setor_id: 's1', setor_nome: 'Vendas' },
  { id: 'caio', nome: 'Caio', robo: false, equipe_id: EQUIPE_PEC5, equipe_nome: 'PEC 5', setor_id: 's1', setor_nome: 'Vendas' },
  { id: 'duda', nome: 'Duda', robo: false, equipe_id: null,        equipe_nome: null,    setor_id: 's1', setor_nome: 'Vendas' },
  { id: 'robo', nome: 'IA Alfa', robo: true, equipe_id: null,      equipe_nome: null,    setor_id: 's1', setor_nome: 'Vendas' },
];

const INDICE = indexarPessoas(PESSOAS);

function venda(p: Partial<VendaAgrupavel> & { operador_id: string }): VendaAgrupavel {
  return {
    situacao: 'confirmada',
    contrato_assinado: true,
    valor_total: 1_000,
    valor_recebido: 0,
    valor_entrada: null,
    equipe_id: null,
    setor_id: 's1',
    uf: 'SP',
    forma_pagamento: 'PIX',
    data_venda: '2026-09-10',
    data_confirmacao: '2026-09-10',
    ...p,
  };
}

const VENDAS: VendaAgrupavel[] = [
  venda({ operador_id: 'ana',  valor_total: 5_000, valor_entrada: 2_000, valor_recebido: 2_000, data_confirmacao: '2026-09-10', uf: 'SP' }),
  venda({ operador_id: 'ana',  valor_total: 3_000, uf: 'MG', forma_pagamento: 'Cartão', data_confirmacao: '2026-09-11' }),
  venda({ operador_id: 'bea',  valor_total: 4_000, uf: 'SP', data_confirmacao: '2026-09-11' }),
  venda({ operador_id: 'caio', valor_total: 9_000, uf: 'BA', forma_pagamento: 'Boleto', data_confirmacao: '2026-09-11' }),
  venda({ operador_id: 'duda', valor_total: 2_000, uf: '',   forma_pagamento: null, data_confirmacao: '2026-09-11' }),
  venda({ operador_id: 'robo', valor_total: 20_000, uf: 'SP', data_confirmacao: '2026-09-11' }),
  // Fora da régua — cada uma numa gaveta diferente.
  venda({ operador_id: 'ana',  valor_total: 7_000, contrato_assinado: false }),
  venda({ operador_id: 'bea',  valor_total: 6_000, situacao: 'devolvida' }),
  venda({ operador_id: 'bea',  valor_total: 8_000, situacao: 'cancelada' }),
  venda({ operador_id: 'caio', valor_total: 1_500, situacao: 'aberta', data_confirmacao: null }),
];

/** O que está na régua, somado à mão — a referência de todo o resto. */
const NA_REGUA_VALOR = 5_000 + 3_000 + 4_000 + 9_000 + 2_000 + 20_000;
const NA_REGUA_QTD = 6;

describe('o placar por operador', () => {
  it('soma só a régua, e uma linha por pessoa que aparece', () => {
    const placar = placarPorOperador(VENDAS, INDICE);
    expect(placar.map(l => l.operadorId)).toEqual(['robo', 'caio', 'ana', 'bea', 'duda']);

    const ana = placar.find(l => l.operadorId === 'ana')!;
    // 5.000 + 3.000. Os 7.000 sem assinatura NÃO entram — e não somem: estão
    // na gaveta, que é o ponto inteiro da régua.
    expect(ana.resumo.valor).toBe(8_000);
    expect(ana.resumo.quantidade).toBe(2);
    expect(ana.resumo.porGaveta.pendente_assinatura).toBe(1);
    expect(ana.resumo.valorPorGaveta.pendente_assinatura).toBe(7_000);
  });

  it('a soma das linhas é o total do recorte — nenhuma venda se perde', () => {
    const placar = placarPorOperador(VENDAS, INDICE);
    const soma = placar.reduce((s, l) => s + l.resumo.valor, 0);
    expect(soma).toBe(NA_REGUA_VALOR);
    expect(placar.reduce((s, l) => s + l.resumo.quantidade, 0)).toBe(NA_REGUA_QTD);
  });

  it('percentual de devolução e cancelamento exclui a aberta do denominador', () => {
    const bea = placarPorOperador(VENDAS, INDICE).find(l => l.operadorId === 'bea')!;
    // 1 na meta + 1 devolvida + 1 cancelada = 3 que chegaram a ser confirmadas.
    expect(bea.resumo.pctDevolucao).toBeCloseTo(1 / 3, 10);
    expect(bea.resumo.pctCancelamento).toBeCloseTo(1 / 3, 10);

    // Caio tem 1 na meta e 1 aberta: a aberta não entra no denominador, então
    // o percentual é 0 sobre 1, e não 0 sobre 2.
    const caio = placarPorOperador(VENDAS, INDICE).find(l => l.operadorId === 'caio')!;
    expect(caio.resumo.pctDevolucao).toBe(0);
  });

  it('ordena pela régua pedida, e por quantidade o pódio muda', () => {
    const porValor = placarPorOperador(VENDAS, INDICE, 'valor');
    const porQtd   = placarPorOperador(VENDAS, INDICE, 'quantidade');
    // Por valor o robô lidera com 20.000; por quantidade a Ana lidera com 2.
    expect(porValor[0].operadorId).toBe('robo');
    expect(porQtd[0].operadorId).toBe('ana');
  });

  it('desempata pelo nome, para a lista não piscar ao recarregar', () => {
    const vazias: VendaAgrupavel[] = [
      venda({ operador_id: 'caio', situacao: 'cancelada' }),
      venda({ operador_id: 'ana',  situacao: 'cancelada' }),
      venda({ operador_id: 'bea',  situacao: 'cancelada' }),
    ];
    expect(placarPorOperador(vazias, INDICE).map(l => l.nome)).toEqual(['Ana', 'Bea', 'Caio']);
  });

  it('o nome do cadastro vence o congelado no join da venda', () => {
    const comNomeVelho = [venda({ operador_id: 'ana', perfis: { id: 'ana', nome: 'Ana Sobrenome Antigo' } })];
    expect(placarPorOperador(comNomeVelho, INDICE)[0].nome).toBe('Ana');
  });

  it('operador fora do índice não vira robô nem some', () => {
    const doGeral = [venda({ operador_id: 'fantasma', perfis: { id: 'fantasma', nome: 'Julia' } })];
    const linha = placarPorOperador(doGeral, INDICE)[0];
    expect(linha.nome).toBe('Julia');
    expect(linha.robo).toBe(false);
    expect(linha.resumo.valor).toBe(1_000);
  });

  it('`ordenarPlacar` não refaz conta nenhuma', () => {
    const placar = placarPorOperador(VENDAS, INDICE, 'valor');
    const reordenado = ordenarPlacar(placar, 'quantidade');
    expect(reordenado.reduce((s, l) => s + l.resumo.valor, 0)).toBe(NA_REGUA_VALOR);
    expect(reordenado[0].operadorId).toBe('ana');
  });
});

describe('a automação sai do placar por cabeça, nunca do total', () => {
  it('as duas listas somadas continuam sendo o recorte inteiro', () => {
    const { pessoas, automacao } = separarAutomacao(placarPorOperador(VENDAS, INDICE));
    expect(automacao.map(l => l.operadorId)).toEqual(['robo']);
    const soma = [...pessoas, ...automacao].reduce((s, l) => s + l.resumo.valor, 0);
    expect(soma).toBe(NA_REGUA_VALOR);
  });

  it('o total do recorte inclui o robô, e a fração diz o quanto é dele', () => {
    const t = totalDoRecorte(VENDAS, INDICE);
    expect(t.resumo.valor).toBe(NA_REGUA_VALOR);
    expect(t.valorAutomacao).toBe(20_000);
    expect(t.quantidadeAutomacao).toBe(1);
    expect(t.fracaoAutomacao).toBeCloseTo(20_000 / NA_REGUA_VALOR, 10);
    // Ana, Bea, Caio e Duda. O robô não é gente que vendeu.
    expect(t.pessoasQueVenderam).toBe(4);
  });

  it('sem faturamento a fração é nula, e não zero', () => {
    const t = totalDoRecorte([venda({ operador_id: 'ana', situacao: 'cancelada' })], INDICE);
    expect(t.fracaoAutomacao).toBeNull();
  });
});

describe('o placar por equipe', () => {
  it('«Sem equipe» aparece, e sempre por último', () => {
    const equipes = placarPorEquipe(VENDAS, INDICE);
    expect(equipes.at(-1)?.equipeId).toBeNull();
    expect(equipes.at(-1)?.nome).toBe('Sem equipe');
  });

  it('a soma das equipes é o total do setor', () => {
    const soma = placarPorEquipe(VENDAS, INDICE).reduce((s, e) => s + e.resumo.valor, 0);
    expect(soma).toBe(NA_REGUA_VALOR);
  });

  it('conta pessoas, não linhas, e não conta o robô como gente', () => {
    const equipes = placarPorEquipe(VENDAS, INDICE);
    const pec2 = equipes.find(e => e.equipeId === EQUIPE_PEC2)!;
    // Ana (3 linhas) e Bea (3 linhas) são duas pessoas.
    expect(pec2.pessoas).toBe(2);

    const sem = equipes.find(e => e.equipeId === null)!;
    // Duda e o robô caem os dois em «sem equipe»; só a Duda é gente.
    expect(sem.pessoas).toBe(1);
    expect(sem.resumo.valor).toBe(2_000 + 20_000);
  });

  it('a equipe do cadastro vence a congelada na venda', () => {
    const congelada = [venda({ operador_id: 'ana', equipe_id: 'equipe-antiga' })];
    expect(placarPorEquipe(congelada, INDICE)[0].equipeId).toBe(EQUIPE_PEC2);
  });
});

describe('os recortes de estado e forma de pagamento', () => {
  it('somam o total da régua, com a fatia vazia nomeada', () => {
    const ufs = vendasPorUF(VENDAS);
    expect(ufs.reduce((s, f) => s + f.valor, 0)).toBe(NA_REGUA_VALOR);
    // SP: 5.000 (Ana) + 4.000 (Bea) + 20.000 (robô) = 29.000, o maior.
    expect(ufs[0]).toMatchObject({ chave: 'SP', quantidade: 3, valor: 29_000 });
    expect(ufs.find(f => f.chave === '__sem_uf__')).toMatchObject({ rotulo: 'Sem UF', valor: 2_000 });
  });

  it('a fração das fatias fecha em 1', () => {
    const soma = vendasPorUF(VENDAS).reduce((s, f) => s + f.fracao, 0);
    expect(soma).toBeCloseTo(1, 10);
  });

  it('forma de pagamento não inventa decomposição — conta o valor da venda', () => {
    const formas = vendasPorFormaDePagamento(VENDAS);
    expect(formas.reduce((s, f) => s + f.valor, 0)).toBe(NA_REGUA_VALOR);
    expect(formas.find(f => f.chave === 'boleto')).toMatchObject({ rotulo: 'Boleto', valor: 9_000 });
    expect(formas.find(f => f.chave === '__sem_forma__')).toMatchObject({ valor: 2_000 });
  });

  it('venda fora da régua não entra em recorte nenhum', () => {
    const soCancelada = [venda({ operador_id: 'ana', situacao: 'cancelada', uf: 'RJ' })];
    expect(vendasPorUF(soCancelada)).toEqual([]);
    expect(vendasPorFormaDePagamento(soCancelada)).toEqual([]);
  });
});

describe('a série diária e o destaque', () => {
  it('a série sobe no tempo e não inventa dia vazio', () => {
    const serie = serieDiaria(VENDAS, 'confirmacao');
    expect(serie.map(p => p.dia)).toEqual(['2026-09-10', '2026-09-11']);
    expect(serie[0]).toMatchObject({ dia: '2026-09-10', quantidade: 1, valor: 5_000 });
    expect(serie.reduce((s, p) => s + p.valor, 0)).toBe(NA_REGUA_VALOR);
  });

  it('trocar o eixo remonta a pergunta, e não filtra a mesma lista', () => {
    // Todas as `data_venda` são 10/09; pelo eixo da venda tudo cai num dia só,
    // inclusive a aberta, que pelo eixo de confirmação nem aparece.
    const porVenda = serieDiaria(VENDAS, 'venda');
    expect(porVenda.map(p => p.dia)).toEqual(['2026-09-10']);
    expect(porVenda[0].quantidade).toBe(NA_REGUA_QTD);
  });

  it('o destaque é do último dia com venda, e a automação não disputa', () => {
    const d = destaqueDoDia(VENDAS, INDICE, 'confirmacao')!;
    expect(d.dia).toBe('2026-09-11');
    // No dia 11 o robô fez 20.000 e o Caio 9.000. O destaque é o Caio.
    expect(d.linha.operadorId).toBe('caio');
    expect(d.linha.resumo.valor).toBe(9_000);
  });

  it('por quantidade o destaque pode ser outra pessoa', () => {
    const dia: VendaAgrupavel[] = [
      venda({ operador_id: 'caio', valor_total: 9_000 }),
      venda({ operador_id: 'ana',  valor_total: 1_000 }),
      venda({ operador_id: 'ana',  valor_total: 1_000 }),
    ];
    expect(destaqueDoDia(dia, INDICE, 'confirmacao', 'valor')!.linha.operadorId).toBe('caio');
    expect(destaqueDoDia(dia, INDICE, 'confirmacao', 'quantidade')!.linha.operadorId).toBe('ana');
  });

  it('sem venda na régua não há destaque — e não há pódio com traço', () => {
    expect(destaqueDoDia([], INDICE, 'confirmacao')).toBeNull();
    expect(destaqueDoDia([venda({ operador_id: 'ana', situacao: 'cancelada' })], INDICE, 'confirmacao')).toBeNull();
  });

  it('um dia só de robô não elege ninguém, em vez de eleger o robô', () => {
    const soRobo = [venda({ operador_id: 'robo', valor_total: 20_000 })];
    expect(destaqueDoDia(soRobo, INDICE, 'confirmacao')).toBeNull();
  });
});

describe('a régua nunca é reimplementada aqui', () => {
  it('o total do recorte é, ao centavo, o `resumirVendas` da lista', () => {
    expect(totalDoRecorte(VENDAS, INDICE).resumo).toEqual(resumirVendas(VENDAS));
  });

  it('lista vazia devolve tudo vazio, e nada explode', () => {
    expect(placarPorOperador([], INDICE)).toEqual([]);
    expect(placarPorEquipe([], INDICE)).toEqual([]);
    expect(serieDiaria([], 'confirmacao')).toEqual([]);
    expect(totalDoRecorte([], INDICE).resumo.valor).toBe(0);
  });
});
