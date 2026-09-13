/**
 * ThemeToggle — o tema «Sistema» acompanha o sistema operacional.
 *
 * O listener de `prefers-color-scheme` morava no efeito de montagem e lia
 * `current` pela closure: congelado em `'light'`, o valor do primeiro render.
 * A condição `current === 'system'` nunca era verdadeira, e quem escolhia
 * «Sistema» não via a tela trocar quando o SO passava para o escuro.
 */
import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeToggle } from './ThemeToggle';

type Ouvinte = (e: { matches: boolean }) => void;

let ouvintes: Ouvinte[] = [];
let soEscuro = false;

function soTrocaPara(escuro: boolean) {
  soEscuro = escuro;
  act(() => { for (const o of [...ouvintes]) o({ matches: escuro }); });
}

beforeEach(() => {
  ouvintes = [];
  soEscuro = false;
  localStorage.clear();
  document.documentElement.className = '';
  vi.stubGlobal('matchMedia', (query: string) => ({
    get matches() { return soEscuro; },
    media: query,
    addEventListener: (_tipo: string, fn: Ouvinte) => { ouvintes.push(fn); },
    removeEventListener: (_tipo: string, fn: Ouvinte) => {
      ouvintes = ouvintes.filter(o => o !== fn);
    },
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ThemeToggle — tema do sistema', () => {
  it('com «Sistema» salvo, o SO indo para o escuro escurece a tela', () => {
    localStorage.setItem('theme', 'system');
    render(<ThemeToggle />);
    expect(document.documentElement.classList.contains('dark')).toBe(false);

    soTrocaPara(true);
    expect(document.documentElement.classList.contains('dark')).toBe(true);

    soTrocaPara(false);
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('com um tema fixo, a troca do SO não mexe na tela', () => {
    localStorage.setItem('theme', 'light');
    render(<ThemeToggle />);

    soTrocaPara(true);
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    // E nem fica ouvindo: o listener só existe enquanto o tema é «Sistema».
    expect(ouvintes).toHaveLength(0);
  });

  it('desmontar solta o listener', () => {
    localStorage.setItem('theme', 'system');
    const { unmount } = render(<ThemeToggle />);
    expect(ouvintes).toHaveLength(1);
    unmount();
    expect(ouvintes).toHaveLength(0);
  });
});
