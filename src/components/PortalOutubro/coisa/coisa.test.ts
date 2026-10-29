import { describe, expect, it } from 'vitest';
import { ALTURA_DA_COISA, BALAO, BARCO, COISA, FIM_DA_CABECA, LARGURA_DA_COISA, MAO_DO_BALAO, PALETA_DA_COISA, PALETA_DA_FURIA, escrever, letra } from './arte';
import { DANCA, LARGURA_PUXANDO, MAO_PUXANDO, PUXANDO, QUADROS } from './desenho';
import {
  ALTURA_DA_CABECONA, LARGURA_DA_CABECONA, PALETA_DA_CABECONA, PALETA_DO_FOGO, aberturaDaBoca, meioDaBoca, montarCabecona, paletaEmCinza,
  type PoseDaCabecona,
} from './cabecona';
import { Desmanche } from '../desmanche';
import { Cinzas } from '../cinzas';

/** Uma imagem lisa de `w × h`, toda com cor. */
function imagem(w: number, h: number) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) data.set([200, 200, 200, 255], i * 4);
  return { data, width: w, height: h };
}

const alfa = (d: Uint8ClampedArray, w: number, x: number, y: number) => d[(y * w + x) * 4 + 3];

describe('a arte da Coisa', () => {
  it('todo quadro tem o mesmo tamanho, e cada letra tem cor nas duas paletas', () => {
    for (const q of QUADROS) {
      expect(q.linhas).toHaveLength(ALTURA_DA_COISA);
      expect(q.linhas.every(l => l.length === LARGURA_DA_COISA)).toBe(true);
      for (const ch of new Set(q.linhas.join('').replace(/\./g, ''))) {
        expect(PALETA_DA_COISA[ch], ch).toBeTruthy();
        expect(PALETA_DA_FURIA[ch], ch).toBeTruthy();
      }
    }
  });

  it('a dança mexe os braços, e só o quadro parado segura o balão', () => {
    expect(COISA).toBe(QUADROS[0].linhas);
    for (const i of DANCA) {
      expect(QUADROS[i].linhas.join('')).not.toBe(COISA.join(''));
      expect(QUADROS[i].mao).toBeNull();
    }
    expect(QUADROS[0].mao).not.toBeNull();
  });

  it('tudo tem contorno: nenhum pixel pintado encosta no vazio', () => {
    const l = COISA;
    for (let y = 0; y < l.length; y++) {
      for (let x = 0; x < l[y].length; x++) {
        if (l[y][x] === '.' || l[y][x] === 'o') continue;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const c = l[y + dy]?.[x + dx];
          if (c !== undefined) expect(c, `${x},${y}`).not.toBe('.');
        }
      }
    }
  });

  it('a mão do balão e o fim da cabeça caem no desenho', () => {
    const [x, y] = MAO_DO_BALAO;
    expect(COISA[y][x]).not.toBe('.');
    expect(COISA[FIM_DA_CABECA - 1]).toMatch(/w/);
    expect(COISA[FIM_DA_CABECA + 2]).toMatch(/c/);
  });

  it('o balão e o barquinho têm as linhas do mesmo tamanho', () => {
    expect(BALAO.every(l => l.length === 12)).toBe(true);
    expect(BARCO.every(l => l.length === 10)).toBe(true);
  });

  it('ela puxando: os quadros no mesmo tamanho, com cor, e a luva no ponto da borda', () => {
    const todos = [...PUXANDO.anda, PUXANDO.firma, PUXANDO.prepara, ...PUXANDO.puxa, PUXANDO.agachada];
    for (const q of todos) {
      expect(q).toHaveLength(ALTURA_DA_COISA);
      expect(q.every(l => l.length === LARGURA_PUXANDO)).toBe(true);
      for (const ch of new Set(q.join('').replace(/\./g, ''))) expect(PALETA_DA_COISA[ch], ch).toBeTruthy();
      const [x, y] = MAO_PUXANDO;
      expect('wW').toContain(q[y - 2][x]);
      expect('wW').toContain(q[y + 2][x]);
      // Nada encosta na borda do quadro (a inclinação cabe).
      expect(q.every(l => l[0] === '.')).toBe(true);
    }
    // O tranco joga a cabeça para trás.
    const topo = (q: readonly string[]) => q[2].search(/[^.]/);
    expect(topo(PUXANDO.puxa[0])).toBeLessThan(topo(PUXANDO.anda[0]));
  });

  it('a letrinha: 15 pontos por letra, e «BEM-VINDOS A DERRY» inteira', () => {
    for (const ch of 'BEM-VINDOS A DERRY0123456789+') expect(letra(ch)).toHaveLength(15);
    let pontos = 0;
    const largura = escrever('DERRY', 0, 0, () => { pontos++; });
    expect(largura).toBe(5 * 4 - 1);
    expect(pontos).toBeGreaterThan(30);
  });
});

