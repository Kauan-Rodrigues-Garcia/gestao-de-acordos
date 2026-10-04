import { describe, expect, it } from 'vitest';
import {
  cofenNoDia, comporEscopo, ehFimDeSemana, foraDaConta, montarVisao, rotuloDoDia, separarDia, variacaoPct,
} from './modelo';
import type { CofenDoMes, MesPorCidade, MesDoEscopo, UnidadeDoDia } from '@/services/mestre/diretoriaCidades.service';
import type { GradeDeSetores, SetorDoPainel } from '@/services/mestre/diretoriaSetores.service';

const BIRIGUI = 'c-bir', MARILIA = 'c-mar', MARILIA_PP = 'c-mar-pp';
const DIAS = 31;

const serie = (porDia: number) => Array.from({ length: DIAS }, (_, i) => ({
  dia: i + 1, valor: i < 16 ? porDia : 0, valorAnterior: i < 16 ? porDia / 2 : 0, dentroDoCorte: i < 16,
}));

const escopo = (valor: number): MesDoEscopo => ({
  valor, linhas: 10, operadores: 3, colchao: 0, valorAnterior: valor * 0.9,
  mesAnteriorTotal: valor * 2, mesAnteriorDias: 20, serie: serie(valor / 16),
  formas: [{ forma: 'PIX', valor, qtd: 10, valorAnterior: 0 }],
});

const carteira = (o: Partial<MesPorCidade['carteiras'][number]>): MesPorCidade['carteiras'][number] => ({
  cod: '1', nome: 'x', valor: 0, linhas: 1, operadores: 1, valorAnterior: 0, estado: 'novo', setorId: null,
  setorNome: null, cidadeId: null, regra: null, conta: false, motivo: 'sem_cidade', ...o,
});

const MES: MesPorCidade = {
  mes: '2026-10', mesAnterior: '2026-09', diaCorte: 16, diasNoMes: DIAS, temLote: true, temLoteAnterior: true,
  geral: escopo(900),
  cidades: [
    { ...escopo(300), cidadeId: MARILIA, nome: 'Marília' },
    { ...escopo(600), cidadeId: BIRIGUI, nome: 'Birigui' },
  ],
  carteiras: [
    carteira({ cod: '25', nome: 'COB PLAY 1', valor: 400, estado: 'vinculado', setorId: 's-p1', setorNome: 'Play 1', cidadeId: BIRIGUI, regra: 'nosso_produto', conta: true, motivo: null }),
    carteira({ cod: '37', nome: 'COBRANÇA - GERAL', valor: 80, cidadeId: MARILIA, regra: 'nosso_produto', conta: true, motivo: null }),
    carteira({ cod: '72', nome: 'MARILIA - COFEN', valor: 150, motivo: 'sem_cidade' }),
    carteira({ cod: '61', nome: 'COB PLAY - EM DIA', valor: 30, motivo: 'sem_cidade' }),
  ],
  naoConta: { valor: 180, linhas: 9 },
};

/** A Conecta Play: H.O. de 226 sobre bruto de 1.000, em 16 dias iguais. */
const COFEN: CofenDoMes = {
  disponivel: true, aviso: null, setorId: 's-conecta', nome: 'Conecta Play', cidadeId: MARILIA_PP, cidadeNome: 'Marilia',
  conta: true, diaCorte: 16, diasNoMes: DIAS,
  mes: { bruto: 1000, ho: 226, coren: 580, cofen: 194, quantidade: 40 },
  anterior: { brutoAteCorte: 800, hoAteCorte: 180, brutoMes: 1500, hoMes: 340, dias: 20 },
  serie: Array.from({ length: DIAS }, (_, i) => ({
    dia: i + 1, dentroDoCorte: i < 16, bruto: i < 16 ? 62.5 : 0, ho: i < 16 ? 14.125 : 0,
    coren: i < 16 ? 36.25 : 0, cofen: i < 16 ? 12.125 : 0, quantidade: i < 16 ? 2 : 0,
    brutoAnterior: 50, hoAnterior: 11, operadores: i < 16 ? 2 : 0,
    destaque: i < 16 ? { nome: 'Paula', bruto: 40, ho: 9 } : null,
  })),
  formas: [{ forma: 'Pix', bruto: 1000, ho: 226, qtd: 40 }],
  formasDia: [{ dia: 3, forma: 'Pix', bruto: 62.5, ho: 14.125, qtd: 2 }],
  operadores: { quantidade: 2, lista: [] },
};

