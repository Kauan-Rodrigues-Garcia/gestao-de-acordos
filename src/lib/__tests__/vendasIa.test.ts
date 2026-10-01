/**
 * IA vinculada a operador (01/10/2026): de quem é o crédito, e a prova de que
 * o vínculo nunca duplica dinheiro.
 *
 * O que se trava aqui:
 *   1. O período é [desde, ate): o dia da troca já é da pessoa nova.
 *   2. Venda sem vínculo na data fica com a IA — e com o setor, sem equipe.
 *   3. O TOTAL não muda com vínculo nenhum. A venda é uma linha; o vínculo só
 *      decide em que pessoa e em que equipe ela aparece.
 *   4. A IA vinculada sai da «automação» e entra na pessoa; o card «Vendas via
 *      IA» continua enxergando a venda como de IA.
 */
import { describe, it, expect } from 'vitest';
import {
  agruparCadastroIa, creditarVendas, creditoDaVenda, dataDoCredito, donoDaVenda,
  indexarIas, inicioDoMes, resumoDeIa, rotuloDoVendedor,
  type IaDoCadastro, type LinhaCadastroIa,
} from '../vendasIa';
import {
  equipeDaVenda, indexarPessoas, placarPorEquipe, placarPorOperador, totalDoRecorte,
  type PessoaDoPlacar, type VendaAgrupavel,
} from '../vendasPlacar';

const IA_COMUM = 'ia-kevin-comum';
const IA_INDIC = 'ia-camila';
const KEVIN = 'kevin';
const CAMILA = 'camila';

function ia(over: Partial<IaDoCadastro> & { id: string }): IaDoCadastro {
  return {
    nome: over.id, usuario: over.id, situacao: 'ativo', setorNome: 'Extreme',
    tipoId: null, tipoNome: null, vinculos: [], ...over,
  };
}

function venda(over: Partial<VendaAgrupavel> & { operador_id: string }): VendaAgrupavel {
  return {
    equipe_id: null, setor_id: 'extreme', uf: 'SP', forma_pagamento: 'Pix',
    data_venda: '2026-10-05', data_confirmacao: '2026-10-06',
    situacao: 'confirmada', contrato_assinado: true, conta_na_meta: true,
    valor_total: 1000, valor_na_meta: 1000, valor_recebido: 0,
    ...over,
  } as VendaAgrupavel;
}

const pessoas: PessoaDoPlacar[] = [
  { id: KEVIN, nome: 'Kevin', robo: false, equipe_id: 'eq-rafael', equipe_nome: 'Rafael', setor_id: 'extreme', setor_nome: 'Extreme' },
  { id: CAMILA, nome: 'Camila', robo: false, equipe_id: 'eq-bianca', equipe_nome: 'Bianca', setor_id: 'extreme', setor_nome: 'Extreme' },
  { id: IA_COMUM, nome: 'IA Kevin', robo: true, equipe_id: null, equipe_nome: null, setor_id: 'extreme', setor_nome: 'Extreme' },
  { id: IA_INDIC, nome: 'IA Camila', robo: true, equipe_id: null, equipe_nome: null, setor_id: 'extreme', setor_nome: 'Extreme' },
];
const indicePessoas = indexarPessoas(pessoas);

describe('creditoDaVenda — o período', () => {
  const kevinEmOutubro = ia({
    id: IA_COMUM,
    vinculos: [
      { iaId: IA_COMUM, operadorId: CAMILA, operadorNome: 'Camila', desde: '2026-09-01', ate: '2026-10-15' },
      { iaId: IA_COMUM, operadorId: KEVIN, operadorNome: 'Kevin', desde: '2026-10-15', ate: null },
    ],
  });

  it('o desde é inclusive e o ate é exclusivo: o dia da troca já é da pessoa nova', () => {
    expect(creditoDaVenda(kevinEmOutubro, '2026-10-14')?.operadorId).toBe(CAMILA);
    expect(creditoDaVenda(kevinEmOutubro, '2026-10-15')?.operadorId).toBe(KEVIN);
    expect(creditoDaVenda(kevinEmOutubro, '2026-09-01')?.operadorId).toBe(CAMILA);
  });

  it('antes do primeiro vínculo, ninguém leva o crédito', () => {
    expect(creditoDaVenda(kevinEmOutubro, '2026-08-31')).toBeNull();
  });

  it('vínculo em aberto vale para o futuro', () => {
    expect(creditoDaVenda(kevinEmOutubro, '2027-01-10')?.operadorId).toBe(KEVIN);
  });

  it('a data do crédito é a confirmação; sem ela, a data da venda', () => {
    expect(dataDoCredito({ data_venda: '2026-10-01', data_confirmacao: '2026-10-20' })).toBe('2026-10-20');
    expect(dataDoCredito({ data_venda: '2026-10-01', data_confirmacao: null })).toBe('2026-10-01');
  });

  it('mês inteiro começa no dia 1 do mês escolhido', () => {
    expect(inicioDoMes('2026-10-20')).toBe('2026-10-01');
  });
});

