import { describe, expect, it } from 'vitest';
import {
  ALTURA, BRUXAS, JUNTAS, LARGURA, NUMERO_DA_PARTE, ORDEM, PARTE_DO_NUMERO, QUADROS,
  alvoDaParte, bruxaDaRodada, montarQuadro, parteNoPonto,
} from './arte';
import { avancar, chapeuVoando, criarQueda, type Morte } from './queda';
import { VELOCIDADES, avancarVoo, criarVoo, fugir, type Zona } from './voo';

/** Sorteio repetível (mulberry32). */
function semente(n: number): () => number {
  let a = n >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('arte das bruxas', () => {
  it('cada bruxa monta todos os quadros com todas as peças', () => {
    for (const b of BRUXAS) {
      for (let q = 0; q < QUADROS.length; q++) {
        const img = montarQuadro(b, q);
        expect(img.cores.length).toBe(LARGURA * ALTURA);
        const presentes = new Set(img.partes);
        for (const p of ORDEM) expect(presentes.has(NUMERO_DA_PARTE[p]), `${b.id} q${q} ${p}`).toBe(true);
      }
    }
  });

  it('toda letra usada tem cor na paleta de cada bruxa', () => {
    for (const b of BRUXAS) {
      const img = montarQuadro(b, 0);
      const pintados = img.cores.filter(Boolean).length;
      const comParte = [...img.partes].filter(Boolean).length;
      expect(pintados).toBe(comParte);
      expect(pintados).toBeGreaterThan(500);
    }
  });

  it('as juntas caem nas peças certas (o boneco nasce encaixado no sprite)', () => {
    const img = montarQuadro(BRUXAS[0], 0);
    const em = (j: keyof typeof JUNTAS) => PARTE_DO_NUMERO[parteNoPonto(img, JUNTAS[j][0], JUNTAS[j][1])];
    expect(em('cabeca')).toBe('cabeca');
    // O pescoço fica na divisa do queixo com o tronco.
    expect(['tronco', 'cabeca']).toContain(em('pescoco'));
    expect(em('peF')).toBe('pernaFrente');
  });

  it('o tiro em cada peça faz o que foi pedido', () => {
    expect(alvoDaParte('cabeca')).toBe('cabeca');
    expect(alvoDaParte('tronco')).toBe('corpo');
    expect(alvoDaParte('bracoFrente')).toBe('corpo');
    expect(alvoDaParte('palha')).toBe('vassoura');
    expect(alvoDaParte('chapeu')).toBe('chapeu');
    expect(alvoDaParte('capa')).toBe('raspao');
  });

  it('sem chapéu, o chapéu some do sprite', () => {
    const img = montarQuadro(BRUXAS[0], 0, { semChapeu: true });
    expect([...img.partes].includes(NUMERO_DA_PARTE.chapeu)).toBe(false);
  });

  it('a rodada escolhe a bruxa pelo número do banco ou pela semente', () => {
    expect(bruxaDaRodada({ bruxa: 2, semente: 99 })).toBe(BRUXAS[2]);
    expect(bruxaDaRodada({ semente: -3 })).toBe(BRUXAS[3]);
  });
});

describe('voo', () => {
  const zona: Zona = { x0: 30, y0: 25, x1: 600, y1: 260 };

  it('voa um minuto sem sair da zona e sem parar de vez', () => {
    const v = criarVoo(zona, VELOCIDADES.normal, semente(7));
    let andou = 0;
    for (let i = 0; i < 60 * 60; i++) {
      const x = v.x, y = v.y;
      avancarVoo(v, zona, 1 / 60);
      andou += Math.hypot(v.x - x, v.y - y);
      expect(v.x).toBeGreaterThanOrEqual(zona.x0);
      expect(v.x).toBeLessThanOrEqual(zona.x1);
      expect(v.y).toBeGreaterThanOrEqual(zona.y0);
      expect(v.y).toBeLessThanOrEqual(zona.y1);
    }
    // Mais rápida que o zumbi (≈ 4 px da arte por segundo), e voa de verdade.
    expect(andou / 60).toBeGreaterThan(VELOCIDADES.normal * 0.4);
  });

  it('quando o tempo acaba, foge para fora', () => {
    const v = criarVoo(zona, VELOCIDADES.normal, semente(3));
    fugir(v, zona);
    for (let i = 0; i < 60 * 15 && v.modo !== 'fora'; i++) avancarVoo(v, zona, 1 / 60);
    expect(v.modo).toBe('fora');
  });
});

describe('queda', () => {
  const entrada = (morte: Morte, n: number) => ({
    bruxa: BRUXAS[n % BRUXAS.length], quadro: 1, lado: n % 2 ? -1 : 1, x: 200, y: 60, vx: 40, vy: 0,
    morte, impacto: { x: 34, y: 13 }, chao: 300, largura: 640, aleatorio: semente(n),
  });

  for (const morte of ['cabeca', 'corpo', 'vassoura'] as const) {
    it(`${morte}: cai, espatifa no chão, suja de sangue e assenta`, () => {
      for (let n = 0; n < 8; n++) {
        const q = criarQueda(entrada(morte, n));
        for (let t = 0; t < 14 && !q.quieta; t += 1 / 30) avancar(q, 1 / 30);
        expect(q.espatifou, `bruxa ${n}`).toBe(true);
        expect(q.manchas.size).toBeGreaterThan(20);
        expect(q.pocas.length).toBeGreaterThan(0);
        // Nada atravessa o chão.
        for (const p of q.pontos) if (p.vivo) expect(p.y).toBeLessThanOrEqual(q.chao);
        if (morte === 'cabeca') expect(q.ossos.find(o => o.nome === 'cabeca')?.vivo).toBe(false);
        else expect(q.ossos.find(o => o.nome === 'cabeca')?.vivo).toBe(true);
      }
    });
  }

  it('a vassoura que cai sozinha às vezes quebra e às vezes não', () => {
    let quebrou = 0, inteira = 0;
    for (let n = 0; n < 30; n++) {
      const q = criarQueda(entrada('corpo', n));
      for (let t = 0; t < 8; t += 1 / 30) avancar(q, 1 / 30);
      if (q.soltos.some(s => s.jeito === 'vassoura')) inteira++;
      else if (q.soltos.some(s => s.jeito === 'pedaco')) quebrou++;
    }
    expect(quebrou).toBeGreaterThan(0);
    expect(inteira).toBeGreaterThan(0);
  });

  it('o tiro na vassoura a parte no ar', () => {
    const q = criarQueda(entrada('vassoura', 1));
    avancar(q, 0.1);
    expect(q.soltos.filter(s => s.jeito === 'pedaco').length).toBe(2);
    expect(q.debate).toBe(true);
  });

  it('o chapéu baleado desce e assenta no chão', () => {
    const { morte: _m, ...resto } = entrada('corpo', 2);
    const q = chapeuVoando(resto);
    expect(q.soltos).toHaveLength(1);
    for (let t = 0; t < 12; t += 1 / 30) avancar(q, 1 / 30);
    expect(q.soltos[0].modo).toBe('parada');
  });
});
