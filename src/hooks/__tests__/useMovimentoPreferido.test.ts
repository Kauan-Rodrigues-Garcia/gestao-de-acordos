/**
 * src/hooks/__tests__/useMovimentoPreferido.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * O caso que originou o hook: PC de trabalho com "Efeitos de animação"
 * desligado responde `prefers-reduced-motion: reduce` sem que ninguém tenha
 * pedido acessibilidade. Obedecer isso cegamente matava a contagem dos números
 * do Desempenho do Dia.
 *
 * Cenários cobertos:
 *   1. Sem escolha guardada e sistema calado  -> movimento completo
 *   2. Sem escolha guardada e sistema PEDINDO -> movimento completo (o caso)
 *   3. Escolha "reduzido" guardada            -> sem movimento
 *   4. Escolha "completo" guardada + sistema pedindo -> movimento completo
 *   5. `sistemaPedeReduzir` reflete a media query, para oferecer a redução
 *   6. localStorage indisponível não quebra o hook
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useMovimentoPreferido, CHAVE_MOVIMENTO } from '../useMovimentoPreferido';

/** Finge a resposta do sistema para `prefers-reduced-motion`. */
function fingirSistema(pedeReduzir: boolean) {
  vi.stubGlobal('matchMedia', vi.fn().mockImplementation((query: string) => ({
    matches: pedeReduzir,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })));
}

describe('useMovimentoPreferido', () => {
  beforeEach(() => {
    localStorage.clear();
    fingirSistema(false);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sem escolha e sem pedido do sistema: movimento completo', () => {
    const { result } = renderHook(() => useMovimentoPreferido());
    expect(result.current.semMovimento).toBe(false);
    expect(result.current.semEscolha).toBe(true);
  });

  it('sem escolha, sistema PEDINDO reduzir: movimento continua completo', () => {
    // O caso do PC de trabalho. A media query sugere; ela não manda.
    fingirSistema(true);
    const { result } = renderHook(() => useMovimentoPreferido());
    expect(result.current.semMovimento).toBe(false);
    expect(result.current.sistemaPedeReduzir).toBe(true);
    expect(result.current.semEscolha).toBe(true);
  });

  it('escolha guardada como reduzido: sem movimento', () => {
    localStorage.setItem(CHAVE_MOVIMENTO, 'reduzido');
    const { result } = renderHook(() => useMovimentoPreferido());
    expect(result.current.semMovimento).toBe(true);
    expect(result.current.semEscolha).toBe(false);
  });

  it('escolha guardada como completo vence o pedido do sistema', () => {
    fingirSistema(true);
    localStorage.setItem(CHAVE_MOVIMENTO, 'completo');
    const { result } = renderHook(() => useMovimentoPreferido());
    expect(result.current.semMovimento).toBe(false);
    expect(result.current.semEscolha).toBe(false);
  });

  it('valor guardado invalido conta como escolha nenhuma', () => {
    localStorage.setItem(CHAVE_MOVIMENTO, 'talvez');
    const { result } = renderHook(() => useMovimentoPreferido());
    expect(result.current.semEscolha).toBe(true);
    expect(result.current.semMovimento).toBe(false);
  });

  it('localStorage indisponivel nao quebra', () => {
    const espiao = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('modo privado');
    });
    const { result } = renderHook(() => useMovimentoPreferido());
    expect(result.current.semMovimento).toBe(false);
    expect(result.current.semEscolha).toBe(true);
    espiao.mockRestore();
  });
});
