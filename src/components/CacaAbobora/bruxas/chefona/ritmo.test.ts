import { describe, expect, it } from 'vitest';
import { DIFICULDADES_CHEFONA } from './banco';
import { RITMO, alvoDaVida, curaDoRitmo, faixaDoRitmo, ritmoDaLuta } from './ritmo';

/**
 * Uma luta simulada: `pessoas` tirando `dps` cada (antes do ritmo), em passos
 * de 1 s (o lote), com as mesmas regras do banco. Devolve em quantos segundos
 * ela cai (ou Infinity, se fugir).
 */
function lutar(pessoas: number, dps: number, d = DIFICULDADES_CHEFONA[1]): { cai: number; curas: number } {
  const max = d.base + d.porPessoa * pessoas;
  let vida = max;
  let ultimaCura = -Infinity;
  let curas = 0;
  for (let t = 1; t <= 120; t += 1) {
    const mult = ritmoDaLuta(t, vida / max);
    let dano = pessoas * dps * mult;
    if (t >= RITMO.maxS) dano = vida;
    if (t < RITMO.minS) dano = Math.min(dano, vida - max * RITMO.piso);
    vida -= Math.max(0, dano);
    if (vida <= 0) return { cai: t, curas };
    const cura = curaDoRitmo(t, vida / max, t - ultimaCura);
    if (cura > 0) { vida = Math.min(max, vida + cura * max); ultimaCura = t; curas += 1; }
  }
  return { cai: Infinity, curas };
}

describe('o diretor de ritmo da chefona', () => {
  it('de 1 a 100 pessoas, jogando devagar ou rápido, ela cai entre 60 e 115 s', () => {
    for (const d of DIFICULDADES_CHEFONA) {
      for (const pessoas of [1, 2, 5, 10, 20, 50, 100]) {
        for (const dps of [1.5, 3, 5, 8, 12]) {
          const { cai } = lutar(pessoas, dps, d);
          expect(cai, `${d.nome}, ${pessoas} pessoas a ${dps}/s`).toBeGreaterThanOrEqual(RITMO.minS);
          expect(cai, `${d.nome}, ${pessoas} pessoas a ${dps}/s`).toBeLessThanOrEqual(RITMO.maxS);
        }
      }
    }
  });

  it('no jogo de verdade (3 a 8 de dano por segundo, 5 a 100 pessoas) ela cai perto dos 90 s', () => {
    for (const d of DIFICULDADES_CHEFONA) {
      for (const pessoas of [5, 10, 40, 100]) {
        for (const dps of [3, 5, 8]) {
          const { cai } = lutar(pessoas, dps, d);
          expect(cai, `${d.nome}, ${pessoas} pessoas a ${dps}/s`).toBeGreaterThanOrEqual(75);
          expect(cai, `${d.nome}, ${pessoas} pessoas a ${dps}/s`).toBeLessThanOrEqual(105);
        }
      }
    }
    // Sozinho, no Médio, jogando normal: também perto dos 90.
    expect(lutar(1, 5).cai).toBeLessThanOrEqual(100);
  });

  it('time forte demais: ela bebe poção sozinha; time no ritmo: não', () => {
    expect(lutar(100, 12).curas).toBeGreaterThan(0);
    expect(lutar(10, 5).curas).toBe(0);
  });

  it('na linha o dano vale normal; à frente vale menos, atrás vale mais', () => {
    expect(ritmoDaLuta(45, alvoDaVida(45))).toBeCloseTo(1, 5);
    expect(ritmoDaLuta(45, 0.2)).toBeLessThan(0.5);
    expect(ritmoDaLuta(45, 0.8)).toBeGreaterThan(2);
    expect(ritmoDaLuta(45, 0)).toBe(RITMO.multMin);
    // Depois dos 90 s o teto sobe: o golpe de misericórdia.
    expect(ritmoDaLuta(110, 1)).toBeGreaterThan(RITMO.multMax);
    expect(ritmoDaLuta(-5, 1)).toBe(1);
  });

  it('a cura sozinha: só bem à frente, com intervalo, e não no fim da luta', () => {
    expect(curaDoRitmo(30, 0.3, 99)).toBeGreaterThan(0);
    expect(curaDoRitmo(30, 0.6, 99)).toBe(0);
    expect(curaDoRitmo(30, 0.3, 3)).toBe(0);
    expect(curaDoRitmo(85, 0, 99)).toBe(0);
    expect(curaDoRitmo(10, 0, 99)).toBeLessThanOrEqual(RITMO.curaMax);
  });

  it('a faixa do sinal na tela tem folga (não pisca na beira)', () => {
    expect(faixaDoRitmo(0.6, 'normal')).toBe('resistente');
    expect(faixaDoRitmo(0.75, 'resistente')).toBe('resistente');
    expect(faixaDoRitmo(0.9, 'resistente')).toBe('normal');
    expect(faixaDoRitmo(1.7, 'normal')).toBe('fraca');
    expect(faixaDoRitmo(1.4, 'fraca')).toBe('fraca');
    expect(faixaDoRitmo(1.1, 'fraca')).toBe('normal');
  });
});
