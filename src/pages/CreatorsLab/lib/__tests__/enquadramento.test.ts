/**
 * A câmera que se aproxima da máquina de fliperama.
 *
 * Geometria pura, e os erros aqui são todos silenciosos na tela: escala que
 * encolhe em vez de crescer, gabinete que sai pela borda em janela baixa, e o
 * clássico `Infinity` no `transform` quando o elemento ainda não tem medida —
 * que não quebra nada, só faz a máquina desaparecer sem explicação.
 */
import { describe, it, expect } from 'vitest';
import {
  ESCALA_MAX, MARGEM_PADRAO, SEM_ENQUADRAMENTO,
  enquadrar, formatarDuracao,
  type Retangulo, type Viewport,
} from '../enquadramento';

const TELA: Viewport = { largura: 1280, altura: 800 };

/** Onde o centro do elemento vai parar depois do `translate(x,y) scale(e)`. */
function centroDepois(alvo: Retangulo, q: { x: number; y: number }) {
  return {
    x: alvo.x + alvo.largura / 2 + q.x,
    y: alvo.y + alvo.altura / 2 + q.y,
  };
}

describe('enquadrar', () => {
  it('leva o centro do elemento para o centro da tela', () => {
    const alvo: Retangulo = { x: 120, y: 940, largura: 368, altura: 620 };
    const q = enquadrar(alvo, TELA);
    const centro = centroDepois(alvo, q);
    expect(centro.x).toBeCloseTo(TELA.largura / 2, 6);
    expect(centro.y).toBeCloseTo(TELA.altura / 2, 6);
  });

  it('funciona igual para elemento acima da dobra, com coordenada negativa', () => {
    const alvo: Retangulo = { x: -40, y: -300, largura: 368, altura: 620 };
    const centro = centroDepois(alvo, enquadrar(alvo, TELA));
    expect(centro.x).toBeCloseTo(TELA.largura / 2, 6);
    expect(centro.y).toBeCloseTo(TELA.altura / 2, 6);
  });

  it('amplia até caber, respeitando a margem', () => {
    const alvo: Retangulo = { x: 0, y: 0, largura: 200, altura: 200 };
    const { escala } = enquadrar(alvo, { largura: 1000, altura: 600 }, 20);
    // O lado limitante é a altura: (600 - 40) / 200 = 2.8, teto em ESCALA_MAX.
    expect(escala).toBe(ESCALA_MAX);
  });

  it('o elemento ampliado cabe na tela com a margem pedida', () => {
    const alvo: Retangulo = { x: 300, y: 200, largura: 368, altura: 620 };
    const { escala } = enquadrar(alvo, TELA, MARGEM_PADRAO);
    expect(alvo.altura * escala).toBeLessThanOrEqual(TELA.altura - MARGEM_PADRAO * 2 + 0.001);
    expect(alvo.largura * escala).toBeLessThanOrEqual(TELA.largura - MARGEM_PADRAO * 2 + 0.001);
  });

  /**
   * Em celular deitado ou janela espremida, o cabimento daria MENOS que o
   * tamanho natural. "Aproximar" afastando seria pior que não aproximar.
   */
  it('nunca encolhe: em tela baixa a escala fica em 1', () => {
    const alvo: Retangulo = { x: 0, y: 0, largura: 368, altura: 620 };
    const { escala } = enquadrar(alvo, { largura: 900, altura: 320 });
    expect(escala).toBe(1);
  });

  it('mesmo sem espaço nenhum, o centro continua sendo respeitado', () => {
    const alvo: Retangulo = { x: 10, y: 10, largura: 368, altura: 620 };
    const tela = { largura: 300, altura: 200 };
    const centro = centroDepois(alvo, enquadrar(alvo, tela));
    expect(centro.x).toBeCloseTo(150, 6);
    expect(centro.y).toBeCloseTo(100, 6);
  });

  /**
   * Elemento não montado, ou com `display: none`, mede zero. Dividir por zero
   * devolveria `Infinity` para o `transform`, e a máquina sumiria da tela sem
   * erro nenhum no console.
   */
  it('elemento sem medida não vira Infinity', () => {
    expect(enquadrar({ x: 0, y: 0, largura: 0, altura: 0 }, TELA)).toEqual(SEM_ENQUADRAMENTO);
    expect(enquadrar({ x: 5, y: 5, largura: 300, altura: 0 }, TELA)).toEqual(SEM_ENQUADRAMENTO);
  });

  it('tela degenerada não produz NaN', () => {
    const q = enquadrar({ x: 0, y: 0, largura: 100, altura: 100 }, { largura: 0, altura: 0 });
    expect(Number.isFinite(q.x)).toBe(true);
    expect(Number.isFinite(q.y)).toBe(true);
    expect(Number.isFinite(q.escala)).toBe(true);
  });

  it('a escala nunca passa do teto, por maior que seja a tela', () => {
    const alvo: Retangulo = { x: 0, y: 0, largura: 20, altura: 20 };
    expect(enquadrar(alvo, { largura: 8000, altura: 6000 }).escala).toBe(ESCALA_MAX);
  });

  /** A volta é a ida ao contrário: o repouso é sempre o mesmo valor. */
  it('o enquadramento neutro é identidade', () => {
    expect(SEM_ENQUADRAMENTO).toEqual({ x: 0, y: 0, escala: 1 });
  });
});

describe('formatarDuracao', () => {
  it('formata minutos e segundos', () => {
    expect(formatarDuracao(0)).toBe('00:00');
    expect(formatarDuracao(65_000)).toBe('01:05');
    expect(formatarDuracao(3_600_000)).toBe('60:00');
  });

  it('trunca em vez de arredondar para cima', () => {
    expect(formatarDuracao(1_999)).toBe('00:01');
  });

  /** Coluna do ranking: valor ausente ou estragado vira travessão, não NaN. */
  it('valor ausente ou impossível vira travessão', () => {
    expect(formatarDuracao(null)).toBe('—');
    expect(formatarDuracao(undefined)).toBe('—');
    expect(formatarDuracao(NaN)).toBe('—');
    expect(formatarDuracao(-1)).toBe('—');
  });
});
