import { describe, expect, it } from 'vitest';
import {
  ALTURA, BRUXAS, JUNTAS, LARGURA, NUMERO_DA_PARTE, ORDEM, PARTE_DO_NUMERO, QUADROS,
  alvoDaParte, bruxaDaRodada, juntasDa, montarQuadro, parteNoPonto,
} from './arte';
import { cor32 } from '../fisica';
import { etiquetasDaFaixa, feitoDaFaixa, formatarTempo, fraseDaFaixa, iniciais } from './faixa';
import { avancar, caixaDoCorpo, chapeuVoando, criarQueda, finalizar, type Morte } from './queda';
import { DIFICULDADE_PADRAO, VELOCIDADES, avancarVoo, criarVoo, fugir, type Zona } from './voo';

/** As cores de sangue da queda (`queda.ts`). */
const SANGUE = new Set(['#6e0a12', '#9e1219', '#c8202a', '#e0262b', '#5a0810', '#b81a24'].map(cor32));

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
        for (const p of ORDEM) {
          if (b.semPartes?.includes(p)) continue;
          expect(presentes.has(NUMERO_DA_PARTE[p]), `${b.id} q${q} ${p}`).toBe(true);
        }
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
    for (const b of BRUXAS) {
      const img = montarQuadro(b, 0);
      const j = juntasDa(b);
      const em = (n: keyof typeof JUNTAS) => PARTE_DO_NUMERO[parteNoPonto(img, j[n][0], j[n][1])];
      expect(em('cabeca'), b.id).toBe('cabeca');
      // O pescoço fica na divisa do queixo com o tronco.
      expect(['tronco', 'cabeca'], b.id).toContain(em('pescoco'));
      if (!b.semPartes?.includes('pernaFrente')) expect(em('peF'), b.id).toBe('pernaFrente');
    }
  });

  it('metade é fofa e metade não, alternando: um personagem de cada vez', () => {
    expect(BRUXAS.filter(b => b.fofa)).toHaveLength(4);
    BRUXAS.forEach((b, i) => expect(!!b.fofa, b.id).toBe(i % 2 === 0));
    expect(new Set(BRUXAS.map(b => b.id)).size).toBe(BRUXAS.length);
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

  it('a velocidade padrão é a Insana', () => {
    expect(DIFICULDADE_PADRAO).toBe('insana');
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
    it(`${morte}: a bruxa cai, espatifa no chão, suja de sangue e assenta`, () => {
      for (let n = 0; n < 16; n++) {
        if (BRUXAS[n % BRUXAS.length].fofa) continue;
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

    it(`${morte}: o fofo cai desacordado, sem sangue, sem estourar`, () => {
      for (let n = 0; n < 16; n++) {
        if (!BRUXAS[n % BRUXAS.length].fofa) continue;
        const q = criarQueda(entrada(morte, n));
        for (let t = 0; t < 14 && !q.quieta; t += 1 / 30) avancar(q, 1 / 30);
        expect(q.espatifou, `fofo ${n}`).toBe(true);
        expect(q.tonta).toBe(true);
        expect(q.pocas).toHaveLength(0);
        // Lasca de madeira da vassoura pode sujar o chão; sangue, nenhum.
        expect([...q.manchas.values()].some(c => SANGUE.has(c)), `fofo ${n}`).toBe(false);
        // Ninguém perde a cabeça nem o braço.
        expect(q.ossos.every(o => o.vivo)).toBe(true);
        expect(q.varas.every(v => v.viva)).toBe(true);
        for (const p of q.pontos) if (p.vivo) expect(p.y).toBeLessThanOrEqual(q.chao);
      }
    });
  }

  it('o fofo desacordado leva o segundo tiro e morre: sangra, olho apaga, assenta', () => {
    for (let n = 0; n < 16; n++) {
      if (!BRUXAS[n % BRUXAS.length].fofa) continue;
      const q = criarQueda(entrada('corpo', n));
      expect(caixaDoCorpo(q)).toBeNull(); // caindo: ainda não dá para finalizar
      for (let t = 0; t < 4; t += 1 / 30) avancar(q, 1 / 30);
      const c = caixaDoCorpo(q)!;
      expect(c, `fofo ${n}`).not.toBeNull();
      expect(c.y1).toBeLessThanOrEqual(q.chao + 2);
      const cabeca = q.ossos.find(o => o.nome === 'cabeca')!.rec;
      expect(finalizar(q, (c.x0 + c.x1) / 2, (c.y0 + c.y1) / 2)).toBe(true);
      expect(q.tonta).toBe(false);
      expect(caixaDoCorpo(q)).toBeNull();
      expect(finalizar(q, c.x0, c.y0)).toBe(false); // não finaliza duas vezes
      // O olho apagou: a cabeça é outro recorte, do mesmo tamanho e no mesmo lugar.
      const nova = q.ossos.find(o => o.nome === 'cabeca')!.rec;
      expect(nova).not.toBe(cabeca);
      expect([nova.w, nova.h, nova.x0, nova.y0]).toEqual([cabeca.w, cabeca.h, cabeca.x0, cabeca.y0]);
      for (let t = 0; t < 10 && !q.quieta; t += 1 / 30) avancar(q, 1 / 30);
      expect(q.quieta).toBe(true);
      expect(q.pocas.length).toBeGreaterThan(0);
      expect([...q.manchas.values()].some(cor => SANGUE.has(cor)), `fofo ${n}`).toBe(true);
    }
  });

  it('bruxa que não é fofa já morreu na queda: não há o que finalizar', () => {
    const q = criarQueda(entrada('corpo', BRUXAS.findIndex(b => !b.fofa)));
    for (let t = 0; t < 4; t += 1 / 30) avancar(q, 1 / 30);
    expect(caixaDoCorpo(q)).toBeNull();
    expect(finalizar(q, q.pontos[0].x, q.pontos[0].y)).toBe(false);
  });

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

describe('faixa', () => {
  const bruxa = BRUXAS.find(b => !b.fofa)!;
  const fofa = BRUXAS.find(b => b.fofa)!;

  it('diz o que a pessoa fez, do jeito de cada uma', () => {
    expect(feitoDaFaixa({ bruxa, morte: 'corpo' })).toBe(`abateu ${bruxa.nome}`);
    expect(feitoDaFaixa({ bruxa: fofa, morte: 'cabeca' })).toBe(`nocauteou ${fofa.nome}`);
    expect(feitoDaFaixa({ bruxa: fofa, morte: 'vassoura' })).toBe(`derrubou ${fofa.nome} da vassoura`);
  });

  it('a frase inteira, com headshot e recorde', () => {
    expect(fraseDaFaixa({ nome: 'Mariana Souza', bruxa, morte: 'cabeca', ms: 12_400, rapida: true }))
      .toBe(`Mariana Souza abateu ${bruxa.nome} primeiro, com um headshot, em 12,4 s — o mais rápido do dia.`);
  });

  it('as etiquetas: headshot, vassourada, nocaute do fofo e recordes', () => {
    expect(etiquetasDaFaixa({ bruxa, morte: 'cabeca', hsRapido: true })).toEqual(['headshot', 'hsRapido']);
    expect(etiquetasDaFaixa({ bruxa, morte: 'vassoura' })).toEqual(['vassourada']);
    expect(etiquetasDaFaixa({ bruxa: fofa, morte: 'corpo', rapida: true })).toEqual(['nocaute', 'rapido']);
    expect(etiquetasDaFaixa({ bruxa, morte: 'corpo' })).toEqual([]);
  });

  it('o «2x»: quem derrubou o fofo e finalizou no chão', () => {
    const d = { nome: 'Mariana Souza', bruxa: fofa, morte: 'corpo' as const, ms: 12_400, dobrado: true };
    expect(etiquetasDaFaixa(d)).toEqual(['dobro']); // morreu: não é mais nocaute
    expect(etiquetasDaFaixa({ ...d, morte: 'cabeca' })).toEqual(['dobro', 'headshot']);
    expect(fraseDaFaixa(d))
      .toBe(`Mariana Souza nocauteou ${fofa.nome} primeiro em 12,4 s — e finalizou no chão com o segundo tiro (2x).`);
  });

  it('tempo e iniciais', () => {
    expect(formatarTempo(65_000)).toBe('1 min 05 s');
    expect(formatarTempo(null)).toBe('—');
    expect(iniciais('Mariana de Souza')).toBe('MS');
    expect(iniciais('Ana')).toBe('A');
  });
});
