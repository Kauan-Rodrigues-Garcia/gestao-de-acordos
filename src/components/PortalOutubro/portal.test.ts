import { describe, expect, it } from 'vitest';
import { ABERTURA, DIAS, FIM, INICIO, emSaoPaulo, estadoDoPortal, partesEmSaoPaulo, relogioDaContagem } from './fases';
import { horaSimulada, rebasear, type Simulacao } from './relogio';
import { freio, montarFita, sortearComPeso } from './sorteio';
import { LENDAS, PESSOAL, TAMBEM_TEVE, TOP10 } from './dados';

const H = 3_600_000;

describe('as fases da semana (hora de São Paulo)', () => {
  it('a semana é de segunda 26 a sexta 30, e abre às 16h de sexta', () => {
    expect(partesEmSaoPaulo(INICIO)).toMatchObject({ dia: 26, semana: 1, h: 0 });
    expect(partesEmSaoPaulo(ABERTURA)).toMatchObject({ dia: 30, semana: 5, h: 16, m: 0 });
    expect(partesEmSaoPaulo(FIM)).toMatchObject({ mes: 11, dia: 1, h: 0 });
  });

  it('antes da semana e depois do sábado: nada', () => {
    expect(estadoDoPortal(INICIO - 1).fase).toBe('fora');
    expect(estadoDoPortal(FIM).fase).toBe('fora');
  });

  it('cada dia ganha o seu: luz na quarta, tremor e bilhete na quinta, contagem na sexta', () => {
    const seg = estadoDoPortal(DIAS[1] + 10 * H);
    expect(seg).toMatchObject({ fase: 'espreitando', dia: 1, luz: 0, tremor: false, bilhete: false, contagem: false });
    expect(estadoDoPortal(DIAS[2] + 10 * H)).toMatchObject({ dia: 2, luz: 0 });
    expect(estadoDoPortal(DIAS[3] + 10 * H).luz).toBeGreaterThan(0);
    expect(estadoDoPortal(DIAS[4] + 10 * H)).toMatchObject({ dia: 4, tremor: true, bilhete: true, contagem: false });
    expect(estadoDoPortal(DIAS[5] + 10 * H)).toMatchObject({ dia: 5, tremor: true, bilhete: false, contagem: true, faltaMs: 6 * H });
  });

  it('o último minuto, a abertura em ponto e o sábado com o mural', () => {
    expect(estadoDoPortal(ABERTURA - 60_001).fase).toBe('espreitando');
    expect(estadoDoPortal(ABERTURA - 60_000).fase).toBe('ultimoMinuto');
    expect(estadoDoPortal(ABERTURA - 1).fase).toBe('ultimoMinuto');
    expect(estadoDoPortal(ABERTURA)).toMatchObject({ fase: 'aberto', faltaMs: 0, tremor: false, contagem: false });
    expect(estadoDoPortal(emSaoPaulo(2026, 10, 31, 20))).toMatchObject({ fase: 'aberto', dia: 6 });
  });

  it('a luz cresce na sexta até cheia às 16h', () => {
    const manha = estadoDoPortal(DIAS[5] + 8 * H).luz;
    const tarde = estadoDoPortal(ABERTURA - 2 * 60_000).luz;
    expect(tarde).toBeGreaterThan(manha);
    expect(tarde).toBeLessThanOrEqual(1);
  });

  it('a contagem: horas quando tem, minutos e segundos na última hora', () => {
    expect(relogioDaContagem(3 * H + 12 * 60_000 + 45_000)).toBe('03:12:45');
    expect(relogioDaContagem(42_000)).toBe('00:42');
    expect(relogioDaContagem(500)).toBe('00:01');
  });
});

describe('os balões do bueiro', () => {
  it('sobem mais vezes a cada dia, e quase sem parar na última hora', () => {
    const a = (t: number) => estadoDoPortal(t).balaoACadaMs!;
    expect(a(DIAS[1] + 9 * H)).toBeGreaterThan(a(DIAS[3] + 9 * H));
    expect(a(DIAS[3] + 9 * H)).toBeGreaterThan(a(DIAS[5] + 9 * H));
    expect(a(ABERTURA - 30 * 60_000)).toBe(2 * 60_000);
    expect(a(ABERTURA - 30_000)).toBe(15_000);
  });

  it('fora da semana e com o mural aberto, nenhum balão nem barquinho', () => {
    expect(estadoDoPortal(DIAS[1] - 1).balaoACadaMs).toBeNull();
    expect(estadoDoPortal(ABERTURA).balaoACadaMs).toBeNull();
    expect(estadoDoPortal(ABERTURA).barcoACadaMs).toBeNull();
  });

  it('o barquinho cai mais vezes a cada dia', () => {
    const b = (t: number) => estadoDoPortal(t).barcoACadaMs!;
    expect(b(DIAS[1] + 9 * H)).toBeGreaterThan(b(DIAS[5] + 9 * H));
    expect(b(ABERTURA - 30 * 60_000)).toBe(3 * 60_000);
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
  it('174 pessoas, top 10, e as três Lendas com as cinco', () => {
    expect(PESSOAL).toHaveLength(174);
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

describe('abertura solta pelo botão (29/10)', () => {
  const H = 3_600_000;
  const solta = DIAS[4] + 10 * H; // quinta, 10h

  it('o último minuto e a abertura seguem a hora solta, não a de sexta', () => {
    expect(estadoDoPortal(solta - 60_001, solta).fase).toBe('espreitando');
    expect(estadoDoPortal(solta - 30_000, solta)).toMatchObject({ fase: 'ultimoMinuto', faltaMs: 30_000 });
    expect(estadoDoPortal(solta, solta)).toMatchObject({ fase: 'aberto', bilhete: false, balaoACadaMs: null });
  });

  it('depois de aberta, fica aberta até o fim de sábado', () => {
    expect(estadoDoPortal(DIAS[5] + 9 * H, solta)).toMatchObject({ fase: 'aberto', contagem: false });
    expect(estadoDoPortal(FIM, solta).fase).toBe('fora');
  });
});