describe('a Coisa de perto (o busto)', () => {
  const POSES: readonly PoseDaCabecona[] = [
    {}, { balao: true, brilho: true }, { baixa: true, dentes: true, sangue: true, baba: [9, 14] },
    { inclina: 1, olhar: [1, 1] }, { inclina: -1, olhar: [-1, -1] }, { queixo: 0.5 }, { queixo: 1, brilho: true, corpo: false },
  ];

  it('toda pose tem o mesmo tamanho, e cada letra tem cor (também no cinza)', () => {
    const cinza = paletaEmCinza(1);
    for (const pose of POSES) {
      const l = montarCabecona(pose);
      expect(l).toHaveLength(ALTURA_DA_CABECONA);
      expect(l.every(x => x.length === LARGURA_DA_CABECONA)).toBe(true);
      for (const ch of new Set(l.join('').replace(/\./g, ''))) {
        expect(PALETA_DA_CABECONA[ch], ch).toBeTruthy();
        expect(cinza[ch], ch).toBeTruthy();
      }
    }
  });

  it('as pupilas vão atrás do olhar', () => {
    const esquerda = montarCabecona({ olhar: [-1, 0] }).join('');
    const direita = montarCabecona({ olhar: [1, 0] }).join('');
    expect(esquerda).not.toBe(direita);
  });

  it('a bocarra: abre até o peito, com dentes e a luz no fundo; fechada, nada disso', () => {
    expect(aberturaDaBoca(0)).toBe(0);
    expect(aberturaDaBoca(1)).toBe(30);
    const aberta = montarCabecona({ queixo: 1, brilho: true });
    const [, y] = meioDaBoca({ queixo: 1 });
    expect(aberta[Math.round(y)]).toMatch(/[LEe]/);
    expect(aberta.join('')).toMatch(/q/);
    expect(montarCabecona({}).join('')).not.toMatch(/[qLx]/);
  });

  it('o balão cobre a boca e deixa os olhos de fora', () => {
    const l = montarCabecona({ balao: true });
    expect(l.join('')).toMatch(/y/);
    expect(l.join('')).toMatch(/v/);
    expect(l.join('')).not.toMatch(/t/); // os dentes ficam atrás do balão
  });

  it('no cinza, os olhos e o balão ficam com cor', () => {
    const c = paletaEmCinza(1);
    expect(c.y).toBe(PALETA_DA_CABECONA.y);
    expect(c.v).toBe(PALETA_DA_CABECONA.v);
    expect(c.w).not.toBe(PALETA_DA_CABECONA.w);
    expect(paletaEmCinza(0)).toBe(PALETA_DA_CABECONA);
  });

  it('no fogo: a pele com sombra, os olhos em fenda acesos; cada letra tem cor', () => {
    const conta = (g: string[], ch: string) => g.join('').split(ch).length - 1;
    for (const pose of [{ fogo: true, baixa: true, sangue: true, dentes: true, baba: [9, 14] as const }, { fogo: true, queixo: 1 }, { fogo: true, piscando: true }]) {
      const l = montarCabecona(pose);
      for (const ch of new Set(l.join('').replace(/\./g, ''))) expect(PALETA_DO_FOGO[ch], ch).toBeTruthy();
    }
    const encarando = montarCabecona({ fogo: true, baixa: true });
    expect(conta(encarando, 'A')).toBeGreaterThan(20);
    expect(conta(encarando, 'L')).toBe(4);
    expect(conta(encarando, 'y')).toBe(0);
    expect(PALETA_DO_FOGO.w).not.toBe(PALETA_DA_CABECONA.w);
  });

  it('piscando, os olhos somem; a bocarra tem as três luzes mortas', () => {
    expect(montarCabecona({ piscando: true }).join('')).not.toMatch(/y/);
    expect(montarCabecona({ fogo: true, piscando: true }).join('')).not.toMatch(/L/);
    const conta = (g: string[], ch: string) => g.join('').split(ch).length - 1;
    expect(conta(montarCabecona({ queixo: 1 }), 'L')).toBe(3);
    expect(conta(montarCabecona({ queixo: 0.4 }), 'L')).toBe(0);
  });
});

