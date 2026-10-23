/**
 * duracao.test.ts — a guerra e a luta duram quase o mesmo com 1 ou com 100
 * pessoas (pedido de 23/10/2026). Simula o ensaio (a mesma conta do banco) com
 * gente fraca, média e forte e confere a faixa: rápido demais, a luta fica mais
 * difícil (o tiro vale menos e o anjo cura); devagar demais, mais fácil.
 */
import { describe, expect, it } from 'vitest';
import { EnsaioGuerra } from './ensaio';
import { GUERRA, RITMO } from './regras';

/** Um sorteio repetível (o teste não pode variar de uma rodada para outra). */
function sorteador(sem: number) {
  let a = sem >>> 0;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/**
 * `pessoas` atacando, cada uma com `dps` de dano bruto por segundo no chefe (3 é quem quase não
 * clica; 25, quem acerta o olho sem parar) e uns `dps` cliques por segundo na guerra.
 */
function simular(pessoas: number, dps: number) {
  const r = sorteador(pessoas * 100 + dps);
  let agora = 0;
  const e = new EnsaioGuerra(8, Math.min(pessoas, GUERRA.maxPresentes), () => agora);
  for (let k = 0; k < pessoas; k++) e.atacar(`p${k}`, 1);
  let s = e.recalcular();
  while (!s.sobrou_em) {
    agora += 500;
    if (agora % GUERRA.envioMs === 0) for (let k = 0; k < pessoas; k++) e.atacar(`p${k}`, Math.round(dps * GUERRA.envioMs / 1000));
    s = e.recalcular();
  }
  const guerra = (Date.parse(s.sobrou_em) - Date.parse(s.comecou_em!)) / 1000;
  const solta = Date.parse(s.solta_em!);
  agora = solta;
  while (!s.caiu_em && agora < solta + GUERRA.prazoS * 1000) {
    agora += 250;
    if ((agora - solta) % GUERRA.loteMs === 0) for (let k = 0; k < pessoas; k++) {
      const d = dps * (0.6 + r() * 0.8);
      e.golpear(`p${k}`, { dano: d, acertos: Math.ceil(d / 3), bolas: 0, banidos: 0 });
    }
    s = e.recalcular();
  }
  return { guerra, luta: s.caiu_em ? (Date.parse(s.caiu_em) - solta) / 1000 : Infinity, anjos: s.curas ?? 0 };
}

const CASOS = [1, 3, 10, 30, 60, 100].flatMap(p => [3, 8, 25].map(dps => ({ p, dps, ...simular(p, dps) })));

describe('a duração não depende de quantos atacam', () => {
  it('a guerra acaba entre minS e maxS, com 1 ou com 100 pessoas', () => {
    for (const c of CASOS) {
      expect(c.guerra, `${c.p} pessoas, ${c.dps}/s`).toBeGreaterThanOrEqual(GUERRA.minS - 0.5);
      expect(c.guerra, `${c.p} pessoas, ${c.dps}/s`).toBeLessThanOrEqual(GUERRA.maxS + 0.5);
    }
  });
  it('a luta com o chefe dura perto do alvoS (uns 10 s de diferença no máximo)', () => {
    const lutas = CASOS.map(c => c.luta);
    for (const c of CASOS) {
      expect(c.luta, `${c.p} pessoas, ${c.dps}/s`).toBeGreaterThanOrEqual(RITMO.minS);
      expect(c.luta, `${c.p} pessoas, ${c.dps}/s`).toBeLessThanOrEqual(RITMO.alvoS + 6);
    }
    expect(Math.max(...lutas) - Math.min(...lutas)).toBeLessThanOrEqual(11);
  });
  it('o anjo só desce para quem está batendo rápido demais, e não vira enxurrada', () => {
    for (const c of CASOS) expect(c.anjos, `${c.p} pessoas, ${c.dps}/s`).toBeLessThanOrEqual(Math.ceil(RITMO.curaAteS / RITMO.curaIntervaloS));
    // os fortes ganham anjo; quem quase não clica, nunca
    expect(CASOS.filter(c => c.dps === 25).every(c => c.anjos >= 1)).toBe(true);
    expect(CASOS.filter(c => c.dps === 3).every(c => c.anjos === 0)).toBe(true);
  });
});
