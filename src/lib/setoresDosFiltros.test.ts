/**
 * setoresDosFiltros.test.ts — que setor entra num filtro de setor.
 *
 * Pedido de 05/10/2026: inativo não existe mais, e setor de sistema (Padrão,
 * Núcleo de Inteligência e Gestão) não tem operação para filtrar.
 */
import { describe, it, expect } from 'vitest';
import {
  setorEntraNosFiltros, setoresDosFiltros, listaDoFiltroDeSetores, ehMesPassado,
} from './setoresDosFiltros';
import { deslocarMes, mesAtual } from './mesReferencia';

const MES_PASSADO = deslocarMes(mesAtual(), -1);
const MES_QUE_VEM = deslocarMes(mesAtual(), 1);

describe('setorEntraNosFiltros', () => {
  it('setor de operação ativo entra', () => {
    expect(setorEntraNosFiltros({ nome: 'Play 3', ativo: true, tipo: 'operacao' })).toBe(true);
  });

  it('setor inativo fica fora do mês corrente em diante', () => {
    const inativo = { nome: 'Play 3', ativo: false, tipo: 'operacao' };
    expect(setorEntraNosFiltros(inativo)).toBe(false);
    expect(setorEntraNosFiltros(inativo, { mes: mesAtual() })).toBe(false);
    expect(setorEntraNosFiltros(inativo, { mes: MES_QUE_VEM })).toBe(false);
  });

  it('num mês passado o setor inativo continua — naquele mês ele existia', () => {
    expect(setorEntraNosFiltros({ nome: 'Play 3', ativo: false }, { mes: MES_PASSADO })).toBe(true);
  });

  it('setor de sistema fica fora também nos meses passados', () => {
    expect(setorEntraNosFiltros({ nome: 'Padrão', ativo: true }, { mes: MES_PASSADO })).toBe(false);
    expect(setorEntraNosFiltros({ nome: 'X', tipo: 'nucleo' }, { mes: MES_PASSADO })).toBe(false);
  });

  it('o Setor Padrão fica fora pelo id, mesmo renomeado', () => {
    expect(setorEntraNosFiltros({
      id: '00000000-0000-0000-0000-000000000000', nome: 'Outro nome', ativo: true, tipo: 'operacao',
    })).toBe(false);
  });

  it('o Núcleo fica fora pelo tipo, qualquer que seja o nome', () => {
    expect(setorEntraNosFiltros({ nome: 'Qualquer nome', ativo: true, tipo: 'nucleo' })).toBe(false);
  });

  it.each([
    'Padrão', 'padrao', 'Setor Padrão', '  SETOR  PADRÃO ',
    'Inteligência e Gestão', 'Núcleo de Inteligência e Gestão',
    'Teste', 'Setor teste', 'Testes', 'Test',
  ])('«%s» fica fora pelo nome', nome => {
    expect(setorEntraNosFiltros({ nome, ativo: true, tipo: 'operacao' })).toBe(false);
  });

  it.each(['Receptivo', 'Treinamento', 'Marília Digital', 'Em dia', 'Atestado'])(
    '«%s» entra — o nome só tira setor de sistema',
    nome => { expect(setorEntraNosFiltros({ nome, ativo: true })).toBe(true); },
  );

  it('sem as colunas (lista antiga), decide só pelo nome', () => {
    expect(setorEntraNosFiltros({ nome: 'Play 1' })).toBe(true);
    expect(setorEntraNosFiltros({ nome: 'Padrão' })).toBe(false);
  });
});

describe('setoresDosFiltros', () => {
  it('tira inativo e de sistema e mantém a ordem', () => {
    const lista = [
      { id: 'a', nome: 'Play 2', ativo: true, tipo: 'operacao' },
      { id: 'b', nome: 'Padrão', ativo: true, tipo: 'operacao' },
      { id: 'c', nome: 'Play 9', ativo: false, tipo: 'operacao' },
      { id: 'd', nome: 'Núcleo', ativo: true, tipo: 'nucleo' },
      { id: 'e', nome: 'Play 1', ativo: true, tipo: 'operacao' },
    ];
    expect(setoresDosFiltros(lista).map(s => s.id)).toEqual(['a', 'e']);
  });
});

describe('listaDoFiltroDeSetores', () => {
  const linhas = [
    { id: 'dig', nome: 'Marília Digital', ativo: true, tipo: 'operacao' },
    { id: 'velho', nome: 'Play 9', ativo: false, tipo: 'operacao' },
  ];

  it('sem retrato, os nomes de hoje', () => {
    expect(listaDoFiltroDeSetores(linhas)).toEqual([{ id: 'dig', nome: 'Marília Digital' }]);
  });

  it('mês passado com retrato: nome do mês, o inativo e o apagado que existiam nele', () => {
    const doMes = { dig: 'Amauri Digital', velho: 'Play 9', apagado: 'Play 7', sis: 'Padrão' };
    expect(listaDoFiltroDeSetores(linhas, doMes, { mes: MES_PASSADO })).toEqual([
      { id: 'dig', nome: 'Amauri Digital' },
      { id: 'velho', nome: 'Play 9' },
      { id: 'apagado', nome: 'Play 7' },
    ]);
  });
});

describe('ehMesPassado', () => {
  it('só antes do mês corrente; ausente ou inválido conta como hoje', () => {
    expect(ehMesPassado(MES_PASSADO)).toBe(true);
    expect(ehMesPassado(mesAtual())).toBe(false);
    expect(ehMesPassado(MES_QUE_VEM)).toBe(false);
    expect(ehMesPassado(null)).toBe(false);
    expect(ehMesPassado('lixo')).toBe(false);
  });
});
