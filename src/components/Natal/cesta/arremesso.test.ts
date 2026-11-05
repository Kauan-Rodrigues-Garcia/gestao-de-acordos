import { describe, expect, it } from 'vitest';
import {
  bolaNaPose, mirar, poseDoArremesso, sortearErro, COLO,
  T_AGACHA, T_FIM, T_MIRA, T_PEGA, T_POUSA, T_SOLTA,
} from './arremesso';

const VOO = { gravidade: 1500, ar: 0.95 };

/** A mesma integração da bola solta (`BolaDaSaudacao.tsx`), quadro a quadro. */
function voar(de: { x: number; y: number }, v: { vx: number; vy: number }, alvoY: number) {
  let { x, y } = de, { vx, vy } = v;
  const dt = 1 / 60;
  for (let i = 0; i < 600; i++) {
    const xAntes = x, yAntes = y;
    vy += VOO.gravidade * dt;
    const ar = Math.pow(VOO.ar, dt);
    vx *= ar; vy *= ar;
    x += vx * dt; y += vy * dt;
    // Onde, entre os dois quadros, ela cruzou a linha do aro.
    if (vy > 0 && yAntes < alvoY && y >= alvoY) return { x: xAntes + (x - xAntes) * (alvoY - yAntes) / (y - yAntes) };
  }
  return null;
}

describe('a pose do arremesso do boneco', () => {
  it('não dá pulo de um trecho para o outro', () => {
    for (const lado of [1, -1] as const) {
      for (const t of [T_PEGA, T_MIRA, T_AGACHA, T_SOLTA, T_POUSA, T_FIM]) {
        const a = poseDoArremesso(t - 0.5, lado), b = poseDoArremesso(t + 0.5, lado);
        for (const k of ['y', 'sx', 'sy', 'inclina', 'bracoE', 'bracoD', 'estica'] as const) {
          expect(Math.abs(a[k] - b[k])).toBeLessThan(1.2);
        }
        // A bola só importa até ser solta.
        if (t <= T_SOLTA) {
          const pa = bolaNaPose(a), pb = bolaNaPose(b);
          expect(Math.hypot(pa.x - pb.x, pa.y - pb.y)).toBeLessThan(1.5);
        }
      }
    }
  });

  it('pega a bola no colo e solta lá em cima, puxando para o lado da cesta', () => {
    expect(bolaNaPose(poseDoArremesso(0, 1))).toEqual(COLO);
    const direita = bolaNaPose(poseDoArremesso(T_SOLTA - 1, 1));
    const esquerda = bolaNaPose(poseDoArremesso(T_SOLTA - 1, -1));
    expect(direita.y).toBeLessThan(COLO.y - 40);
    expect(direita.x).toBeGreaterThan(esquerda.x);
  });

  it('termina parado, do jeito de sempre', () => {
    const p = poseDoArremesso(T_FIM + 10, 1);
    expect(p).toMatchObject({ y: 0, sx: 1, sy: 1, inclina: 0, bracoE: 0, bracoD: 0, estica: 1, fase: 'pronto' });
  });
});

describe('a mira do boneco', () => {
  const casos = [
    { de: { x: 400, y: 140 }, alvo: { x: 1300, y: 405 } },
    { de: { x: 1200, y: 140 }, alvo: { x: 1300, y: 405 } },
    { de: { x: 1400, y: 140 }, alvo: { x: 1250, y: 405 } },
    { de: { x: 300, y: 500 }, alvo: { x: 1100, y: 300 } },
  ];
  it('sem erro, a bola cruza o aro no meio (com a física de verdade da bola)', () => {
    for (const { de, alvo } of casos) {
      const v = mirar(de, alvo, 120, 40, VOO, 1 / 60);
      const cruzou = voar(de, v, alvo.y);
      expect(cruzou).not.toBeNull();
      expect(Math.abs(cruzou!.x - alvo.x)).toBeLessThan(8);
      // Dentro do teto de velocidade da bola.
      expect(Math.abs(v.vx)).toBeLessThanOrEqual(1600);
      expect(Math.abs(v.vy)).toBeLessThanOrEqual(1600);
    }
  });

  it('não passa do teto da área', () => {
    const de = { x: 400, y: 90 }, alvo = { x: 1300, y: 405 };
    const v = mirar(de, alvo, 200, 60, VOO);
    // A altura máxima, sem o ar (que só baixa ela): v²/2g acima da partida.
    expect(de.y - (v.vy * v.vy) / (2 * VOO.gravidade)).toBeGreaterThanOrEqual(55);
  });

  it('o erro quase sempre é pequeno, às vezes grande', () => {
    let s = 7;
    const sorte = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    const erros = Array.from({ length: 2000 }, () => Math.abs(sortearErro(sorte)));
    const perto = erros.filter(e => e < 24).length / erros.length;
    expect(perto).toBeGreaterThan(0.4);
    expect(perto).toBeLessThan(0.7);
    expect(erros.some(e => e > 80)).toBe(true);
  });
});
