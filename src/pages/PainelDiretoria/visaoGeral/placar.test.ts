import { describe, expect, it } from 'vitest';
import { QUARTIS_PADRAO } from '@/lib/diasUteis';
import type { LinhaQuartil } from '@/pages/Dashboard/Analitico/linhasQuartil';
import {
  calendarioDoMes, diaDeHoje, metaDoConjunto, ordenarPlacar, resumirQuartis, ritmoDe, setoresDoPlacar, sinaisDoPlacar, tomDoRitmo,
  type SetorDoPlacar,
} from './placar';
import { montarVisao } from './modelo';
import type { CofenDoMes, MesPorCidade } from '@/services/mestre/diretoriaCidades.service';
import type { GradeDeSetores, SetorDoPainel } from '@/services/mestre/diretoriaSetores.service';

// Outubro/2026: 12/10 é feriado. Dias úteis: 21; até o dia 16, 11.
const OUT = calendarioDoMes('2026-10', 16, 31, ['2026-10-12'], true);

describe('o calendário do corte', () => {
  it('conta dias úteis sem fim de semana nem feriado, até o corte', () => {
    expect(OUT.totalUteis).toBe(21);
    expect(OUT.decorridos).toBe(11);
    expect(OUT.uteis.has(12)).toBe(false);
    expect(OUT.uteis.has(3)).toBe(false); // sábado
    expect(OUT.uteis.has(13)).toBe(true);
  });

  it('o quartil é do mês: o «hoje» é hoje no mês corrente e o último dia num mês fechado', () => {
    expect(diaDeHoje('2026-10', '2026-10-04', 31)).toBe(4);
    expect(diaDeHoje('2026-09', '2026-10-04', 30)).toBe(30);
    expect(diaDeHoje('2026-11', '2026-10-04', 30)).toBe(1);
  });

  it('mês fechado: decorridos = o mês inteiro', () => {
    const set = calendarioDoMes('2026-09', 30, 30, [], true);
    expect(set.decorridos).toBe(set.totalUteis);
  });
});

describe('o ritmo contra a meta do setor', () => {
  it('a mesma conta do Painel Líder: meta ÷ dias úteis × decorridos', () => {
    const r = ritmoDe(234_032, 420_000, OUT)!;
    expect(r.esperado).toBeCloseTo((420_000 / 21) * 11, 2);
    expect(r.diferenca).toBeCloseTo(234_032 - (420_000 / 21) * 11, 2);
    expect(r.pct).toBeCloseTo(234_032 / ((420_000 / 21) * 11) * 100, 6);
    expect(r.fecha).toBeCloseTo((234_032 / 11) * 21, 2);
    expect(r.falta).toBeCloseTo(420_000 - 234_032, 2);
    expect(r.porDiaUtil).toBeCloseTo((420_000 - 234_032) / 10, 2);
    expect(r.pctMeta).toBeCloseTo(234_032 / 420_000 * 100, 6);
  });

  it('sem meta, sem ritmo — não inventa meta pela soma de ninguém', () => {
    expect(ritmoDe(1000, null, OUT)).toBeNull();
    expect(ritmoDe(1000, 0, OUT)).toBeNull();
  });

  it('meta batida: falta zero', () => {
    const r = ritmoDe(500, 400, OUT)!;
    expect(r.falta).toBe(0);
    expect(r.porDiaUtil).toBe(0);
  });

  it('as faixas de cor são as do quartil padrão', () => {
    expect([tomDoRitmo(120), tomDoRitmo(85), tomDoRitmo(60), tomDoRitmo(20)]).toEqual(['q1', 'q2', 'q3', 'q4']);
  });
});

const linha = (projecao: number | null, q: number | null, recebido = 1000): LinhaQuartil => ({
  op: { id: `p${Math.random()}`, nome: 'x', foto_url: null, setor_id: 's', equipe_id: null },
  equipeNome: '', meta: 1000, recebido, diaria: null, hoje: null, diferenca: null, projecao,
  quartil: q ? QUARTIS_PADRAO.find(x => x.quartil === q)! : null, pagamentos: 0, ajusteManual: 0,
  dupla: { ativa: false } as LinhaQuartil['dupla'], qtdIndireta: 0, dias: { totalUteis: 21, decorridos: 11 },
});

describe('os quartis: quanto cada um representa e a média de cada um', () => {
  it('% das pessoas e a projeção média de cada quartil', () => {
    const r = resumirQuartis([linha(120, 1, 3000), linha(110, 1, 2000), linha(90, 2), linha(40, 4)], QUARTIS_PADRAO);
    expect(r.total).toBe(4);
    expect(r.fatias.map(f => [f.quartil, f.qtd, f.pct])).toEqual([[1, 2, 50], [2, 1, 25], [3, 0, 0], [4, 1, 25]]);
    expect(r.fatias[0].mediaProjecao).toBe(115);
    expect(r.fatias[0].recebidoMedio).toBe(2500);
    expect(r.fatias[2].mediaProjecao).toBeNull();
  });

  it('quem não tem quartil (sem meta) não entra na base', () => {
    expect(resumirQuartis([linha(null, null), linha(90, 2)], QUARTIS_PADRAO).total).toBe(1);
  });
});

// ── Os setores do placar, a partir da visão ────────────────────────────────

