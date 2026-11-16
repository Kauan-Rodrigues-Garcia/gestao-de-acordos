import { act, render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { CortinaAbertura, MINIMO_PRIMEIRA_MS, MINIMO_RECARGA_MS, SeguraCortina, minimoDaAbertura } from './CortinaAbertura';

function montar(ui: React.ReactNode) {
  const qc = new QueryClient();
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}
const cortina = () => document.querySelector('.gda-pre');

describe('cortina de abertura', () => {
  beforeEach(() => { vi.useFakeTimers(); sessionStorage.clear(); });
  afterEach(() => { vi.useRealTimers(); });

  it('primeira abertura da sessão fica mais que a recarga', () => {
    expect(minimoDaAbertura('primeira')).toBe(MINIMO_PRIMEIRA_MS);
    expect(minimoDaAbertura('recarga')).toBe(MINIMO_RECARGA_MS);
    expect(MINIMO_PRIMEIRA_MS).toBeGreaterThan(MINIMO_RECARGA_MS);
  });

  it('nasce na tela, fica o mínimo e esmaece', () => {
    montar(<CortinaAbertura />);
    expect(cortina()).not.toBeNull();
    act(() => { vi.advanceTimersByTime(MINIMO_PRIMEIRA_MS - 100); });
    expect(cortina()?.classList.contains('gda-pre-sai')).toBe(false);
    act(() => { vi.advanceTimersByTime(200); });
    expect(cortina()?.classList.contains('gda-pre-sai')).toBe(true);
    act(() => { vi.advanceTimersByTime(500); });
    expect(cortina()).toBeNull();
  });

  it('quem espera (sessão, página baixando) segura a cortina além do mínimo', () => {
    let soltar = () => {};
    function Espera() {
      const [esperando, setEsperando] = useState(true);
      soltar = () => setEsperando(false);
      return esperando ? <SeguraCortina /> : null;
    }
    montar(<><CortinaAbertura /><Espera /></>);
    act(() => { vi.advanceTimersByTime(MINIMO_PRIMEIRA_MS + 2000); });
    expect(cortina()?.classList.contains('gda-pre-sai')).toBe(false);
    act(() => { soltar(); });
    act(() => { vi.advanceTimersByTime(300); });
    expect(cortina()?.classList.contains('gda-pre-sai')).toBe(true);
  });

  it('recarregar na mesma sessão: mínimo menor', () => {
    sessionStorage.setItem('gda:abriu', '1');
    montar(<CortinaAbertura />);
    act(() => { vi.advanceTimersByTime(MINIMO_RECARGA_MS + 50); });
    expect(cortina()?.classList.contains('gda-pre-sai')).toBe(true);
  });

  it('desligada (outra cortina cuida do dia): não desenha nada', () => {
    montar(<CortinaAbertura desligada />);
    expect(cortina()).toBeNull();
  });
});
