/**
 * sobDemanda — o carregador de pedaços sob demanda.
 *
 * O que está em jogo: um painel que não carrega não pode derrubar a tela, o
 * pré-carregamento e a abertura não podem baixar o mesmo arquivo duas vezes,
 * e uma falha passageira de rede não pode ficar gravada para sempre.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { comNovaTentativa, precarregarQuandoOcioso } from '../sobDemanda';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('comNovaTentativa', () => {
  it('baixa uma vez só, mesmo chamado por quem pré-carrega e por quem abre', async () => {
    const carregar = vi.fn(async () => ({ Painel: 'ok' }));
    const obter = comNovaTentativa(carregar);

    const [a, b] = await Promise.all([obter(), obter()]);
    await obter();

    expect(carregar).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
  });

  it('uma falha passageira é coberta pela segunda tentativa', async () => {
    const carregar = vi.fn()
      .mockRejectedValueOnce(new Error('Failed to fetch dynamically imported module'))
      .mockResolvedValueOnce({ Painel: 'ok' });
    const obter = comNovaTentativa(carregar, 1);

    await expect(obter()).resolves.toEqual({ Painel: 'ok' });
    expect(carregar).toHaveBeenCalledTimes(2);
  });

  it('duas falhas rejeitam — e a chamada seguinte tenta do zero, sem guardar o erro', async () => {
    const carregar = vi.fn()
      .mockRejectedValueOnce(new Error('rede'))
      .mockRejectedValueOnce(new Error('rede'))
      .mockResolvedValueOnce({ Painel: 'ok' });
    const obter = comNovaTentativa(carregar, 1);

    await expect(obter()).rejects.toThrow('rede');
    await expect(obter()).resolves.toEqual({ Painel: 'ok' });
    expect(carregar).toHaveBeenCalledTimes(3);
  });
});

describe('precarregarQuandoOcioso', () => {
  it('com requestIdleCallback, dispara os carregadores no ocioso e com prazo', () => {
    let agendado: (() => void) | null = null;
    const ric = vi.fn((cb: () => void, _op?: { timeout: number }) => { agendado = cb; return 7; });
    vi.stubGlobal('requestIdleCallback', ric);
    vi.stubGlobal('cancelIdleCallback', vi.fn());
    const a = vi.fn(async () => 1);
    const b = vi.fn(async () => 2);

    precarregarQuandoOcioso([a, b]);
    expect(a).not.toHaveBeenCalled();
    expect(ric.mock.calls[0][1]).toEqual({ timeout: 4_000 });

    agendado!();
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it('cancelar antes do ocioso não baixa nada', () => {
    const cancelar = vi.fn();
    vi.stubGlobal('requestIdleCallback', vi.fn(() => 42));
    vi.stubGlobal('cancelIdleCallback', cancelar);

    precarregarQuandoOcioso([vi.fn(async () => 1)])();
    expect(cancelar).toHaveBeenCalledWith(42);
  });

  it('sem requestIdleCallback (Safari), cai num setTimeout', () => {
    vi.useFakeTimers();
    vi.stubGlobal('requestIdleCallback', undefined);
    const a = vi.fn(async () => 1);

    precarregarQuandoOcioso([a]);
    expect(a).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1_500);
    expect(a).toHaveBeenCalledTimes(1);
  });

  it('falha de pré-carregamento não vira rejeição solta', async () => {
    let agendado: (() => void) | null = null;
    vi.stubGlobal('requestIdleCallback', (cb: () => void) => { agendado = cb; return 1; });
    const soltas: unknown[] = [];
    const ouvir = (e: unknown) => soltas.push(e);
    process.on('unhandledRejection', ouvir);

    precarregarQuandoOcioso([() => Promise.reject(new Error('offline'))]);
    agendado!();
    await new Promise(r => setTimeout(r, 10));

    process.off('unhandledRejection', ouvir);
    expect(soltas).toEqual([]);
  });
});