describe('creditarVendas', () => {
  const ias = indexarIas([
    ia({
      id: IA_COMUM, nome: 'IA Kevin', tipoId: 't-comum', tipoNome: 'Comum',
      vinculos: [{ iaId: IA_COMUM, operadorId: KEVIN, operadorNome: 'Kevin', desde: '2026-10-01', ate: null }],
    }),
    ia({ id: IA_INDIC, nome: 'IA Camila', tipoId: 't-indic', tipoNome: 'Indicação' }),
  ]);

  it('venda de gente volta igual, com o crédito nela mesma', () => {
    const [v] = creditarVendas([venda({ operador_id: CAMILA })], ias);
    expect(v.credito_id).toBe(CAMILA);
    expect(v.ia_id).toBeUndefined();
  });

  it('venda de IA vinculada credita o operador e NÃO muda operador_id', () => {
    const [v] = creditarVendas([venda({ operador_id: IA_COMUM })], ias);
    expect(v.operador_id).toBe(IA_COMUM);
    expect(v.credito_id).toBe(KEVIN);
    expect(v.ia_tipo_nome).toBe('Comum');
    expect(donoDaVenda(v)).toBe(KEVIN);
  });

  it('venda de IA sem vínculo fica com a IA', () => {
    const [v] = creditarVendas([venda({ operador_id: IA_INDIC })], ias);
    expect(v.credito_id).toBe(IA_INDIC);
    expect(v.ia_id).toBe(IA_INDIC);
  });

  it('não muta a lista que veio do banco', () => {
    const original = [venda({ operador_id: IA_COMUM })];
    creditarVendas(original, ias);
    expect(original[0].credito_id).toBeUndefined();
  });

  it('a lista mostra a IA como vendedora e diz para quem foi o crédito', () => {
    const [v] = creditarVendas([venda({ operador_id: IA_COMUM })], ias);
    expect(rotuloDoVendedor(v)).toEqual({ nome: 'IA Kevin', nota: 'IA · crédito de Kevin' });
  });
});

describe('placar com IA vinculada — o total nunca muda', () => {
  const lista = [
    venda({ operador_id: KEVIN, valor_total: 5000, valor_na_meta: 5000 }),
    venda({ operador_id: CAMILA, valor_total: 3000, valor_na_meta: 3000 }),
    venda({ operador_id: IA_COMUM, valor_total: 2000, valor_na_meta: 2000 }),
    venda({ operador_id: IA_INDIC, valor_total: 1000, valor_na_meta: 1000 }),
  ];

  const semVinculo = creditarVendas(lista, indexarIas([ia({ id: IA_COMUM }), ia({ id: IA_INDIC })]));
  const comVinculo = creditarVendas(lista, indexarIas([
    ia({
      id: IA_COMUM, tipoId: 't-comum', tipoNome: 'Comum',
      vinculos: [{ iaId: IA_COMUM, operadorId: KEVIN, operadorNome: 'Kevin', desde: '2026-10-01', ate: null }],
    }),
    ia({ id: IA_INDIC, tipoId: 't-indic', tipoNome: 'Indicação' }),
  ]));

  it('o total do recorte é o mesmo com e sem vínculo', () => {
    expect(totalDoRecorte(comVinculo, indicePessoas).resumo.valor)
      .toBe(totalDoRecorte(semVinculo, indicePessoas).resumo.valor);
    expect(totalDoRecorte(comVinculo, indicePessoas).resumo.valor).toBe(11000);
  });

  it('a soma do placar por pessoa é o total — nenhuma venda conta duas vezes', () => {
    const soma = placarPorOperador(comVinculo, indicePessoas).reduce((t, l) => t + l.resumo.valor, 0);
    expect(soma).toBe(11000);
  });

  it('a pessoa leva a venda da IA vinculada', () => {
    const kevin = placarPorOperador(comVinculo, indicePessoas).find(l => l.operadorId === KEVIN);
    expect(kevin?.resumo.valor).toBe(7000);
    expect(placarPorOperador(comVinculo, indicePessoas).some(l => l.operadorId === IA_COMUM)).toBe(false);
  });

  it('a equipe da pessoa leva a venda; a IA solta continua sem equipe', () => {
    const v = comVinculo.find(x => x.operador_id === IA_COMUM)!;
    expect(equipeDaVenda(v, indicePessoas)).toBe('eq-rafael');
    const equipes = placarPorEquipe(comVinculo, indicePessoas);
    expect(equipes.find(e => e.equipeId === 'eq-rafael')?.resumo.valor).toBe(7000);
    expect(equipes.find(e => e.equipeId === null)?.resumo.valor).toBe(1000);
    expect(equipes.reduce((t, e) => t + e.resumo.valor, 0)).toBe(11000);
  });

  it('IA vinculada sai da automação; IA solta continua nela', () => {
    expect(totalDoRecorte(semVinculo, indicePessoas).valorAutomacao).toBe(3000);
    expect(totalDoRecorte(comVinculo, indicePessoas).valorAutomacao).toBe(1000);
  });

  it('a gravada na venda da IA não vira equipe de quem leva o crédito', () => {
    const [v] = creditarVendas(
      [venda({ operador_id: IA_COMUM, equipe_id: 'equipe-velha-da-ia' })],
      indexarIas([ia({
        id: IA_COMUM,
        vinculos: [{ iaId: IA_COMUM, operadorId: 'sem-cadastro', operadorNome: 'X', desde: '2026-01-01', ate: null }],
      })]),
    );
    expect(equipeDaVenda(v, indicePessoas)).toBeNull();
  });
});

