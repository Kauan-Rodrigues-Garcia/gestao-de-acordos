import { describe, expect, it } from 'vitest';
import { alvoDaGuerra, curaDoRitmo, danoBruto, FILME, GUERRA, mortesPela, ordemDasMortes, parteDoFilme, pressaoEfetiva, ritmoDaLuta, RITMO, vidaDoChefe } from './regras';

describe('a ordem das mortes', () => {
  it('é a mesma em toda tela (sai da semente) e nunca leva o vencedor', () => {
    const a = ordemDasMortes(1234, 10, 3), b = ordemDasMortes(1234, 10, 3);
    expect(a).toEqual(b);
    expect(a).toHaveLength(9);
    expect(a).not.toContain(3);
    expect([...a].sort((x, y) => x - y)).toEqual([0, 1, 2, 4, 5, 6, 7, 8, 9]);
  });
  it('muda com a semente', () => {
    expect(ordemDasMortes(1, 12, 0)).not.toEqual(ordemDasMortes(2, 12, 0));
  });
});

describe('a pressão', () => {
  const alvo = alvoDaGuerra(10, 20);
  it('o alvo cresce com quem está no lobby, até o teto', () => {
    expect(alvo).toBe(9 * (GUERRA.alvoPorMorteBase + GUERRA.alvoPorMortePorPessoa * 20));
    expect(alvoDaGuerra(10, 500)).toBe(alvoDaGuerra(10, GUERRA.maxPresentes));
    expect(alvoDaGuerra(10, 0)).toBe(alvoDaGuerra(10, 1));
  });
  it('sem clique, acaba em maxS; com clique demais, não antes de minS', () => {
    expect(pressaoEfetiva(0, alvo, GUERRA.maxS)).toBeCloseTo(alvo);
    expect(pressaoEfetiva(0, alvo, GUERRA.maxS / 2)).toBeCloseTo(alvo / 2);
    expect(pressaoEfetiva(1e9, alvo, GUERRA.minS / 2)).toBeCloseTo(alvo / 2);
    expect(pressaoEfetiva(1e9, alvo, GUERRA.minS)).toBe(alvo);
    expect(pressaoEfetiva(10, alvo, -1)).toBe(0);
  });
  it('as mortes sobem de uma em uma e param em n − 1', () => {
    let antes = 0;
    for (let p = 0; p <= alvo; p += alvo / 200) { const m = mortesPela(p, alvo, 10); expect(m - antes).toBeLessThanOrEqual(1); expect(m).toBeGreaterThanOrEqual(antes); antes = m; }
    expect(mortesPela(alvo, alvo, 10)).toBe(9);
    expect(mortesPela(alvo * 5, alvo, 10)).toBe(9);
    expect(mortesPela(alvo, alvo, 1)).toBe(0);
  });
});

describe('o filme e o chefe', () => {
  it('as partes do filme, na ordem, e o chefe aos filmeS', () => {
    expect(parteDoFilme(0)).toBe('cessar');
    expect(parteDoFilme(FILME.luto + 0.01)).toBe('luto');
    expect(parteDoFilme(FILME.raiva)).toBe('raiva');
    expect(parteDoFilme(FILME.transforma + 1)).toBe('transforma');
    expect(parteDoFilme(FILME.revela + 1)).toBe('revela');
    expect(parteDoFilme(GUERRA.filmeS)).toBe('chefe');
  });
  it('a vida cresce com quem atacou, até o teto', () => {
    expect(vidaDoChefe(1)).toBe(GUERRA.vidaBase + GUERRA.vidaPorPessoa);
    expect(vidaDoChefe(1000)).toBe(vidaDoChefe(GUERRA.maxPessoas));
  });
  it('os tetos do lote', () => {
    expect(danoBruto({ dano: 9999, acertos: 99, bolas: 99, banidos: 99 }, 1000))
      .toBeCloseTo(GUERRA.maxAcertosPorLote * GUERRA.maxDanoPorAcerto + GUERRA.maxBolasPorLote * GUERRA.bolaFracao * 1000 + GUERRA.banidoFracao * 1000);
    expect(danoBruto({ dano: -5, acertos: -1, bolas: 0, banidos: 0 }, 1000)).toBe(0);
  });
});

describe('o diretor de ritmo e o anjo', () => {
  it('caindo devagar o dano vale mais; caindo rápido, menos', () => {
    expect(ritmoDaLuta(45, 0.9)).toBeGreaterThan(1);
    expect(ritmoDaLuta(45, 0.1)).toBeLessThan(1);
    expect(ritmoDaLuta(45, 0.5)).toBeCloseTo(1, 1);
    expect(ritmoDaLuta(-1, 0.5)).toBe(1);
    expect(ritmoDaLuta(0, 0)).toBe(RITMO.multMin);
  });
  it('o anjo só desce bem à frente da linha, com intervalo, e até curaAteS', () => {
    expect(curaDoRitmo(30, 0.3, 30)).toBeGreaterThan(0);
    expect(curaDoRitmo(30, 0.6, 30)).toBe(0);
    expect(curaDoRitmo(30, 0.3, 2)).toBe(0);
    expect(curaDoRitmo(RITMO.curaAteS, 0, 30)).toBe(0);
    expect(curaDoRitmo(10, 0, 30)).toBeLessThanOrEqual(RITMO.curaMax);
  });
});
