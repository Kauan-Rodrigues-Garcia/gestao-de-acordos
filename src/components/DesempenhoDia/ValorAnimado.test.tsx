import { act, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ValorAnimado } from './ValorAnimado';

describe('ValorAnimado', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('anima mesmo quando o sistema solicita redução de movimento', () => {
    let quadro: FrameRequestCallback | null = null;
    const raf = vi.fn((cb: FrameRequestCallback) => {
      quadro = cb;
      return 1;
    });
    vi.stubGlobal('requestAnimationFrame', raf);
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })));
    vi.spyOn(performance, 'now').mockReturnValue(0);

    const tela = render(<ValorAnimado valor={10} formatar={v => String(Math.round(v))} />);
    tela.rerender(<ValorAnimado valor={20} formatar={v => String(Math.round(v))} />);

    expect(raf).toHaveBeenCalledTimes(1);
    act(() => { quadro?.(380); });
    expect(tela.getByText('20')).toBeInTheDocument();
  });
});
