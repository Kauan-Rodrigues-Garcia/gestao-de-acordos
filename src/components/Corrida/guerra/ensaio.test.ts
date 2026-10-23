import { describe, expect, it } from 'vitest';
import { EnsaioGuerra } from './ensaio';
import { GUERRA, RITMO, vidaDoChefe } from './regras';

/** Um ensaio com o relógio na mão do teste. */
function ensaio(cavalos = 10, presentes = 5) {
  let agora = 1_000_000;
  const g = new EnsaioGuerra(cavalos, presentes, () => agora);
  return { g, andar: (s: number) => { agora += s * 1000; } };
}
const lote = (dano: number, acertos = 1) => ({ dano, acertos, bolas: 0, banidos: 0 });

describe('o ensaio da guerra (a mesma conta do banco)', () => {
  it('a primeira chamada começa a guerra; sem clique nenhum ela acaba em maxS', () => {
    const { g, andar } = ensaio();
    expect(g.estado().comecou_em).toBeNull();
    g.atacar('ana', 0);
    expect(g.estado().comecou_em).not.toBeNull();
    andar(GUERRA.maxS - 1); expect(g.recalcular().sobrou_em).toBeNull();
    andar(2); const e = g.recalcular();
    expect(e.sobrou_em).not.toBeNull();
    expect(Date.parse(e.solta_em!) - Date.parse(e.sobrou_em!)).toBe(GUERRA.filmeS * 1000);
    expect(Date.parse(e.expira_em!) - Date.parse(e.solta_em!)).toBe(GUERRA.prazoS * 1000);
  });

  it('com muito clique não acaba antes de minS, e a vida é pela gente que atacou', () => {
    const { g, andar } = ensaio();
    for (const quem of ['ana', 'bia', 'caio']) g.atacar(quem, 40);
    for (let s = 0; s < GUERRA.minS - 1; s++) { andar(1); for (const quem of ['ana', 'bia', 'caio']) g.atacar(quem, 40); }
    expect(g.estado().sobrou_em).toBeNull();
    andar(2); const e = g.atacar('ana', 40);
    expect(e.sobrou_em).not.toBeNull();
    expect(e.pessoas).toBe(3);
    expect(e.vida_max).toBe(vidaDoChefe(3));
  });

  it('o chefe só apanha depois de solto; antes de minS a vida não passa do piso', () => {
    const { g, andar } = ensaio();
    g.atacar('ana', 0); andar(GUERRA.maxS + 1); g.recalcular();
    expect(g.golpear('ana', lote(20)).vida).toBe(g.estado().vida_max);   // ainda no filme
    andar(GUERRA.filmeS + 1);
    for (let k = 0; k < 400; k++) g.golpear('ana', lote(20 * 14, 14));
    const e = g.estado();
    expect(e.caiu_em).toBeNull();
    expect(e.vida).toBeGreaterThanOrEqual(Math.floor(RITMO.piso * e.vida_max!));
    andar(RITMO.minS);
    for (let k = 0; k < 400 && !g.estado().caiu_em; k++) g.golpear('ana', lote(20 * 14, 14));
    expect(g.estado().caiu_em).not.toBeNull();
    expect(g.estado().vida).toBe(0);
    expect(g.estado().ranking?.[0]?.usuario).toBe('ana');
  });

  it('o anjo: com a vida bem atrás da linha ideal, ele cura uma vez e espera o intervalo', () => {
    const { g, andar } = ensaio();
    g.atacar('ana', 0); andar(GUERRA.maxS + 1); g.recalcular(); andar(GUERRA.filmeS + RITMO.curaIntervaloS + 1);
    let e = g.estado();
    for (let k = 0; k < 200 && (e.curas ?? 0) === 0; k++) e = g.golpear('ana', lote(20 * 14, 14));
    expect(e.curas).toBe(1);
    expect(e.cura_vida).toBeGreaterThan(0);
    expect(e.cura_vida).toBeLessThanOrEqual(Math.round(RITMO.curaMax * e.vida_max!));
    for (let k = 0; k < 50; k++) e = g.golpear('ana', lote(20 * 14, 14));
    expect(e.curas).toBe(1);   // antes do intervalo, não
    andar(RITMO.curaIntervaloS); e = g.golpear('ana', lote(20 * 14, 14));
    expect(e.curas).toBe(2);
  });

  it('a versão só sobe (aviso atrasado não desfaz nada na tela)', () => {
    const { g, andar } = ensaio();
    let v = -1;
    g.atacar('ana', 5);
    for (let k = 0; k < 30; k++) { andar(1); const e = g.atacar('ana', 3); expect(e.versao!).toBeGreaterThanOrEqual(v); v = e.versao!; }
  });
});
