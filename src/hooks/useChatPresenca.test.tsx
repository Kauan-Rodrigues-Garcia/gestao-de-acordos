import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({ perfil: 'eu', empresa: 'a', channel: vi.fn(), removeChannel: vi.fn() }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ perfil: { id: mock.perfil } }) }));
vi.mock('@/hooks/useEmpresa', () => ({ useEmpresa: () => ({ empresa: { id: mock.empresa } }) }));
vi.mock('@/lib/supabase', () => ({ supabase: { channel: mock.channel, removeChannel: mock.removeChannel } }));
import { useChatPresenca } from './useChatPresenca';

function canalFake() {
  let status!: (s: string) => void;
  const eventos: Record<string, (p?: unknown) => void> = {};
  const ch = {
    on: vi.fn((tipo: string, _filtro: unknown, cb: (p?: unknown) => void) => { eventos[tipo] = cb; return ch; }),
    subscribe: vi.fn((cb: (s: string) => void) => { status = cb; return ch; }),
    track: vi.fn(async () => 'ok'), send: vi.fn(async () => 'ok'),
    presenceState: vi.fn(() => ({ eu: [{ perfil_id: 'eu' }], outraEmpresa: [{ perfil_id: 'outraEmpresa' }] })),
  };
  return { ch, eventos, status: (s: string) => status(s) };
}
describe('presença compartilhada e reconexão', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.clearAllMocks(); mock.perfil = 'eu'; mock.empresa = 'a'; mock.removeChannel.mockResolvedValue('ok'); });
  afterEach(() => vi.useRealTimers());

  it('usa o mesmo canal privado entre empresas e remove quem saiu, incluindo múltiplas abas', async () => {
    const c = canalFake(); mock.channel.mockReturnValue(c.ch);
    const hook = renderHook(() => useChatPresenca(true));
    await act(async () => { c.status('SUBSCRIBED'); });
    act(() => c.eventos.presence());
    expect(hook.result.current.online.has('outraEmpresa')).toBe(true);
    mock.empresa = 'b'; hook.rerender();
    expect(mock.channel).toHaveBeenCalledTimes(1);
    expect(mock.channel).toHaveBeenCalledWith('presenca-chat', { config: { private: true, presence: { key: 'eu' } } });
    c.ch.presenceState.mockReturnValue({ eu: [{ perfil_id: 'eu' }], outraEmpresa: [] });
    act(() => c.eventos.presence());
    expect(hook.result.current.online.has('outraEmpresa')).toBe(false);
    hook.unmount();
    expect(mock.removeChannel).toHaveBeenCalledWith(c.ch);
  });

  it('limpa presença na desconexão, reconecta e ignora eventos do canal antigo', async () => {
    const a = canalFake(), b = canalFake();
    mock.channel.mockReturnValueOnce(a.ch).mockReturnValue(b.ch);
    const hook = renderHook(() => useChatPresenca(true));
    await act(async () => a.status('SUBSCRIBED'));
    act(() => a.eventos.presence());
    expect(hook.result.current.online.size).toBe(2);
    act(() => a.status('CHANNEL_ERROR'));
    expect(hook.result.current.online.size).toBe(0);
    await act(async () => { await vi.advanceTimersByTimeAsync(1600); b.status('SUBSCRIBED'); });
    act(() => a.eventos.presence());
    expect(hook.result.current.online.size).toBe(0);
    act(() => b.eventos.presence());
    expect(hook.result.current.online.size).toBe(2);
    expect(b.ch.track).toHaveBeenCalledWith({ perfil_id: 'eu' });
    act(() => window.dispatchEvent(new Event('offline')));
    expect(hook.result.current.online.size).toBe(0);
  });

  it('repete track se a primeira tentativa falhar e limita atividade por destinatário', async () => {
    const c = canalFake(); mock.channel.mockReturnValue(c.ch);
    c.ch.track.mockResolvedValueOnce('error');
    const hook = renderHook(() => useChatPresenca(true));
    await act(async () => c.status('SUBSCRIBED'));
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(c.ch.track).toHaveBeenCalledTimes(2);
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