const BIR = 'c-bir', MAR = 'c-mar';
const escopo = (valor: number) => ({
  valor, linhas: 10, operadores: 3, colchao: 0, valorAnterior: valor * 0.9, mesAnteriorTotal: valor * 2, mesAnteriorDias: 20,
  serie: Array.from({ length: 31 }, (_, i) => ({ dia: i + 1, valor: i < 16 ? valor / 16 : 0, valorAnterior: 0, dentroDoCorte: i < 16 })),
  formas: [],
});
const MES: MesPorCidade = {
  mes: '2026-10', mesAnterior: '2026-09', diaCorte: 16, diasNoMes: 31, temLote: true, temLoteAnterior: true,
  geral: escopo(900), cidades: [{ ...escopo(600), cidadeId: BIR, nome: 'Birigui' }, { ...escopo(300), cidadeId: MAR, nome: 'Marília' }],
  carteiras: [], naoConta: { valor: 0, linhas: 0 },
};
const setor = (setorId: string, setorNome: string, valor: number): SetorDoPainel => ({
  setorId, setorNome, fotoUrl: null, valor, linhas: 1, operadores: 1, carteiras: 1,
  integralRecebido: 0, movidoParaCa: 0, valorAnterior: valor / 2, temAnterior: true, temGrupo: true,
});
const GRADE = { setores: [setor('s1', 'Play 1', 400), setor('s5', 'Play 5', 120)] } as unknown as GradeDeSetores;
const INFO = [
  { id: 's1', nome: 'Play 1', cidadeId: BIR, regra: 'nosso_produto' as const },
  { id: 's5', nome: 'Play 5', cidadeId: MAR, regra: 'nosso_produto' as const },
  { id: 's9', nome: 'Play 9', cidadeId: BIR, regra: 'nosso_produto' as const },
  { id: 's0', nome: 'Sem meta', cidadeId: BIR, regra: 'nosso_produto' as const },
];
const COFEN = {
  disponivel: true, aviso: null, setorId: 'cp', nome: 'Conecta Play', cidadeId: 'pp-mar', cidadeNome: 'Marília', conta: true,
  diaCorte: 16, diasNoMes: 31, meta: 354_000,
  mes: { bruto: 1000, ho: 226, coren: 580, cofen: 194, quantidade: 4 },
  anterior: { brutoAteCorte: 900, hoAteCorte: 200, brutoMes: 0, hoMes: 0, dias: 0 },
  serie: [], formas: [], formasDia: [], operadores: { quantidade: 2, lista: [] },
} as CofenDoMes;

describe('os setores do placar', () => {
  const metas = { s1: 420_000, s5: 60_000, s9: 50_000 };
  const lista = setoresDoPlacar({ visao: montarVisao(MES, COFEN, GRADE, INFO, 'ho'), setores: INFO, metas, cofen: COFEN, modo: 'ho', cal: OUT });
  const por = (k: string) => lista.find(s => s.chave === k)!;

  it('os da grade, o que tem meta e não recebeu (zerado) e a carteira Cofen', () => {
    expect(lista.map(s => s.chave).sort()).toEqual(['cofen', 's1', 's5', 's9']);
    expect(por('s9').valor).toBe(0);
    expect(por('s9').ritmo?.pct).toBe(0);
  });

  it('a meta é a do setor; o Cofen em H.O. converte a meta pelo percentual', () => {
    expect(por('s1').ritmo?.meta).toBe(420_000);
    expect(por('cofen').valor).toBe(226);
    expect(por('cofen').ritmo?.meta).toBeGreaterThan(0);
    expect(por('cofen').ritmo?.meta).toBeLessThan(354_000);
  });

  it('a meta de um conjunto soma as dos setores e conta os sem meta', () => {
    const m = metaDoConjunto([...lista, { ...por('s1'), chave: 'x', ritmo: null }]);
    expect(m.semMeta).toBe(1);
    expect(m.meta).toBeCloseTo(420_000 + 60_000 + 50_000 + (por('cofen').ritmo?.meta ?? 0), 2);
  });

  it('pior ritmo primeiro; sem meta no fim', () => {
    const ord = ordenarPlacar([...lista, { ...por('s1'), chave: 'sem', ritmo: null }], 'ritmo');
    expect(ord[0].chave).toBe('s9');
    expect(ord[ord.length - 1].chave).toBe('sem');
  });
});

describe('o que pede atenção', () => {
  const s = (chave: string, pct: number, diferenca: number): SetorDoPlacar => ({
    chave, setorId: chave, nome: chave, cidadeId: BIR, cidadeNome: 'Birigui', marca: 'bp', cofen: false,
    valor: 0, valorAnterior: 0, temAnterior: false, operadores: 0,
    ritmo: { meta: 1, esperado: 1, diferenca, pct, pctMeta: 0, fecha: 100, falta: 0, porDiaUtil: 0 },
  });
  const fmt = (v: number) => `R$ ${Math.round(v)}`;

  it('pior ritmo, maior falta em reais, quem lidera e o quartil 4 — no máximo quatro', () => {
    const lista = [s('A', 40, -100), s('B', 75, -900), s('C', 130, 500)];
    const r = sinaisDoPlacar(lista, { qtd: 7, maisEm: lista[1] }, fmt);
    expect(r.map(x => [x.chave, x.tom])).toEqual([['A', 'ruim'], ['B', 'alerta'], ['C', 'bom'], ['B', 'q4']]);
    expect(r[3].aba).toBe('pessoas');
  });

  it('tudo no ritmo: só o que lidera', () => {
    const r = sinaisDoPlacar([s('A', 105, 10), s('B', 101, 2)], null, fmt);
    expect(r.map(x => x.tom)).toEqual(['bom']);
  });
});
