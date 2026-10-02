import { describe, expect, it } from 'vitest';
import {
  FISICA, anguloNoFio, comprimentoAoSoltar, estourou, normalizarAngulo, passoLivre, passoNoFio,
  saiuDaTela, velocidadeDaMao, type CorpoLivre,
} from './aranhaFisica';

const ANCORA = { x: 500, y: 40 };

describe('aranha no fio', () => {
  it('solta de lado, balança e para pendurada embaixo da âncora', () => {
    const c = { x: ANCORA.x + 150, y: ANCORA.y + 40, vx: 0, vy: 0 };
    let cruzou = 0, ladoAntes = Math.sign(c.x - ANCORA.x);
    for (let i = 0; i < 60 * 30; i++) {
      passoNoFio(c, ANCORA, 100, 0.5);
      const lado = Math.sign(c.x - ANCORA.x);
      if (lado && lado !== ladoAntes) { cruzou++; ladoAntes = lado; }
    }
    expect(cruzou).toBeGreaterThan(3); // balançou de um lado para o outro
    // Saiu de 150 px de lado; em 15 s sobra um resto de balanço de poucos px.
    expect(Math.abs(c.x - ANCORA.x)).toBeLessThan(5);
    // Parada: o peso estica o fio só um pouco além do comprimento.
    const esticado = c.y - ANCORA.y - 100;
    expect(esticado).toBeGreaterThan(0);
    expect(esticado).toBeLessThan(6);
  });

  it('fio frouxo não empurra: perto da âncora, ela só cai', () => {
    const c = { x: ANCORA.x, y: ANCORA.y + 10, vx: 0, vy: 0 };
    passoNoFio(c, ANCORA, 100, 1);
    expect(c.vy).toBeGreaterThan(0);
  });

  it('solto esticado, o fio cede: quica um pouco e balança, sem estilingue', () => {
    const c = { x: ANCORA.x - 150, y: ANCORA.y + 200, vx: 0, vy: 0 }; // 250 px, fio de 100
    const L = comprimentoAoSoltar(c, ANCORA, 100);
    expect(L).toBeCloseTo(250 - FISICA.folga);
    let maisAlto = c.y;
    for (let i = 0; i < 240; i++) { passoNoFio(c, ANCORA, L, 0.5); maisAlto = Math.min(maisAlto, c.y); }
    expect(maisAlto).toBeGreaterThan(ANCORA.y); // não passa por cima da âncora
  });

  it('solto frouxo, o fio não muda', () => {
    expect(comprimentoAoSoltar({ x: ANCORA.x, y: ANCORA.y + 60 }, ANCORA, 100)).toBe(100);
  });

  it('estoura só depois do limite', () => {
    const perto = { x: ANCORA.x, y: ANCORA.y + 100 + FISICA.limite - 1 };
    const longe = { x: ANCORA.x, y: ANCORA.y + 100 + FISICA.limite + 1 };
    expect(estourou(perto, ANCORA, 100)).toBe(false);
    expect(estourou(longe, ANCORA, 100)).toBe(true);
  });

  it('a cabeça aponta para a âncora', () => {
    expect(anguloNoFio({ x: ANCORA.x, y: ANCORA.y + 100 }, ANCORA)).toBeCloseTo(0);
    // À direita da âncora, inclina no sentido anti-horário (negativo no CSS).
    expect(anguloNoFio({ x: ANCORA.x + 100, y: ANCORA.y + 100 }, ANCORA)).toBeCloseTo(-45);
    expect(anguloNoFio({ x: ANCORA.x - 100, y: ANCORA.y + 100 }, ANCORA)).toBeCloseTo(45);
  });
});

describe('aranha solta', () => {
  const corpo = (o: Partial<CorpoLivre> = {}): CorpoLivre => ({ x: 300, y: 300, vx: 0, vy: 0, rot: 0, vr: 0, ...o });

  it('jogada para cima, sobe, para e volta a cair', () => {
    const c = corpo({ vy: -20 });
    let maisAlto = c.y;
    for (let i = 0; i < 120; i++) { passoLivre(c, 1000, 1); maisAlto = Math.min(maisAlto, c.y); }
    expect(maisAlto).toBeLessThan(300 - 200);
    expect(c.vy).toBeGreaterThan(0);
  });

  it('bate na lateral e volta, mais devagar', () => {
    const c = corpo({ x: 990, vx: 20, vr: 10 });
    passoLivre(c, 1000, 1);
    expect(c.x).toBeLessThanOrEqual(1000 - FISICA.raio);
    expect(c.vx).toBeLessThan(0);
    expect(Math.abs(c.vx)).toBeLessThan(20);
    expect(c.vr).toBeLessThan(0);
  });

  it('gira enquanto cai', () => {
    const c = corpo({ vr: 8 });
    passoLivre(c, 1000, 1);
    expect(c.rot).toBeGreaterThan(7);
  });

  it('perdeu só quando passou da borda de baixo', () => {
    expect(saiuDaTela({ x: 0, y: 820 }, 800)).toBe(false);
    expect(saiuDaTela({ x: 0, y: 841 }, 800)).toBe(true);
  });
});

describe('a mão', () => {
  it('mede a velocidade dos últimos ~60 ms em px por quadro', () => {
    const quadro = 1000 / 60;
    const amostras = [0, 1, 2, 3, 4, 5].map(i => ({ x: i * 10, y: -i * 5, t: i * quadro }));
    const v = velocidadeDaMao(amostras, 5 * quadro);
    expect(v.vx).toBeCloseTo(10);
    expect(v.vy).toBeCloseTo(-5);
  });

  it('mão parada antes de largar = largou parada', () => {
    const amostras = [{ x: 0, y: 0, t: 0 }, { x: 50, y: 0, t: 16 }];
    expect(velocidadeDaMao(amostras, 400)).toEqual({ vx: 0, vy: 0 });
  });

  it('arremesso tem teto', () => {
    const amostras = [{ x: 0, y: 0, t: 0 }, { x: 2000, y: 0, t: 70 }];
    const v = velocidadeDaMao(amostras, 70);
    expect(Math.hypot(v.vx, v.vy)).toBeCloseTo(FISICA.velocidadeMaxima);
  });

  it('ângulo volta para (-180, 180]', () => {
    expect(normalizarAngulo(720 + 30)).toBe(30);
    expect(normalizarAngulo(-200)).toBe(160);
    expect(normalizarAngulo(180)).toBe(180);
  });
});
