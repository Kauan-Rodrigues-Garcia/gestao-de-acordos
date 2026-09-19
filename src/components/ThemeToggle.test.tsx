/**
 * ThemeToggle + next-themes — um dono só para o tema.
 *
 * Até 19/09/2026 o ThemeToggle trocava as classes do <html> na mão enquanto o
 * next-themes (ThemeProvider do App) fazia o mesmo com a mesma chave do
 * localStorage. Com «Sistema» na carga e Rosa escolhido depois, a troca do SO
 * fazia o next-themes pôr `.dark` por cima do Rosa. Os testes montam o
 * provider com a MESMA configuração do App.
 */
import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider, useTheme } from 'next-themes';
import { ThemeToggle } from './ThemeToggle';
import { NOMES_TEMAS, ehTemaEscuro } from '@/lib/temas';

type Ouvinte = (e: { matches: boolean }) => void;

let ouvintes: Ouvinte[] = [];
let soEscuro = false;

function soTrocaPara(escuro: boolean) {
  soEscuro = escuro;
  act(() => { for (const o of [...ouvintes]) o({ matches: escuro }); });
}

// next-themes 0.3 usa a API antiga (addListener); o resto do app, a nova.
beforeEach(() => {
  ouvintes = [];
  soEscuro = false;
  localStorage.clear();
  document.documentElement.className = '';
  vi.stubGlobal('matchMedia', (query: string) => {
    const mql = {
      get matches() { return soEscuro; },
      media: query,
      addListener: (fn: Ouvinte) => { ouvintes.push(fn); },
      removeListener: (fn: Ouvinte) => { ouvintes = ouvintes.filter(o => o !== fn); },
      addEventListener: (_tipo: string, fn: Ouvinte) => { ouvintes.push(fn); },
      removeEventListener: (_tipo: string, fn: Ouvinte) => { ouvintes = ouvintes.filter(o => o !== fn); },
    };
    return mql;
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

let trocarTema: (t: string) => void = () => {};
function Controle() {
  trocarTema = useTheme().setTheme;
  return null;
}

function montar() {
  return render(
    <ThemeProvider
      attribute="class" defaultTheme="system" enableSystem
      themes={NOMES_TEMAS} enableColorScheme={false}
    >
      <Controle />
      <ThemeToggle />
    </ThemeProvider>,
  );
}

const classes = () => document.documentElement.classList;

describe('ThemeToggle — tema do sistema', () => {
  it('com «Sistema» salvo, o SO indo para o escuro escurece a tela', () => {
    localStorage.setItem('theme', 'system');
    montar();
    expect(classes().contains('dark')).toBe(false);

    soTrocaPara(true);
    expect(classes().contains('dark')).toBe(true);

    soTrocaPara(false);
    expect(classes().contains('dark')).toBe(false);
  });

  it('com um tema fixo, a troca do SO não mexe na tela', () => {
    localStorage.setItem('theme', 'light');
    montar();

    soTrocaPara(true);
    expect(classes().contains('dark')).toBe(false);
  });

  it('carga em «Sistema» e Rosa escolhido depois: o SO escurecer não põe .dark por cima', () => {
    localStorage.setItem('theme', 'system');
    montar();
    act(() => trocarTema('rosa'));
    expect(classes().contains('rosa')).toBe(true);

    soTrocaPara(true);
    expect(classes().contains('dark')).toBe(false);
    expect(classes().contains('rosa')).toBe(true);
  });
});

describe('ThemeToggle — troca de tema', () => {
  it('fica exatamente uma classe de tema no <html>', () => {
    localStorage.setItem('theme', 'dark');
    montar();
    for (const t of ['dark-grey', 'verde', 'deep-blue', 'rosa'] as const) {
      act(() => trocarTema(t));
      const presentes = NOMES_TEMAS.filter(n => classes().contains(n));
      expect(presentes).toEqual([t]);
    }
    expect(localStorage.getItem('theme')).toBe('rosa');
  });

  it('o menu lateral escuro sobrevive à troca de tema', () => {
    localStorage.setItem('theme', 'light');
    localStorage.setItem('menuLateralEscuro', 'true');
    montar();
    expect(classes().contains('menu-lateral-escuro')).toBe(true);

    act(() => trocarTema('verde'));
    expect(classes().contains('menu-lateral-escuro')).toBe(true);
    expect(classes().contains('verde')).toBe(true);
  });
});

describe('ehTemaEscuro', () => {
  it('reconhece os três escuros e nenhum claro', () => {
    expect(['dark', 'dark-grey', 'deep-blue'].map(ehTemaEscuro)).toEqual([true, true, true]);
    expect(['light', 'rosa', 'verde', 'system', undefined].map(ehTemaEscuro))
      .toEqual([false, false, false, false, false]);
  });
});