const setor = (setorId: string, setorNome: string, valor: number): SetorDoPainel => ({
  setorId, setorNome, fotoUrl: null, valor, linhas: 1, operadores: 1, carteiras: 1,
  integralRecebido: 0, movidoParaCa: 0, valorAnterior: valor / 2, temAnterior: true, temGrupo: true,
});

const GRADE = {
  setores: [setor('s-p1', 'Play 1', 400), setor('s-p3', 'Play 3', 150), setor('s-p5', 'Play 5', 120), setor('s-cof', 'Cofen do 59', 70)],
} as unknown as GradeDeSetores;

const SETORES = [
  { id: 's-p1', nome: 'Play 1', cidadeId: BIRIGUI, regra: 'nosso_produto' as const },
  { id: 's-p3', nome: 'Play 3', cidadeId: BIRIGUI, regra: 'nosso_produto' as const },
  { id: 's-p5', nome: 'Play 5', cidadeId: MARILIA, regra: 'nosso_produto' as const },
  { id: 's-cof', nome: 'Cofen do 59', cidadeId: MARILIA, regra: 'cofen' as const },
];

describe('a visão por carteira', () => {
  const ho = montarVisao(MES, COFEN, GRADE, SETORES, 'ho');
  const bruto = montarVisao(MES, COFEN, GRADE, SETORES, 'bruto');

  it('o geral é Nosso produto + Cofen, e a barra diz de qual carteira vem', () => {
    expect(ho.geral.valor).toBe(900 + 226);
    expect(ho.carteiras).toEqual([
      { chave: 'nosso_produto', nome: 'Nosso produto', valor: 900 },
      { chave: 'cofen', nome: 'Cofen', valor: 226 },
    ]);
    expect(bruto.geral.valor).toBe(1900);
  });

  it('o disjuntor troca TODO número com Cofen dentro: anterior, série, formas, pagamentos', () => {
    expect(ho.geral.valorAnterior).toBeCloseTo(900 * 0.9 + 180);
    expect(bruto.geral.valorAnterior).toBeCloseTo(900 * 0.9 + 800);
    expect(ho.geral.serie[2].valor).toBeCloseTo(900 / 16 + 14.125);
    expect(bruto.geral.serie[2].valor).toBeCloseTo(900 / 16 + 62.5);
    expect(ho.geral.serie.reduce((a, d) => a + d.valor, 0)).toBeCloseTo(ho.geral.valor);
    expect(ho.geral.formas.reduce((a, f) => a + f.valor, 0)).toBeCloseTo(ho.geral.valor);
    expect(ho.geral.linhas).toBe(10 + 40);
    expect(ho.geral.operadores).toBe(3 + 2);
    expect(ho.geral.mesAnteriorTotal).toBeCloseTo(1800 + 340);
  });

  it('a Cofen entra na cidade dela pelo nome (outra empresa, outro cadastro), separada do Nosso produto', () => {
    const [bir, mar] = ho.cidades;
    expect([bir.nome, mar.nome]).toEqual(['Birigui', 'Marília']);
    expect(bir.cofen).toBeNull();
    expect(bir.mes.valor).toBe(600);
    expect(mar.cofen?.valor).toBe(226);
    expect(mar.mes.nossoProduto).toBe(300);
    expect(mar.mes.valor).toBe(526);
    expect(mar.participacao).toBeCloseTo(526 / 1126);
    expect(ho.cidades.reduce((a, c) => a + c.mes.valor, 0)).toBeCloseTo(ho.geral.valor);
  });

  it('os setores são os da grade, pela cidade do setor; setor Cofen do 59 não entra', () => {
    expect(ho.cidades[0].setores.map(s => [s.nome, s.valor])).toEqual([['Play 1', 400], ['Play 3', 150]]);
    expect(ho.cidades[1].setores.map(s => s.nome)).toEqual(['Play 5']);
    expect(ho.cidades[1].carteirasSemSetor.map(k => k.cod)).toEqual(['37']);
  });

  it('Cofen sem cidade não conta: some do geral e das cidades', () => {
    const v = montarVisao(MES, { ...COFEN, conta: false }, GRADE, SETORES, 'ho');
    expect(v.geral.valor).toBe(900);
    expect(v.carteiras.map(c => c.chave)).toEqual(['nosso_produto']);
    expect(v.cidades.every(c => c.cofen === null)).toBe(true);
  });

  it('cidade do Cofen sem cartão no 59 ganha cartão próprio', () => {
    const v = montarVisao(MES, { ...COFEN, cidadeNome: 'Assis', cidadeId: 'c-assis' }, GRADE, SETORES, 'ho');
    const assis = v.cidades.find(c => c.nome === 'Assis');
    expect(assis?.mes.valor).toBe(226);
    expect(assis?.mes.nossoProduto).toBe(0);
  });

  it('o que está fora da conta', () => {
    const f = foraDaConta(MES);
    expect(f.valor).toBe(180);
    expect(f.carteiras.map(k => k.cod)).toEqual(['72', '61']);
  });

  it('sem Cofen, o escopo é o 59 como veio', () => {
    const e = comporEscopo(MES.geral, null, 'ho');
    expect(e.valor).toBe(900);
    expect(e.cofen).toBeNull();
  });
});

