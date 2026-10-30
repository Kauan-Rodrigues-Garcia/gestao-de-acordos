import { describe, expect, it } from 'vitest';
import {
  ABERTURA, AGUA_MS, BARCO_ANTES_DA_ABERTURA_MS, CONTAGEM_FINAL_MS, DIAS, FIM, INICIO, JANELA_MS, MAO_SAI_MS, REVELACAO_MS,
  emSaoPaulo, estadoDoPortal, partesEmSaoPaulo, relogioDaContagem,
} from './fases';
import { horaSimulada, rebasear, type Simulacao } from './relogio';
import { freio, montarFita, sortearComPeso } from './sorteio';
import { LENDAS, PESSOAL, TAMBEM_TEVE, TOP10 } from './dados';

const H = 3_600_000;

describe('a revelação em 5 minutos (hora de São Paulo)', () => {
  it('a semana é de segunda 26 a sexta 30, e abre às 16h de sexta', () => {
    expect(partesEmSaoPaulo(INICIO)).toMatchObject({ dia: 26, semana: 1, h: 0 });
    expect(partesEmSaoPaulo(ABERTURA)).toMatchObject({ dia: 30, semana: 5, h: 16, m: 0 });
    expect(partesEmSaoPaulo(FIM)).toMatchObject({ mes: 11, dia: 1, h: 0 });
  });

  it('sem o botão, nada na semana: o bueiro só aparece 5 minutos antes', () => {
    expect(estadoDoPortal(DIAS[4] + 10 * H)).toMatchObject({ fase: 'fora', balaoACadaMs: null });
    expect(estadoDoPortal(ABERTURA - JANELA_MS - 1).fase).toBe('fora');
    expect(estadoDoPortal(ABERTURA - JANELA_MS)).toMatchObject({ fase: 'espreitando', faltaMs: JANELA_MS, tremor: false });
    expect(estadoDoPortal(FIM).fase).toBe('fora');
  });

  it('a água começa faltando 2 min 45 s, e a mão está toda fora exatamente nos 2 minutos', () => {
    expect(BARCO_ANTES_DA_ABERTURA_MS).toBe(CONTAGEM_FINAL_MS + AGUA_MS);
    const agua = ABERTURA - BARCO_ANTES_DA_ABERTURA_MS;
    expect(estadoDoPortal(agua - 1)).toMatchObject({ fase: 'espreitando', noFinalMs: null });
    expect(estadoDoPortal(agua)).toMatchObject({ fase: 'final', noFinalMs: 0, tremor: true });
    expect(estadoDoPortal(ABERTURA - CONTAGEM_FINAL_MS)).toMatchObject({ fase: 'final', noFinalMs: AGUA_MS, faltaMs: CONTAGEM_FINAL_MS });
    expect(MAO_SAI_MS).toBeLessThan(AGUA_MS);
  });

  it('zerou: a revelação de quem participou, e o mural para todos só quando ela acaba', () => {
    expect(estadoDoPortal(ABERTURA)).toMatchObject({ fase: 'revelando', faltaMs: 0, balaoACadaMs: null });
    expect(estadoDoPortal(ABERTURA + REVELACAO_MS - 1).fase).toBe('revelando');
    expect(estadoDoPortal(ABERTURA + REVELACAO_MS).fase).toBe('aberto');
    expect(estadoDoPortal(emSaoPaulo(2026, 10, 31, 20))).toMatchObject({ fase: 'aberto', dia: 6 });
  });

  it('a brasa acende ao longo dos 5 minutos', () => {
    const comeco = estadoDoPortal(ABERTURA - JANELA_MS).luz;
    const fim = estadoDoPortal(ABERTURA - 1000).luz;
    expect(fim).toBeGreaterThan(comeco);
    expect(fim).toBeLessThanOrEqual(1);
  });

  it('a contagem: horas quando tem, minutos e segundos na última hora', () => {
    expect(relogioDaContagem(3 * H + 12 * 60_000 + 45_000)).toBe('03:12:45');
    expect(relogioDaContagem(42_000)).toBe('00:42');
    expect(relogioDaContagem(500)).toBe('00:01');
  });
});

describe('os balões do bueiro', () => {
  it('sobem durante a revelação, mais no final; sem o bueiro, nenhum', () => {
    const a = (t: number) => estadoDoPortal(t).balaoACadaMs!;
    expect(a(ABERTURA - 4 * 60_000)).toBeGreaterThan(a(ABERTURA - 30_000));
    expect(estadoDoPortal(DIAS[1] - 1).balaoACadaMs).toBeNull();
    expect(estadoDoPortal(ABERTURA)).toMatchObject({ balaoACadaMs: null, noFinalMs: null });
  });
});

