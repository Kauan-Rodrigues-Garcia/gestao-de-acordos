/**
 * modelos.test.ts — os três arranjos prontos do card.
 *
 * O que se perde se isto quebrar: o líder escolhe um modelo e o card sai com
 * elemento meio fora da tela, ou o rótulo diz "personalizado" para quem nunca
 * arrastou nada.
 */
import { describe, it, expect } from 'vitest';
import {
  MODELOS, MODELO_PADRAO, modeloValido, layoutDoModelo, modeloDoLayout,
} from './modelos';
import { ELEMENTOS, MARGEM_PCT, ESCALA_MIN, ESCALA_MAX, LAYOUT_PADRAO } from './layout';

describe('catálogo de modelos', () => {
  it('todo modelo posiciona os quatro elementos dentro das margens', () => {
    for (const modelo of MODELOS) {
      const layout = layoutDoModelo(modelo.id);

      for (const { id } of ELEMENTOS) {
        const pos = layout[id];
        expect(pos, `${modelo.id} não posiciona ${id}`).toBeTruthy();
        expect(pos!.x).toBeGreaterThanOrEqual(MARGEM_PCT);
        expect(pos!.x).toBeLessThanOrEqual(100 - MARGEM_PCT);
        expect(pos!.y).toBeGreaterThanOrEqual(MARGEM_PCT);
        expect(pos!.y).toBeLessThanOrEqual(100 - MARGEM_PCT);
        expect(pos!.escala).toBeGreaterThanOrEqual(ESCALA_MIN);
        expect(pos!.escala).toBeLessThanOrEqual(ESCALA_MAX);
      }
    }
  });

  it('ids são únicos', () => {
    const ids = MODELOS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('o modelo padrão é o arranjo que já existia', () => {
    expect(layoutDoModelo(MODELO_PADRAO)).toEqual(LAYOUT_PADRAO);
  });
});

describe('modeloValido', () => {
  it('aceita id conhecido', () => {
    expect(modeloValido('midia_lado')).toBe('midia_lado');
  });

  it('id de uma versão futura cai no padrão em vez de quebrar a tela', () => {
    expect(modeloValido('carrossel_3d')).toBe(MODELO_PADRAO);
    expect(modeloValido(null)).toBe(MODELO_PADRAO);
    expect(modeloValido(undefined)).toBe(MODELO_PADRAO);
  });
});

describe('modeloDoLayout', () => {
  it('reconhece cada modelo pelo layout que ele gera', () => {
    for (const modelo of MODELOS) {
      expect(modeloDoLayout(layoutDoModelo(modelo.id))).toBe(modelo.id);
    }
  });

  it('layout vazio conta como o padrão — é onde cai quem nunca editou', () => {
    expect(modeloDoLayout({})).toBe(MODELO_PADRAO);
    expect(modeloDoLayout(null)).toBe(MODELO_PADRAO);
  });

  it('depois de arrastar, vira personalizado', () => {
    const mexido = layoutDoModelo('midia_topo');
    mexido.titulo = { ...mexido.titulo!, y: 70 };
    expect(modeloDoLayout(mexido)).toBeNull();
  });

  it('layout sem todos os elementos não passa por modelo', () => {
    expect(modeloDoLayout({ titulo: { x: 50, y: 48, escala: 1 } })).toBeNull();
  });
});
