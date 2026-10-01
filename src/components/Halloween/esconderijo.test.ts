import { describe, expect, it } from 'vitest';
import { sortearEsconderijo, type Caixa, type Esconderijo } from './esconderijo';

const tela: Caixa = { left: 240, top: 56, right: 1280, bottom: 720 };
const dentroDaTela = (e: Esconderijo) =>
  e.top >= tela.top && e.top + e.altura <= tela.bottom && e.left + e.largura > tela.left && e.left < tela.right;

function sortearMuitas(tabelas: Caixa[], vezes = 400) {
  const r: Esconderijo[] = [];
  for (let i = 0; i < vezes; i++) { const e = sortearEsconderijo(tabelas, tela, 0.8 + (i % 5) * 0.1); if (e) r.push(e); }
  return r;
}

describe('onde o fantasma espia', () => {
  it('usa os quatro lados quando a tabela tem espaço em volta', () => {
    const lados = new Set(sortearMuitas([{ left: 400, top: 200, right: 1000, bottom: 500 }]).map(e => e.lado));
    expect(lados).toEqual(new Set(['cima', 'baixo', 'esq', 'dir']));
  });

  it('sempre aparece dentro do que o usuário está vendo', () => {
    const tabelas = [{ left: 264, top: 90, right: 1256, bottom: 1400 }, { left: 400, top: -300, right: 900, bottom: 150 }];
    const todos = sortearMuitas(tabelas);
    expect(todos.length).toBeGreaterThan(0);
    for (const e of todos) expect(dentroDaTela(e)).toBe(true);
  });

  it('pela borda de cima, fica encostado nela e dentro da largura da tabela', () => {
    const t = { left: 400, top: 300, right: 900, bottom: 600 };
    for (const e of sortearMuitas([t]).filter(e => e.lado === 'cima')) {
      expect(e.top + e.altura).toBeCloseTo(t.top);
      expect(e.left).toBeGreaterThanOrEqual(t.left);
      expect(e.left + e.largura).toBeLessThanOrEqual(t.right);
    }
  });

  it('não usa a lateral sem espaço para o fantasma aparecer', () => {
    // Tabela da largura do conteúdo, colada nas bordas da tela
    const lados = new Set(sortearMuitas([{ left: 250, top: 200, right: 1275, bottom: 500 }]).map(e => e.lado));
    expect(lados.has('esq')).toBe(false);
    expect(lados.has('dir')).toBe(false);
  });

  it('não sorteia tabela fora da tela nem estreita demais', () => {
    expect(sortearEsconderijo([{ left: 300, top: 900, right: 800, bottom: 1200 }], tela, 1)).toBeNull();
    expect(sortearEsconderijo([{ left: 300, top: 200, right: 380, bottom: 400 }], tela, 1)).toBeNull();
    expect(sortearEsconderijo([], tela, 1)).toBeNull();
  });
});
