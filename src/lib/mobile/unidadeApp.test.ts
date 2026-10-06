import { describe, expect, it, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { _reiniciarUnidadeApp, definirUnidadeApp, useUnidadeApp } from './unidadeApp';

beforeEach(() => { localStorage.clear(); _reiniciarUnidadeApp(); });

describe('useUnidadeApp — Cofen em H.O. com interruptor', () => {
  it('Cofen abre em H.O.', () => {
    const { result } = renderHook(() => useUnidadeApp(true));
    expect(result.current).toEqual({ unidade: 'ho', emHO: true });
  });
  it('trocar para bruto vale para quem estiver ouvindo, e fica no aparelho', () => {
    const { result } = renderHook(() => useUnidadeApp(true));
    act(() => definirUnidadeApp('bruto'));
    expect(result.current.emHO).toBe(false);
    expect(localStorage.getItem('mobile:unidade')).toBe('bruto');
  });
  it('fora do Cofen é sempre bruto, mesmo com H.O. escolhido', () => {
    const { result } = renderHook(() => useUnidadeApp(false));
    expect(result.current).toEqual({ unidade: 'bruto', emHO: false });
  });
});
