import { act, renderHook, waitFor } from '@testing-library/react';

const lerCidadeDoSetor = vi.fn<(id: string) => Promise<string | null>>();
vi.mock('@/lib/cidadeDoSetor', () => ({ lerCidadeDoSetor: (id: string) => lerCidadeDoSetor(id) }));

import { invalidarCache } from '@/lib/cacheCurto';
import { RELER_CLIMA_MS, esquecerClimaParaTeste, useClima } from '../useClima';

const PREV = (temp: number) => ({
  agora: { temp, sensacao: temp, condicao: 'limpo', noite: false, umidade: 50, vento: 10 },
  dias: [],
});
const resposta = (tb: number, tm: number) => new Response(JSON.stringify({
  fonte: 'MET Norway', geradoEm: '2026-11-06T17:00:00Z', cidades: { birigui: PREV(tb), marilia: PREV(tm) },
}), { status: 200 });

describe('useClima', () => {
  beforeEach(() => {
    esquecerClimaParaTeste();
    invalidarCache('clima');
    lerCidadeDoSetor.mockReset();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('setor de Marília vê Marília', async () => {
    lerCidadeDoSetor.mockResolvedValue('Marília');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(resposta(30, 25)));
    const { result } = renderHook(() => useClima('setor-m'));
    await waitFor(() => expect(result.current.previsao?.agora.temp).toBe(25));
    expect(result.current.cidade).toBe('marilia');
    expect(lerCidadeDoSetor).toHaveBeenCalledWith('setor-m');
  });

  it('sem setor, ou setor sem cidade: Birigui', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(resposta(30, 25))));
    const semSetor = renderHook(() => useClima(null));
    await waitFor(() => expect(semSetor.result.current.previsao?.agora.temp).toBe(30));

    lerCidadeDoSetor.mockResolvedValue(null);
    const semCidade = renderHook(() => useClima('setor-x'));
    await waitFor(() => expect(semCidade.result.current.cidade).toBe('birigui'));
  });

  it('dois componentes ao mesmo tempo fazem uma busca só', async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(resposta(30, 25)));
    vi.stubGlobal('fetch', fetchMock);
    const a = renderHook(() => useClima(null));
    const b = renderHook(() => useClima(null));
    await waitFor(() => expect(a.result.current.previsao).not.toBeNull());
    await waitFor(() => expect(b.result.current.previsao).not.toBeNull());
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('relê depois de 30 minutos, e fica com a última boa se falhar', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(resposta(30, 25))
      .mockResolvedValueOnce(resposta(31, 26))
      .mockRejectedValueOnce(new Error('rede'));
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useClima(null));
    await waitFor(() => expect(result.current.previsao?.agora.temp).toBe(30));

    await act(async () => { await vi.advanceTimersByTimeAsync(RELER_CLIMA_MS + 1000); });
    await waitFor(() => expect(result.current.previsao?.agora.temp).toBe(31));

    await act(async () => { await vi.advanceTimersByTimeAsync(RELER_CLIMA_MS + 1000); });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result.current.previsao?.agora.temp).toBe(31);
  });

  it('desligado não busca nada', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    renderHook(() => useClima('setor-m', false));
    await new Promise(r => setTimeout(r, 20));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(lerCidadeDoSetor).not.toHaveBeenCalled();
  });
});
