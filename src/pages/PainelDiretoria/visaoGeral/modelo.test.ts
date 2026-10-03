import { describe, expect, it } from 'vitest';
import {
  divisaoCofen, ehFimDeSemana, montarCidades, rotuloDoDia, semCidade, separarDia, variacaoPct,
} from './modelo';
import type { MesPorCidade, MesDoEscopo, UnidadeDoDia } from '@/services/mestre/diretoriaCidades.service';
import type { GradeDeSetores, SetorDoPainel } from '@/services/mestre/diretoriaSetores.service';

const BIRIGUI = 'c-bir', MARILIA = 'c-mar';

const escopo = (valor: number): MesDoEscopo => ({
  valor, linhas: 10, operadores: 3, colchao: 0, valorAnterior: valor * 0.9,
  mesAnteriorTotal: valor * 2, mesAnteriorDias: 20, serie: [], formas: [],
});

const MES: MesPorCidade = {
  mes: '2026-10', mesAnterior: '2026-09', diaCorte: 16, diasNoMes: 31, temLote: true, temLoteAnterior: true,
  geral: escopo(1000),
  cidades: [
    { ...escopo(300), cidadeId: MARILIA, nome: 'Marília' },
    { ...escopo(600), cidadeId: BIRIGUI, nome: 'Birigui' },
    { ...escopo(100), cidadeId: null, nome: null },
  ],
  carteiras: [
    { cod: '25', nome: 'COB PLAY 1', valor: 400, linhas: 5, operadores: 2, valorAnterior: 0, estado: 'vinculado', setorId: 's-p1', setorNome: 'Play 1', cidadeId: BIRIGUI, regra: 'nosso_produto' },
    { cod: '72', nome: 'MARILIA - COFEN', valor: 150, linhas: 4, operadores: 2, valorAnterior: 0, estado: 'novo', setorId: null, setorNome: null, cidadeId: MARILIA, regra: 'cofen' },
    { cod: '37', nome: 'COBRANÇA - GERAL', valor: 100, linhas: 2, operadores: 1, valorAnterior: 0, estado: 'novo', setorId: null, setorNome: null, cidadeId: null, regra: null },
  ],
};

const setor = (setorId: string, setorNome: string, valor: number): SetorDoPainel => ({
  setorId, setorNome, fotoUrl: null, valor, linhas: 1, operadores: 1, carteiras: 1,
  integralRecebido: 0, movidoParaCa: 0, valorAnterior: valor / 2, temAnterior: true, temGrupo: true,
});

const GRADE = {
  setores: [setor('s-p1', 'Play 1', 400), setor('s-p3', 'Play 3', 150), setor('s-p5', 'Play 5', 120)],
} as unknown as GradeDeSetores;

const SETORES = [
  { id: 's-p1', nome: 'Play 1', cidadeId: BIRIGUI, regra: 'nosso_produto' as const },
  { id: 's-p3', nome: 'Play 3', cidadeId: BIRIGUI, regra: 'nosso_produto' as const },
  { id: 's-p5', nome: 'Play 5', cidadeId: MARILIA, regra: 'nosso_produto' as const },
];

describe('as cidades', () => {
  const cidades = montarCidades(MES, GRADE, SETORES);

  it('BookPlay (Birigui) antes de PaguePlay (Marília); «sem cidade» não vira cartão', () => {
    expect(cidades.map(c => [c.nome, c.marca, c.rotuloMarca])).toEqual([
      ['Birigui', 'bp', 'BookPlay'], ['Marília', 'pp', 'PaguePlay'],
    ]);
  });

  it('o valor da cidade é o do mês (pela carteira), e a participação é sobre o geral', () => {
    expect(cidades[0].mes.valor).toBe(600);
    expect(cidades[0].participacao).toBeCloseTo(0.6);
  });

  it('os setores são os da grade, pela cidade do setor, do maior para o menor', () => {
    expect(cidades[0].setores.map(s => [s.nome, s.valor])).toEqual([['Play 1', 400], ['Play 3', 150]]);
    expect(cidades[0].melhorSetor?.nome).toBe('Play 1');
    expect(cidades[1].setores.map(s => s.nome)).toEqual(['Play 5']);
  });

  it('a carteira sem setor classificada conta na cidade dela, com a regra dela', () => {
    expect(cidades[1].carteirasSemSetor.map(k => k.cod)).toEqual(['72']);
    expect(cidades[1].cofenBruto).toBe(150);
    expect(cidades[0].cofenBruto).toBeNull();
  });

  it('o que não tem cidade fica no bloco de pendências', () => {
    const s = semCidade(MES);
    expect(s.valor).toBe(100);
    expect(s.carteiras.map(k => k.cod)).toEqual(['37']);
  });
});

describe('o dia', () => {
  const u = (o: Partial<UnidadeDoDia>): UnidadeDoDia => ({
    tipo: 'setor', setorId: null, cod: null, nome: 'x', cidadeId: null, regra: 'nosso_produto',
    valor: 1, linhas: 1, operadores: 1, media: 1, destaque: null, ...o,
  });

  it('Cofen sai da tabela de Nosso produto, venha de setor ou de carteira', () => {
    const d = separarDia([
      u({ nome: 'Play 1', valor: 50 }), u({ nome: 'Play 3', valor: 80 }),
      u({ nome: 'MARILIA - COFEN', tipo: 'sem_setor', regra: 'cofen', valor: 90 }),
      u({ nome: 'COBRANÇA - GERAL', tipo: 'sem_setor', regra: null, valor: 10 }),
      u({ nome: 'RETENÇÃO', tipo: 'somente_geral', regra: null, valor: 5 }),
    ]);
    expect(d.nossoProduto.map(x => x.nome)).toEqual(['Play 3', 'Play 1']);
    expect(d.cofen.map(x => x.nome)).toEqual(['MARILIA - COFEN']);
    expect(d.semSetor.map(x => x.nome)).toEqual(['COBRANÇA - GERAL']);
    expect(d.soNoTotal.map(x => x.nome)).toEqual(['RETENÇÃO']);
  });

  it('a divisão Cofen: o H.O. fica, o resto é repasse 3:1, e soma o bruto', () => {
    const d = divisaoCofen(1000, 0.226);
    expect(d.ho).toBeCloseTo(226);
    expect(d.coren).toBeCloseTo(580.5);
    expect(d.cofen).toBeCloseTo(193.5);
    expect(d.ho + d.coren + d.cofen).toBeCloseTo(1000);
  });

  it('rótulos e calendário', () => {
    expect(rotuloDoDia('2026-10', 15)).toBe('Quinta-feira, 15 de outubro');
    expect(ehFimDeSemana('2026-10', 3)).toBe(true);
    expect(ehFimDeSemana('2026-10', 5)).toBe(false);
    expect(variacaoPct(110, 100)).toBeCloseTo(10);
    expect(variacaoPct(10, 0)).toBeNull();
  });
});