describe('o dia', () => {
  const u = (o: Partial<UnidadeDoDia>): UnidadeDoDia => ({
    tipo: 'setor', setorId: null, cod: null, nome: 'x', cidadeId: null, regra: 'nosso_produto',
    valor: 1, linhas: 1, operadores: 1, media: 1, destaque: null, ...o,
  });

  it('a tabela é de Nosso produto; Cofen do 59, se aparecer, não entra', () => {
    const d = separarDia([
      u({ nome: 'Play 1', valor: 50 }), u({ nome: 'Play 3', valor: 80 }),
      u({ nome: 'MARILIA - COFEN', tipo: 'sem_setor', regra: 'cofen', valor: 90 }),
      u({ nome: 'COBRANÇA - GERAL', tipo: 'sem_setor', regra: null, valor: 10 }),
      u({ nome: 'RETENÇÃO', tipo: 'somente_geral', regra: null, valor: 5 }),
    ]);
    expect(d.nossoProduto.map(x => x.nome)).toEqual(['Play 3', 'Play 1']);
    expect(d.semSetor.map(x => x.nome)).toEqual(['COBRANÇA - GERAL']);
    expect(d.soNoTotal.map(x => x.nome)).toEqual(['RETENÇÃO']);
  });

  it('a Cofen do dia vem da conciliação, no modo', () => {
    const h = cofenNoDia(COFEN, 3, 'ho');
    const b = cofenNoDia(COFEN, 3, 'bruto');
    expect(h?.valor).toBeCloseTo(14.125);
    expect(b?.valor).toBeCloseTo(62.5);
    expect(h?.ho + (h?.coren ?? 0) + (h?.cofen ?? 0)).toBeCloseTo(62.5);
    expect(h?.destaque).toEqual({ nome: 'Paula', valor: 9 });
    expect(h?.media).toBeCloseTo(14.125);
    expect(h?.mediaAnterior).toBeCloseTo(340 / 20);
    expect(h?.formas.map(f => f.valor)).toEqual([14.125]);
    expect(cofenNoDia({ ...COFEN, conta: false }, 3, 'ho')).toBeNull();
  });

  it('rótulos e calendário', () => {
    expect(rotuloDoDia('2026-10', 15)).toBe('Quinta-feira, 15 de outubro');
    expect(ehFimDeSemana('2026-10', 3)).toBe(true);
    expect(ehFimDeSemana('2026-10', 5)).toBe(false);
    expect(variacaoPct(110, 100)).toBeCloseTo(10);
    expect(variacaoPct(10, 0)).toBeNull();
  });
});