describe('o relógio de teste', () => {
  const s: Simulacao = { baseReal: 1_000, baseEvento: DIAS[1], velocidade: 60, pausado: false };

  it('anda na velocidade pedida, e parado não anda', () => {
    expect(horaSimulada(s, 2_000)).toBe(DIAS[1] + 60_000);
    expect(horaSimulada({ ...s, pausado: true }, 99_000)).toBe(DIAS[1]);
  });

  it('trocar a velocidade não pula a hora', () => {
    const novo = rebasear(s, 2_000, { velocidade: 3600 });
    expect(horaSimulada(novo, 2_000)).toBe(DIAS[1] + 60_000);
    expect(horaSimulada(novo, 3_000)).toBe(DIAS[1] + 60_000 + 3_600_000);
  });
});

describe('o sorteio', () => {
  it('com peso: quem tem mais bilhete cai mais', () => {
    const itens = [{ p: 1 }, { p: 3 }];
    expect(sortearComPeso(itens, i => i.p, () => 0.2)).toBe(0);
    expect(sortearComPeso(itens, i => i.p, () => 0.3)).toBe(1);
    expect(sortearComPeso([], () => 1)).toBe(-1);
  });

  it('a fita para no ganhador', () => {
    const itens = ['a', 'b', 'c'];
    const { fita, parada } = montarFita(itens, 1, 5, () => 0.5);
    expect(fita[parada]).toBe('b');
    expect(parada).toBe(15);
  });

  it('o freio: começa no 0, termina no 1, e anda mais no começo', () => {
    expect(freio(0)).toBe(0);
    expect(freio(1)).toBe(1);
    expect(freio(0.5)).toBeGreaterThan(0.5);
  });
});

describe('o retrato do mês', () => {
  it('173 pessoas, top 10, e as três Lendas com as cinco', () => {
    expect(PESSOAL).toHaveLength(173);
    expect(TOP10).toHaveLength(10);
    expect(LENDAS.map(l => l.nome)).toEqual(['Erika Eduarda', 'Ayslan Silva', 'Nicole Pacheco']);
    expect(PESSOAL.map(p => p.posicao)).toEqual(PESSOAL.map((_, i) => i + 1));
  });

  it('em ordem de pontos', () => {
    for (let i = 1; i < PESSOAL.length; i++) expect(PESSOAL[i].pontos).toBeLessThanOrEqual(PESSOAL[i - 1].pontos);
  });

  it('quem não tem setor, e o chat do que também teve', () => {
    expect(PESSOAL.find(p => !p.setor)?.nome).toBe('Cleber Junior');
    expect(TAMBEM_TEVE.length).toBeGreaterThan(0);
    for (const m of TAMBEM_TEVE) expect(m.texto.length).toBeLessThan(110);
  });
});

describe('a revelação começada pelo botão (29/10)', () => {
  const H = 3_600_000;
  const clique = DIAS[4] + 10 * H; // quinta, 10h
  const solta = clique + JANELA_MS;

  it('o bueiro aparece no clique, e o resto segue a hora solta, não a de sexta', () => {
    expect(estadoDoPortal(clique - 1, solta).fase).toBe('fora');
    expect(estadoDoPortal(clique, solta)).toMatchObject({ fase: 'espreitando', faltaMs: JANELA_MS });
    expect(estadoDoPortal(solta - 30_000, solta)).toMatchObject({ fase: 'final', faltaMs: 30_000 });
    expect(estadoDoPortal(solta, solta)).toMatchObject({ fase: 'revelando', balaoACadaMs: null });
  });

  it('depois de aberta, fica aberta até o fim de sábado', () => {
    expect(estadoDoPortal(DIAS[5] + 9 * H, solta).fase).toBe('aberto');
    expect(estadoDoPortal(FIM, solta).fase).toBe('fora');
  });
});

describe('liberado, sem a revelação começada (30/10)', () => {
  it('o bueiro fica esperando, sem relógio, e sexta 16h não começa sozinha', () => {
    for (const t of [DIAS[5] + 14 * 3_600_000, ABERTURA, ABERTURA + REVELACAO_MS]) {
      expect(estadoDoPortal(t, null)).toMatchObject({ fase: 'aguardando', tremor: false, noFinalMs: null, faltaMs: Infinity });
    }
    expect(estadoDoPortal(ABERTURA, null).balaoACadaMs).toBe(estadoDoPortal(ABERTURA - JANELA_MS).balaoACadaMs);
    expect(estadoDoPortal(FIM, null)).toMatchObject({ fase: 'fora', balaoACadaMs: null });
  });

  it('o botão emenda sem salto: a brasa esperando é a do começo dos 5 minutos', () => {
    expect(estadoDoPortal(ABERTURA, null).luz).toBeCloseTo(estadoDoPortal(ABERTURA - JANELA_MS).luz);
  });
});
