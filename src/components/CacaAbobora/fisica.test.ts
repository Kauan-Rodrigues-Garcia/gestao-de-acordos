import { describe, expect, it } from 'vitest';
import { CHAO, DURACAO_S, PALCO_A, PALCO_L, acabou, avancar, criarMorte, desenhar } from './fisica';
import { sorteador } from './esconderijo';
import { ZUMBIS } from './zumbis';

function rodarAte(m: ReturnType<typeof criarMorte>, t: number) {
  while (m.t < t) avancar(m, 1 / 60);
}

function pixels(m: ReturnType<typeof criarMorte>) {
  const buf = new Uint32Array(PALCO_L * PALCO_A);
  desenhar(m, buf);
  return buf;
}

describe('a morte do zumbi', () => {
  it('headshot: a cabeça vira pedaços e o corpo tomba e assenta deitado', () => {
    const m = criarMorte(ZUMBIS[0], 0, 'cabeca', { x: 14, y: 6 }, sorteador(1));
    rodarAte(m, 0.1);
    expect(m.gotas.length).toBeGreaterThan(80);
    // O corpo — os enfeites que se soltam (o fone do Operador) são peças à parte.
    const doCorpo = m.pecas.filter(p => !p.jeito);
    expect(doCorpo).toHaveLength(1);
    rodarAte(m, 3);
    const corpo = doCorpo[0];
    expect(corpo.modo).toBe('parada');
    expect(Math.abs(corpo.ang)).toBeCloseTo(Math.PI / 2);
    // Deitado, abre a poça.
    expect(m.pocas.length).toBe(1);
  });

  it('tiro no corpo: cabeça, dois braços e as pernas viram peças; tudo para no chão', () => {
    const m = criarMorte(ZUMBIS[3], 2, 'corpo', { x: 10, y: 17 }, sorteador(2));
    rodarAte(m, 0.1);
    expect(m.pecas.filter(p => !p.jeito)).toHaveLength(4);
    rodarAte(m, 4);
    for (const p of m.pecas) expect(p.modo).toBe('parada');
    // A cabeça para numa poça.
    expect(m.pocas.length).toBeGreaterThanOrEqual(2);
  });

  it('nada atravessa o chão', () => {
    for (const tiro of ['cabeca', 'corpo'] as const) {
      const m = criarMorte(ZUMBIS[6], 1, tiro, { x: 12, y: tiro === 'cabeca' ? 5 : 17 }, sorteador(3));
      for (let t = 0; t < 3; t += 0.05) {
        rodarAte(m, t);
        for (const g of m.gotas) expect(g.y).toBeLessThanOrEqual(g.chao + 0.01);
      }
      rodarAte(m, 4);
      const buf = pixels(m);
      // Abaixo da faixa do chão (que tem um pouco de profundidade) não há pixel.
      for (let y = CHAO + 6; y < PALCO_A; y++) {
        for (let x = 0; x < PALCO_L; x++) expect(buf[y * PALCO_L + x], `${tiro} em ${x},${y}`).toBe(0);
      }
    }
  });

  it('o primeiro quadro é o zumbi em branco (o clarão do tiro); a cena acaba sozinha', () => {
    const m = criarMorte(ZUMBIS[1], 0, 'cabeca', { x: 14, y: 6 }, sorteador(4));
    avancar(m, 0.01);
    const buf = pixels(m);
    const cores = new Set(Array.from(buf).filter(c => c !== 0));
    expect([...cores]).toEqual([0xffffffff]);
    rodarAte(m, DURACAO_S);
    expect(acabou(m)).toBe(true);
  });

  it('um computador lento (quadro de 1 s) não faz nada atravessar o chão', () => {
    const m = criarMorte(ZUMBIS[2], 0, 'corpo', { x: 10, y: 17 }, sorteador(5));
    avancar(m, 0.1);
    avancar(m, 1);
    for (const g of m.gotas) expect(g.y).toBeLessThanOrEqual(g.chao + 0.01);
  });
});

describe('cada zumbi morre do seu jeito', () => {
  const porId = (id: string) => ZUMBIS.find(z => z.id === id)!;

  it('o machado do Lenhador sai da cabeça no headshot e finca no chão', () => {
    const m = criarMorte(porId('lenhador'), 0, 'cabeca', { x: 14, y: 6 }, sorteador(11));
    rodarAte(m, 0.1);
    const machado = m.pecas.find(p => p.jeito === 'crava');
    expect(machado).toBeDefined();
    const eventos: string[] = [];
    while (m.t < 4) { avancar(m, 1 / 60); eventos.push(...m.eventos.splice(0).map(e => e.tipo)); }
    expect(machado!.modo).toBe('parada');
    // De pé, quase reto: a lâmina para baixo.
    expect(machado!.ang).toBeCloseTo(Math.PI / 2 - Math.PI / 12);
    expect(eventos).toContain('crava');
  });

  it('no tiro no corpo o machado fica na cabeça (não sai voando)', () => {
    const m = criarMorte(porId('lenhador'), 0, 'corpo', { x: 10, y: 17 }, sorteador(12));
    rodarAte(m, 0.1);
    expect(m.pecas.some(p => p.jeito === 'crava')).toBe(false);
  });

  it('a bag do Entregador cai e solta uma pizza', () => {
    const m = criarMorte(porId('entregador'), 0, 'corpo', { x: 10, y: 17 }, sorteador(13));
    const eventos: string[] = [];
    while (m.t < 4) { avancar(m, 1 / 60); eventos.push(...m.eventos.splice(0).map(e => e.tipo)); }
    expect(eventos).toContain('pop');
    // A pizza é uma peça a mais, 6×6.
    expect(m.pecas.some(p => p.w === 6 && p.h === 6)).toBe(true);
  });

  it('a gravata do Gerente desce planando: cai bem mais devagar que um braço', () => {
    const m = criarMorte(porId('gerente'), 0, 'corpo', { x: 10, y: 17 }, sorteador(14));
    rodarAte(m, 0.6);
    const gravata = m.pecas.find(p => p.jeito === 'plana')!;
    expect(gravata).toBeDefined();
    expect(gravata.vy).toBeLessThanOrEqual(42);
  });

  it('o cérebro do Cientista suja o chão de rosa', () => {
    const m = criarMorte(porId('cientista'), 0, 'cabeca', { x: 14, y: 6 }, sorteador(15));
    const eventos: string[] = [];
    while (m.t < 4) { avancar(m, 1 / 60); eventos.push(...m.eventos.splice(0).map(e => e.tipo)); }
    expect(eventos).toContain('plof');
  });
});
