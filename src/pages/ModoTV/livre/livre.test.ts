import { describe, expect, it } from 'vitest';
import {
  LADO_MIN, MAX_ELEMENTOS, MAX_TEXTO, MODELOS_LIVRES, cenaDoModelo, cenaValida, duplicarElemento, limitarCaixa,
  moverElemento, mudarCamada, novoElemento, redimensionar, type CenaLivre,
} from './cena';
import { valorDaMetrica } from './metricas';
import { montarVisao } from '../numeros';
import { numerosDemo } from '../demo';

const vazia: CenaLivre = { fundo: { tipo: 'tema' }, elementos: [] };

describe('cenaValida', () => {
  it('lixo vira cena vazia, nunca lança', () => {
    for (const bruto of [null, undefined, 42, 'x', [], { elementos: 'x' }]) {
      expect(cenaValida(bruto)).toEqual(vazia);
    }
  });

  it('descarta tipo desconhecido e corta no teto de elementos', () => {
    const muitos = Array.from({ length: MAX_ELEMENTOS + 5 }, () => ({ tipo: 'texto', texto: 'oi' }));
    expect(cenaValida({ elementos: [{ tipo: 'bomba' }, ...muitos] }).elementos.length).toBe(MAX_ELEMENTOS - 1);
  });

  it('cor que não é cor, número que não é número e texto longo caem no padrão', () => {
    const [e] = cenaValida({
      elementos: [{ tipo: 'texto', texto: 'a'.repeat(MAX_TEXTO + 50), cor: 'red; background:url(x)', tamanho: 'grande', x: 'NaN', opacidade: 9 }],
    }).elementos;
    expect(e.tipo).toBe('texto');
    if (e.tipo !== 'texto') return;
    expect(e.texto.length).toBe(MAX_TEXTO);
    expect(e.cor).toBe('#ffffff');
    expect(e.tamanho).toBe(96);
    expect(e.opacidade).toBe(1);
  });

  it('ids repetidos ou estranhos ganham id novo', () => {
    const c = cenaValida({ elementos: [{ id: 'e1', tipo: 'forma' }, { id: 'e1', tipo: 'forma' }, { id: '<script>', tipo: 'forma' }] });
    expect(new Set(c.elementos.map(e => e.id)).size).toBe(3);
    expect(c.elementos.every(e => /^[\w-]+$/.test(e.id))).toBe(true);
  });

  it('fundo desconhecido é o do tema', () => {
    expect(cenaValida({ fundo: { tipo: 'video' } }).fundo).toEqual({ tipo: 'tema' });
    expect(cenaValida({ fundo: { tipo: 'cor', cor: '#123456' } }).fundo).toEqual({ tipo: 'cor', cor: '#123456' });
  });

  it('os modelos prontos passam pelo saneamento sem perder nada', () => {
    for (const m of MODELOS_LIVRES) {
      const c = cenaDoModelo(m.id);
      expect(cenaValida(JSON.parse(JSON.stringify(c)))).toEqual(c);
      expect(c.elementos.length).toBeGreaterThan(2);
    }
  });
});

describe('caixa no palco', () => {
  it('nunca sai do palco e respeita o lado mínimo', () => {
    expect(limitarCaixa({ x: 95, y: -10, l: 20, a: 0 })).toEqual({ x: 80, y: 0, l: 20, a: LADO_MIN });
  });

  it('arrastar para fora encosta na borda', () => {
    const e = novoElemento('forma', vazia);
    expect(moverElemento(e, 500, 500)).toMatchObject({ x: 100 - e.l, y: 100 - e.a });
  });

  it('a alça puxa um canto e o oposto fica parado', () => {
    const e = { ...novoElemento('forma', vazia), x: 10, y: 10, l: 20, a: 20 };
    expect(redimensionar(e, 'se', 5, 5)).toMatchObject({ x: 10, y: 10, l: 25, a: 25 });
    expect(redimensionar(e, 'no', 5, 5)).toMatchObject({ x: 15, y: 15, l: 15, a: 15 });
    // Encolher além do mínimo não empurra o canto parado.
    expect(redimensionar(e, 'no', 50, 0)).toMatchObject({ x: 28, l: LADO_MIN });
  });
});

describe('camadas e cópia', () => {
  const c = cenaValida({ elementos: [{ id: 'a', tipo: 'forma' }, { id: 'b', tipo: 'forma' }, { id: 'c', tipo: 'forma' }] });

  it('frente é o fim da lista', () => {
    expect(mudarCamada(c, 'a', 'frente').elementos.map(e => e.id)).toEqual(['b', 'c', 'a']);
    expect(mudarCamada(c, 'c', 'tras').elementos.map(e => e.id)).toEqual(['c', 'a', 'b']);
    expect(mudarCamada(c, 'a', 'subir').elementos.map(e => e.id)).toEqual(['b', 'a', 'c']);
  });

  it('duplicar dá id novo e desloca a cópia', () => {
    const { cena, novoId } = duplicarElemento(c, 'a');
    expect(novoId).not.toBeNull();
    const copia = cena.elementos.find(e => e.id === novoId)!;
    expect(copia.x).toBe(c.elementos[0].x + 3);
  });

  it('elemento novo não repete id', () => {
    expect(novoElemento('texto', c).id).not.toMatch(/^(a|b|c)$/);
  });
});

describe('número ao vivo', () => {
  const v = montarVisao({ ...numerosDemo(), meta: 100_000, recebido: 60_000, dias_uteis: 20, dias_decorridos: 10 }, 'bruto');
  const limpo = (s: string) => s.replace(/\s/g, ' ');

  it('os mesmos números das outras telas', () => {
    expect(limpo(valorDaMetrica(v, 'falta'))).toBe('R$ 40.000,00');
    expect(valorDaMetrica(v, 'percentual')).toBe('60%');
    expect(limpo(valorDaMetrica(v, 'projecao'))).toBe('R$ 120.000,00');
  });

  it('sem número ou sem meta, traço', () => {
    expect(valorDaMetrica(null, 'recebido')).toBe('—');
    const semMeta = montarVisao({ ...numerosDemo(), meta: 0 }, 'bruto');
    expect(valorDaMetrica(semMeta, 'falta')).toBe('—');
    expect(valorDaMetrica(semMeta, 'recebido')).not.toBe('—');
  });
});