describe('o desmanche', () => {
  it('começa pela origem e solta tudo no fim', () => {
    // Sem ruído e sem lascas: só a borda andando.
    const d = new Desmanche(imagem(40, 30), { origens: [[20, 15]], duracaoS: 1, semente: 3, pesoDoRuido: 0, densidade: 0 });
    d.passo(0.3);
    // O meio já soltou; o canto ainda está lá.
    expect(alfa(d.quadro, 40, 20, 15)).toBe(0);
    expect(alfa(d.quadro, 40, 0, 0)).toBe(255);
    let passos = 0;
    while (d.passo(0.05) && passos < 400) passos++;
    expect(d.terminou).toBe(true);
    expect(d.andamento).toBe(1);
    expect(d.quadro.every((v, i) => i % 4 !== 3 || v === 0)).toBe(true);
  });

  it('é sempre igual com a mesma semente (todo mundo vê o mesmo desmanche)', () => {
    const a = new Desmanche(imagem(24, 16), { origens: [[0, 0]], duracaoS: 1, semente: 9 });
    const b = new Desmanche(imagem(24, 16), { origens: [[0, 0]], duracaoS: 1, semente: 9 });
    a.passo(0.4); b.passo(0.4);
    expect(Array.from(a.quadro)).toEqual(Array.from(b.quadro));
  });

  it('pixel sem cor não entra na conta', () => {
    const img = imagem(10, 10);
    img.data.fill(0);
    const d = new Desmanche(img, { origens: [[5, 5]], duracaoS: 1 });
    expect(d.andamento).toBe(1);
    expect(d.passo(0.1)).toBe(false);
  });
});

describe('as cinzas', () => {
  it('sobem, e somem quando a vida acaba', () => {
    const c = new Cinzas(10, () => 0.5);
    c.soltar({ x: 5, y: 20, cor: 0xffffff, vx: 0, vy: -10, dura: 1 });
    const buf = new Uint8ClampedArray(10 * 30 * 4);
    c.passo(0.5);
    c.desenhar(buf, 10, 30);
    const acesas: number[] = [];
    for (let i = 0; i < 10 * 30; i++) if (buf[i * 4 + 3] > 0) acesas.push(Math.floor(i / 10));
    expect(acesas.length).toBe(1);
    expect(acesas[0]).toBeLessThan(20);
    c.passo(0.6);
    expect(c.vivas).toBe(0);
  });

  it('cheia, não passa da capacidade', () => {
    const c = new Cinzas(3);
    for (let i = 0; i < 10; i++) c.soltar({ x: 0, y: 0, cor: 0 });
    expect(c.vivas).toBe(3);
  });
});
