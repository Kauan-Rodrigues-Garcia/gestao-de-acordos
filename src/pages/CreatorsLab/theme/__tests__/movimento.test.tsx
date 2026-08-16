/**
 * Movimento no Creators Lab — o defeito que este arquivo existe para impedir.
 * ─────────────────────────────────────────────────────────────────────────────
 * O Lab abria com abertura, partículas e brilho no computador de casa e
 * COMPLETAMENTE parado em dois computadores do trabalho. Ninguém tinha mexido
 * em acessibilidade: o Windows 10/11 traz "Efeitos de animação" desligado em
 * boa parte das imagens corporativas, e com ele desligado o navegador responde
 * `prefers-reduced-motion: reduce`.
 *
 * O Lab obedecia — e uma `@media (prefers-reduced-motion)` no CSS zerava
 * `animation-duration` e `transition-duration` de TUDO, com `!important`. Não
 * havia botão, aviso ou saída: a máquina decidia sozinha e em silêncio.
 *
 * A regra agora é: no Lab, quem decide é a PESSOA. O sistema apenas oferece.
 * O Gestão continua obedecendo normalmente — a exceção vale só aqui, numa área
 * escondida que se abre de propósito.
 *
 * Estes testes existem para que ninguém "conserte" isso de volta.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ReactNode } from 'react';

vi.mock('@/services/creatorsLab.service', () => ({
  buscarProgressoLab: vi.fn().mockResolvedValue(null),
  salvarProgressoLab: vi.fn().mockResolvedValue(false),
  jaDescobriuOLab:    vi.fn().mockResolvedValue(false),
}));

import { CreatorsProvider, useCreators } from '../CreatorsProvider';

/** Finge a resposta do sistema operacional sobre movimento. */
function sistemaPedeReduzir(pede: boolean) {
  vi.stubGlobal('matchMedia', (consulta: string) => ({
    matches: consulta.includes('prefers-reduced-motion') ? pede : false,
    media: consulta,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }));
}

const envolver = ({ children }: { children: ReactNode }) => (
  <CreatorsProvider>{children}</CreatorsProvider>
);

describe('a preferência do sistema OFERECE, não manda', () => {
  beforeEach(() => { localStorage.clear(); });
  afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });

  /** O caso exato dos computadores do trabalho. */
  it('sistema pedindo redução, o Lab abre com movimento COMPLETO', () => {
    sistemaPedeReduzir(true);
    const { result } = renderHook(() => useCreators(), { wrapper: envolver });
    expect(result.current.movimentoReduzido).toBe(false);
  });

  it('mas oferece a redução, uma vez', () => {
    sistemaPedeReduzir(true);
    const { result } = renderHook(() => useCreators(), { wrapper: envolver });
    expect(result.current.ofertaReduzirMovimento).toBe(true);
  });

  it('sistema calado, nem movimento reduzido nem oferta', () => {
    sistemaPedeReduzir(false);
    const { result } = renderHook(() => useCreators(), { wrapper: envolver });
    expect(result.current.movimentoReduzido).toBe(false);
    expect(result.current.ofertaReduzirMovimento).toBe(false);
  });
});

describe('quem decide é a pessoa', () => {
  beforeEach(() => { localStorage.clear(); });
  afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });

  it('o botão reduz, e a escolha fica guardada', () => {
    sistemaPedeReduzir(false);
    const { result } = renderHook(() => useCreators(), { wrapper: envolver });

    act(() => result.current.alternarMovimento());
    expect(result.current.movimentoReduzido).toBe(true);
    expect(localStorage.getItem('creatorsLab:movimento')).toBe('reduzido');

    act(() => result.current.alternarMovimento());
    expect(result.current.movimentoReduzido).toBe(false);
    expect(localStorage.getItem('creatorsLab:movimento')).toBe('completo');
  });

  it('escolha anterior por reduzido vale mesmo com o sistema calado', () => {
    localStorage.setItem('creatorsLab:movimento', 'reduzido');
    sistemaPedeReduzir(false);
    const { result } = renderHook(() => useCreators(), { wrapper: envolver });
    expect(result.current.movimentoReduzido).toBe(true);
  });

  /**
   * Quem já disse "manter" não pode ver a mesma oferta toda visita — e numa
   * máquina com animação desligada de fábrica isso seria TODA visita.
   */
  it('escolha anterior por completo silencia a oferta para sempre', () => {
    localStorage.setItem('creatorsLab:movimento', 'completo');
    sistemaPedeReduzir(true);
    const { result } = renderHook(() => useCreators(), { wrapper: envolver });
    expect(result.current.ofertaReduzirMovimento).toBe(false);
    expect(result.current.movimentoReduzido).toBe(false);
  });

  it('dispensar a oferta também é uma escolha, e fica guardada', () => {
    sistemaPedeReduzir(true);
    const { result } = renderHook(() => useCreators(), { wrapper: envolver });

    act(() => result.current.recusarOferta());
    expect(result.current.ofertaReduzirMovimento).toBe(false);
    expect(localStorage.getItem('creatorsLab:movimento')).toBe('completo');
  });
});

/**
 * A guarda que fecha a porta.
 *
 * Toda a decisão acima vira nada se voltar uma `@media (prefers-reduced-motion)`
 * ao CSS do Lab: ela roda antes de qualquer JavaScript e não consulta ninguém.
 */
describe('o CSS do Lab não pode decidir sozinho', () => {
  const CSS = readFileSync(
    resolve(__dirname, '../../creators-lab.css'), 'utf-8',
  );

  it('nenhuma media query de prefers-reduced-motion', () => {
    const emCodigo = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(emCodigo).not.toMatch(/@media[^{]*prefers-reduced-motion/);
  });

  it('a redução é ligada pelo atributo, que o provider controla', () => {
    expect(CSS).toContain('[data-movimento="reduzido"]');
  });

  it('a página escreve esse atributo na raiz', () => {
    const INDEX = readFileSync(resolve(__dirname, '../../index.tsx'), 'utf-8');
    expect(INDEX).toMatch(/data-movimento=/);
  });
});
