import { describe, expect, it } from 'vitest';
import {
  ajudarNaMira, baterNaPonta, distanciaDaCesta, emMetros, frearNaRede, largouDeLonge, passouPeloAro, posicaoDoAro, subiuPeloAro,
  velocidadeDoArremesso, ARO_DE_VERDADE_M, MEIA_ABERTURA, RAIO_DA_PONTA, type Aro, type Corpo,
} from './fisica';

const aro: Aro = { x: 500, y: 300, meia: MEIA_ABERTURA, ponta: RAIO_DA_PONTA };

describe('a distância da cesta', () => {
  it('a régua é o aro: a abertura dele vale 45 cm', () => {
    expect(distanciaDaCesta({ x: aro.x - 2 * MEIA_ABERTURA, y: aro.y }, aro)).toBeCloseTo(ARO_DE_VERDADE_M);
  });
  it('conta em linha reta, do ponto onde a bola saiu até o centro do aro', () => {
    // 3-4-5: 528 × 704 px = 880 px = 10 aberturas = 4,5 m.
    expect(distanciaDaCesta({ x: aro.x - 528, y: aro.y + 704 }, aro)).toBeCloseTo(4.5);
  });
  it('escreve com vírgula e uma casa', () => {
    expect(emMetros(4.5)).toBe('4,5 m');
    expect(emMetros(6.749)).toBe('6,7 m');
  });
});

describe('a cesta de Natal', () => {
  it('conta a bola que desce pelo meio do aro', () => {
    const c: Corpo = { x: 505, y: 302, vx: 0, vy: 400 };
    expect(passouPeloAro(296, c, aro)).toBe(true);
  });

  it('não conta a bola que passa por fora das pontas', () => {
    const c: Corpo = { x: 500 + MEIA_ABERTURA + 2, y: 302, vx: 0, vy: 400 };
    expect(passouPeloAro(296, c, aro)).toBe(false);
  });

  it('não conta a bola subindo pela rede, mas percebe que ela subiu', () => {
    const c: Corpo = { x: 500, y: 298, vx: 0, vy: -400 };
    expect(passouPeloAro(304, c, aro)).toBe(false);
    expect(subiuPeloAro(304, c, aro)).toBe(true);
  });

  it('largar a bola colada em cima do aro não vale; arremessar de longe ou de baixo vale', () => {
    expect(largouDeLonge(510, 250, aro)).toBe(false);
    expect(largouDeLonge(300, 250, aro)).toBe(true);
    expect(largouDeLonge(500, 400, aro)).toBe(true);
    expect(largouDeLonge(500, 120, aro)).toBe(true);
  });

  it('a ponta do aro rebate a bola e a tira de dentro', () => {
    const ponta = { x: aro.x - aro.meia, y: aro.y };
    // Caindo em cima da ponta esquerda, um tico para fora: volta para cima e para a esquerda.
    const c: Corpo = { x: ponta.x - 4, y: ponta.y - 16, vx: 0, vy: 600 };
    const forca = baterNaPonta(c, ponta.x, ponta.y, 16, aro.ponta);
    expect(forca).toBeGreaterThan(0);
    expect(c.vy).toBeLessThan(0);
    expect(c.vx).toBeLessThan(0);
    expect(Math.hypot(c.x - ponta.x, c.y - ponta.y)).toBeCloseTo(16 + aro.ponta, 5);
  });

  it('a bola longe da ponta passa reto', () => {
    const c: Corpo = { x: 500, y: 300, vx: 0, vy: 600 };
    expect(baterNaPonta(c, aro.x - aro.meia, aro.y, 16, aro.ponta)).toBe(0);
    expect(c).toEqual({ x: 500, y: 300, vx: 0, vy: 600 });
  });

  it('a ajuda de mira puxa para o meio só perto do aro e descendo', () => {
    const perto: Corpo = { x: aro.x - 30, y: aro.y - 40, vx: 0, vy: 300 };
    ajudarNaMira(perto, aro, 0.016);
    expect(perto.vx).toBeGreaterThan(0);
    const subindo: Corpo = { x: aro.x - 30, y: aro.y - 40, vx: 0, vy: -300 };
    ajudarNaMira(subindo, aro, 0.016);
    expect(subindo.vx).toBe(0);
    const longe: Corpo = { x: aro.x - 300, y: aro.y - 40, vx: 0, vy: 300 };
    ajudarNaMira(longe, aro, 0.016);
    expect(longe.vx).toBe(0);
  });

  it('a rede freia a bola que passou', () => {
    const c: Corpo = { x: aro.x + 10, y: aro.y + 20, vx: 400, vy: 900 };
    frearNaRede(c, aro, 0.016);
    expect(c.vx).toBeLessThan(400);
    expect(c.vy).toBe(520);
  });

  it('o arremesso sai com a velocidade do fim do gesto do mouse', () => {
    // 10 px para a direita e 20 para cima a cada 16 ms: 625 e -1250 px/s.
    const amostras = Array.from({ length: 10 }, (_, i) => ({ x: 100 + i * 10, y: 500 - i * 20, t: 1000 + i * 16 }));
    const v = velocidadeDoArremesso(amostras, 1000 + 9 * 16, 5000);
    expect(v.vx).toBeCloseTo(625, 0);
    expect(v.vy).toBeCloseTo(-1250, 0);
  });

  it('o teto do arremesso encolhe o tamanho, não a direção', () => {
    const amostras = [{ x: 0, y: 0, t: 0 }, { x: 300, y: -400, t: 50 }];
    const v = velocidadeDoArremesso(amostras, 50, 1000);
    expect(Math.hypot(v.vx, v.vy)).toBeCloseTo(1000, 5);
    expect(v.vy / v.vx).toBeCloseTo(-4 / 3, 5);
  });

  it('eventos do mouse espaçados (PC lento) ainda dão arremesso', () => {
    // Um evento a cada 90 ms: maior que a janela, e mesmo assim a bola tem que sair.
    const amostras = [{ x: 0, y: 0, t: 0 }, { x: 45, y: -90, t: 90 }, { x: 90, y: -180, t: 180 }];
    const v = velocidadeDoArremesso(amostras, 200, 5000);
    expect(v.vx).toBeCloseTo(500, 0);
    expect(v.vy).toBeCloseTo(-1000, 0);
  });

  it('mouse parado antes de soltar: a bola só cai', () => {
    const amostras = [{ x: 0, y: 0, t: 0 }, { x: 300, y: -400, t: 50 }];
    expect(velocidadeDoArremesso(amostras, 400, 1000)).toEqual({ vx: 0, vy: 0 });
  });

  it('a cesta fica dentro da área, com espaço para a tabela em cima', () => {
    const p = { esq: 240, dir: 1440, cima: 64, baixo: 900 };
    const a = posicaoDoAro(p);
    expect(a.x + 80).toBeLessThanOrEqual(p.dir);
    expect(a.y - 130).toBeGreaterThanOrEqual(p.cima);
    expect(a.y + 90).toBeLessThanOrEqual(p.baixo);
  });
});