describe('resumoDeIa — o card «Vendas via IA»', () => {
  const ias = indexarIas([
    ia({
      id: IA_COMUM, tipoId: 't-comum', tipoNome: 'Comum',
      vinculos: [{ iaId: IA_COMUM, operadorId: KEVIN, operadorNome: 'Kevin', desde: '2026-10-01', ate: null }],
    }),
    ia({ id: IA_INDIC, tipoId: 't-indic', tipoNome: 'Indicação' }),
    ia({ id: 'ia-sem-tipo' }),
  ]);
  const vendas = creditarVendas([
    venda({ operador_id: KEVIN, valor_total: 5000 }),
    venda({ operador_id: IA_COMUM, valor_total: 2000 }),
    venda({ operador_id: IA_INDIC, valor_total: 1000 }),
    venda({ operador_id: 'ia-sem-tipo', valor_total: 500 }),
    venda({ operador_id: IA_INDIC, valor_total: 9999, situacao: 'cancelada', conta_na_meta: false }),
  ], ias);

  it('soma só a régua, por tipo, com «Sem tipo» por último', () => {
    const r = resumoDeIa(vendas);
    expect(r.valor).toBe(3500);
    expect(r.quantidade).toBe(3);
    expect(r.valorVinculado).toBe(2000);
    expect(r.porTipo.map(t => [t.rotulo, t.valor])).toEqual([
      ['Comum', 2000], ['Indicação', 1000], ['Sem tipo', 500],
    ]);
  });

  it('a soma das fatias é o valor do card', () => {
    const r = resumoDeIa(vendas);
    expect(r.porTipo.reduce((t, f) => t + f.valor, 0)).toBe(r.valor);
  });
});

describe('agruparCadastroIa — o que a RPC devolve', () => {
  const linha = (over: Partial<LinhaCadastroIa>): LinhaCadastroIa => ({
    ia_id: IA_COMUM, ia_nome: 'IA Kevin', ia_usuario: 'ia_kevin_comum', ia_situacao: 'ativo',
    setor_nome: 'Extreme', tipo_id: 't', tipo_nome: 'Comum',
    vinculo_id: null, operador_id: null, operador_nome: null, desde: null, ate: null, ...over,
  });

  it('IA sem vínculo vira uma IA com lista vazia', () => {
    const [i] = agruparCadastroIa([linha({})]);
    expect(i.vinculos).toEqual([]);
  });

  it('uma linha por período vira uma IA com os períodos em ordem', () => {
    const [i] = agruparCadastroIa([
      linha({ vinculo_id: 'b', operador_id: KEVIN, operador_nome: 'Kevin', desde: '2026-10-15', ate: null }),
      linha({ vinculo_id: 'a', operador_id: CAMILA, operador_nome: 'Camila', desde: '2026-09-01', ate: '2026-10-15' }),
    ]);
    expect(i.vinculos.map(v => v.operadorId)).toEqual([CAMILA, KEVIN]);
  });
});
