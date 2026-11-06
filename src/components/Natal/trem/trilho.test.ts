import { describe, expect, it } from 'vitest';
import { RAMPA_S, distanciaNoTempo, distanciaNoTrecho, ladoDoCorpo, montarTrilho, pontoNoTrilho } from './trilho';

const SEG = 24;
const PE = { largura: 1200, yFim: 900, comprimentoTrem: 320 };
const IDA = { volta: false, partindo: false, chegando: false };

describe('montarTrilho', () => {
  it('com uma pista só (Dashboard, Acordos): uma reta no pé, de fora a fora da tela, para a direita', () => {
    const t = montarTrilho(PE, SEG);
    expect(t.linhas).toEqual([900]);
    expect(t.d).not.toMatch(/[AQCV]/);       // nenhuma curva nem descida no desenho
    const ini = pontoNoTrilho(t, 0), fim = pontoNoTrilho(t, t.comprimento);
    expect(ini.x).toBeLessThan(-PE.comprimentoTrem / 2);
    expect(fim.x).toBeGreaterThan(PE.largura + PE.comprimentoTrem / 2);
    expect(Math.cos(ini.angulo)).toBe(1);
  });

  it('no Dashboard sai da estação', () => {
    const t = montarTrilho({ ...PE, xEstacao: 360 }, SEG);
    expect(pontoNoTrilho(t, 0).x).toBeCloseTo(360);
  });

  it('no Analítico: ida no alto, volta no pé até o fim da linha, com o salto fora da tela', () => {
    const t = montarTrilho({ ...PE, yTopo: 100, xFimDaLinha: 220 }, SEG);
    expect(t.linhas).toEqual([100, 900]);
    const fim = pontoNoTrilho(t, t.comprimento);
    expect(fim).toMatchObject({ y: 900 });
    expect(fim.x).toBeCloseTo(220);
    expect(Math.cos(fim.angulo)).toBe(-1);
    const salto = t.amostras.findIndex((a, i) => i > 0 && a.y !== t.amostras[i - 1].y);
    expect(t.amostras[salto].s).toBe(t.amostras[salto - 1].s);
    expect(t.amostras[salto].x).toBeGreaterThan(PE.largura + PE.comprimentoTrem / 2);
  });

  it('cada pista leva o mesmo tempo em qualquer tela (todo mundo vê o trem entrar e sair junto)', () => {
    for (const largura of [1000, 1300, 1700]) {
      const t = montarTrilho({ ...PE, largura, yTopo: 100 }, SEG);
      expect(t.duracao).toBe(2 * SEG);
      expect(t.trechos.map(tr => [tr.t0, tr.t1])).toEqual([[0, SEG], [SEG, 2 * SEG]]);
    }
  });

  it('as atrações ficam na pista do pé, longe da estação e do aviso do sorteio', () => {
    const t = montarTrilho({ ...PE, largura: 1700, xEstacao: 360 }, SEG);
    expect(t.atracoes.map(a => a.tipo)).toEqual(['vilarejo', 'sinal', 'boneco', 'pinheiros']);
    // depois do trem parado E do aviso/bilhete do sorteio
    expect(t.atracoes.every(a => a.y === 900 && a.x > 360 + 160 + 470)).toBe(true);
  });

  it('a distância só cresce com o tempo', () => {
    const t = montarTrilho({ ...PE, yTopo: 100 }, SEG);
    let antes = -1;
    for (let seg = 0; seg <= t.duracao; seg += 0.25) { const s = distanciaNoTempo(t, seg); expect(s).toBeGreaterThanOrEqual(antes); antes = s; }
    expect(distanciaNoTempo(t, t.duracao)).toBeCloseTo(t.comprimento);
  });
});

describe('distanciaNoTrecho', () => {
  const t = montarTrilho({ ...PE, xEstacao: 360 }, SEG);

  it('acabando a pista, fica no fim (fora da tela)', () => {
    expect(distanciaNoTrecho(t, SEG + 30, IDA)).toBeCloseTo(t.comprimento);
  });

  it('na volta faz o caminho ao contrário', () => {
    const volta = { ...IDA, volta: true };
    expect(distanciaNoTrecho(t, 0, volta)).toBeCloseTo(t.comprimento);
    expect(distanciaNoTrecho(t, SEG + 30, volta)).toBeCloseTo(0);
  });

  it('saindo parado, acelera; chegando, freia; sem nunca voltar para trás', () => {
    const v = t.comprimento / SEG;
    expect(distanciaNoTrecho(t, RAMPA_S / 2, { ...IDA, partindo: true })).toBeLessThan((RAMPA_S / 2) * v * 0.5);
    expect(distanciaNoTrecho(t, SEG + RAMPA_S / 2, { ...IDA, chegando: true })).toBeCloseTo(t.comprimento);
    let antes = -1;
    for (let seg = 0; seg <= SEG + RAMPA_S + 1; seg += 0.1) {
      const s = distanciaNoTrecho(t, seg, { ...IDA, partindo: true, chegando: true });
      expect(s).toBeGreaterThanOrEqual(antes - 1e-6);
      antes = s;
    }
  });
});

describe('ladoDoCorpo', () => {
  it('para a direita, normal; para a esquerda, espelhado', () => {
    expect(ladoDoCorpo(0)).toBe(1);
    expect(ladoDoCorpo(Math.PI)).toBe(-1);
  });
});
