import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({
  perfil: 'eu',
  empresa: 'a',
  channel: vi.fn(),
  removeChannel: vi.fn(),
  /** O que o PresenceProvider diz estar online na aplicação inteira. */
  online: new Set<string>(),
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ perfil: { id: mock.perfil } }) }));
vi.mock('@/hooks/useEmpresa', () => ({ useEmpresa: () => ({ empresa: { id: mock.empresa } }) }));
vi.mock('@/lib/supabase', () => ({ supabase: { channel: mock.channel, removeChannel: mock.removeChannel } }));
vi.mock('@/providers/PresenceProvider', () => ({
  useOnlineUsers: () => ({ onlineIds: new Set(), onlineIdsGlobal: mock.online, loading: false }),
}));
import { useChatPresenca } from './useChatPresenca';

function canalFake() {
  let status!: (s: string) => void;
  const eventos: Record<string, (p?: unknown) => void> = {};
  const ch = {
    on: vi.fn((tipo: string, _filtro: unknown, cb: (p?: unknown) => void) => { eventos[tipo] = cb; return ch; }),
    subscribe: vi.fn((cb: (s: string) => void) => { status = cb; return ch; }),
    track: vi.fn(async () => 'ok'), send: vi.fn(async () => 'ok'),
  };
  return { ch, eventos, status: (s: string) => status(s) };
}

describe('atividade do chat e reconexão', () => {
  beforeEach(() => {
    vi.useFakeTimers(); vi.clearAllMocks();
    mock.perfil = 'eu'; mock.empresa = 'a';
    mock.online = new Set<string>();
    mock.removeChannel.mockResolvedValue('ok');
  });
  afterEach(() => vi.useRealTimers());

  // O canal daqui é de broadcast e nada mais. O `track()` que existia neste hook
  // era o segundo evento de presence por pessoa logada — e como o orçamento do
  // Realtime é do tenant, não do canal, ele saía do mesmo teto que o do
  // PresenceProvider. Se voltar, o teto volta a estourar.
  it('o canal é só de broadcast: não pede presence e nunca faz track', async () => {
    const c = canalFake(); mock.channel.mockReturnValue(c.ch);
    const hook = renderHook(() => useChatPresenca(true));
    await act(async () => { c.status('SUBSCRIBED'); });

    expect(mock.channel).toHaveBeenCalledTimes(1);
    expect(mock.channel).toHaveBeenCalledWith('presenca-chat', { config: { private: true } });
    expect(c.ch.track).not.toHaveBeenCalled();

    // Nem depois de esperar: não há retentativa de track para ressuscitar.
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(c.ch.track).not.toHaveBeenCalled();

    hook.unmount();
    expect(mock.removeChannel).toHaveBeenCalledWith(c.ch);
  });

  // O chat cruza empresas, então o conjunto lido é o GLOBAL do Provider. Ler o
  // recortado por empresa deixaria um terço das conversas sempre "offline".
  it('quem está online vem do Provider, incluindo gente de outra empresa', async () => {
    mock.online = new Set(['eu', 'deOutraEmpresa']);
    const c = canalFake(); mock.channel.mockReturnValue(c.ch);
    const hook = renderHook(() => useChatPresenca(true));
    await act(async () => { c.status('SUBSCRIBED'); });

    expect(hook.result.current.online.has('deOutraEmpresa')).toBe(true);
    expect(hook.result.current.online.size).toBe(2);

    // Trocar de empresa não recria o canal: ele não é escopado por empresa.
    mock.empresa = 'b'; hook.rerender();
    expect(mock.channel).toHaveBeenCalledTimes(1);
  });

  it('reconecta e ignora broadcast do canal antigo', async () => {
    const a = canalFake(), b = canalFake();
    mock.channel.mockReturnValueOnce(a.ch).mockReturnValue(b.ch);
    const hook = renderHook(() => useChatPresenca(true));
    await act(async () => a.status('SUBSCRIBED'));

    act(() => a.eventos.broadcast({ payload: { de: 'ana', para: 'eu', atividade: 'digitando' } }));
    expect(hook.result.current.digitando.has('ana')).toBe(true);

    act(() => a.status('CHANNEL_ERROR'));
    expect(hook.result.current.digitando.size).toBe(0);

    await act(async () => { await vi.advanceTimersByTimeAsync(1600); b.status('SUBSCRIBED'); });

    // O canal velho não fala mais: quem responde é só o atual.
    act(() => a.eventos.broadcast({ payload: { de: 'ana', para: 'eu', atividade: 'digitando' } }));
    expect(hook.result.current.digitando.size).toBe(0);
    act(() => b.eventos.broadcast({ payload: { de: 'ana', para: 'eu', atividade: 'digitando' } }));
    expect(hook.result.current.digitando.has('ana')).toBe(true);

    act(() => window.dispatchEvent(new Event('offline')));
    expect(hook.result.current.digitando.size).toBe(0);
  });

  it('limita o aviso por destinatário e a marca expira sozinha', async () => {
    const c = canalFake(); mock.channel.mockReturnValue(c.ch);
    const hook = renderHook(() => useChatPresenca(true));
    await act(async () => c.status('SUBSCRIBED'));

    act(() => {
      hook.result.current.avisarDigitando('ana'); hook.result.current.avisarDigitando('ana');
      hook.result.current.avisarDigitando('bia');
    });
    expect(c.ch.send).toHaveBeenCalledTimes(2);

    act(() => c.eventos.broadcast({ payload: { de: 'ana', para: 'eu', atividade: 'gravando' } }));
    expect(hook.result.current.gravando.has('ana')).toBe(true);
    await act(async () => { await vi.advanceTimersByTimeAsync(4000); });
    expect(hook.result.current.gravando.size).toBe(0);
  });
});
