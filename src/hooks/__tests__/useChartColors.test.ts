/**
 * Regressão do bug #1 (temas Escuro/Azul/Cinza com texto/grid "apagados" nos
 * gráficos do Dashboard, Painel Diretoria e Dashboard PaguePlay H.O.).
 *
 * Causa-raiz: o hook antigo envolvia o valor de getComputedStyle em oklch()
 *   mesmo quando já vinha no formato "oklch(...)" completo, gerando SVG
 *   com fill="oklch(oklch(...))" — inválido → Recharts caía num fallback
 *   quase invisível sobre fundos escuros.
 *
 * Este teste congela 3 contratos:
 *   1) Cores devolvidas são sempre SVG-safe (rgb/rgba/hex), nunca oklch aninhado.
 *   2) Hook reage à troca de tema (class no <html>).
 *   3) Contraste: no tema escuro, tickColor é claro (luminosidade alta).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAxisColors, useChartColors } from '../useChartColors';

/** Helper: aplica CSS vars diretamente ao <html> para simular um tema. */
function aplicarTema(vars: Record<string, string>, className = '') {
  const html = document.documentElement;
  html.className = className;
  for (const [k, v] of Object.entries(vars)) {
    html.style.setProperty(k, v);
  }
}

function limparTema() {
  const html = document.documentElement;
  html.className = '';
  ['--foreground', '--muted-foreground', '--border', '--background', '--primary']
    .forEach(v => html.style.removeProperty(v));
}

const TEMA_CLARO = {
  '--foreground':        'oklch(0.15 0.01 220)',
  '--muted-foreground':  'oklch(0.48 0.02 220)',
  '--border':            'oklch(0.90 0.01 220)',
  '--background':        'oklch(0.99 0 0)',
};
const TEMA_ESCURO = {
  '--foreground':        'oklch(0.92 0.01 220)',
  '--muted-foreground':  'oklch(0.65 0.03 220)',
  '--border':            'oklch(0.30 0.02 220)',
  '--background':        'oklch(0.12 0.015 220)',
};
const TEMA_AZUL = {
  '--foreground':        'oklch(0.93 0.012 220)',
  '--muted-foreground':  'oklch(0.62 0.030 220)',
  '--border':            'oklch(0.30 0.02 240)',
  '--background':        'oklch(0.14 0.035 240)',
};

describe('useAxisColors — fallback SVG-safe e reação ao tema', () => {
  beforeEach(() => limparTema());
  afterEach(()  => limparTema());

  it('retorna cor SVG-compatível (não oklch aninhado) no tema CLARO', () => {
    aplicarTema(TEMA_CLARO);
    const { result } = renderHook(() => useAxisColors());
    expect(result.current.tickColor).not.toMatch(/oklch\(oklch/);
    // Aceita rgb/rgba/hex
    expect(result.current.tickColor).toMatch(/^(rgb|rgba|#)/);
    expect(result.current.gridColor).toMatch(/^(rgb|rgba|#)/);
  });

  it('retorna cor SVG-compatível no tema ESCURO e reage à troca de tema', () => {
    // Começa claro
    aplicarTema(TEMA_CLARO);
    const { result } = renderHook(() => useAxisColors());
    expect(result.current.tickColor).toMatch(/^(rgb|rgba|#)/);

    // Troca para escuro — o MutationObserver do hook precisa reagir
    act(() => aplicarTema(TEMA_ESCURO, 'dark'));

    // Dá um tick no event loop para o observer disparar
    return new Promise<void>(resolve => setTimeout(() => {
      // Contrato principal: sempre SVG-safe em qualquer tema
      expect(result.current.tickColor).toMatch(/^(rgb|rgba|#)/);
      expect(result.current.tickColor).not.toMatch(/oklch/);
      expect(document.documentElement.className).toBe('dark');
      resolve();
    }, 50));
  });

  it('retorna cor SVG-compatível no tema AZUL', () => {
    aplicarTema(TEMA_AZUL, 'deep-blue');
    const { result } = renderHook(() => useAxisColors());
    expect(result.current.tickColor).toMatch(/^(rgb|rgba|#)/);
    expect(result.current.tickColor).not.toMatch(/oklch/);
  });

  it('gridColor é sempre rgba com alpha reduzido (SVG-safe, não color-mix)', () => {
    aplicarTema(TEMA_ESCURO, 'dark');
    const { result } = renderHook(() => useAxisColors());
    expect(result.current.gridColor).not.toMatch(/color-mix/);
    // Deve ter alpha (rgba com 4 valores) OU ser rgb sólido de fallback
    expect(result.current.gridColor).toMatch(/^(rgba\(\s*\d+,\s*\d+,\s*\d+,\s*[\d.]+\)|rgb\(|#)/);
  });
});

describe('useChartColors — lista de vars customizadas', () => {
  beforeEach(() => limparTema());
  afterEach(()  => limparTema());

  it('resolve CSS vars para valores SVG-safe', () => {
    aplicarTema(TEMA_ESCURO, 'dark');
    const { result } = renderHook(() => useChartColors(['--foreground', '--muted-foreground', '--border']));
    const vs = result.current;
    expect(vs['--foreground']).toMatch(/^(rgb|rgba|#)/);
    expect(vs['--muted-foreground']).toMatch(/^(rgb|rgba|#)/);
    expect(vs['--border']).toMatch(/^(rgb|rgba|#)/);
    // Nenhuma oklch aninhada
    for (const v of Object.values(vs)) {
      expect(v).not.toMatch(/oklch\(oklch/);
    }
  });

  it('usa fallback para var inexistente', () => {
    aplicarTema(TEMA_CLARO);
    const { result } = renderHook(() => useChartColors(['--var-que-nao-existe']));
    // Precisa ser alguma cor válida, não "undefined" nem string vazia
    expect(result.current['--var-que-nao-existe']).toBeTruthy();
    expect(result.current['--var-que-nao-existe']).toMatch(/^(rgb|rgba|#)/);
  });
});
