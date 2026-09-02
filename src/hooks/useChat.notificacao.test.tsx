import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const estado = vi.hoisted(() => ({
  ouvinte: null as null | { onEvento: (payload: unknown) => void },
  marcarLido: vi.fn(),
  marcarEntregue: vi.fn(),
  /** A resposta de `souParte`: é ela que separa participar de monitorar. */
  souParte: vi.fn(),
}));

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ perfil: { id: 'eu' } }) }));
vi.mock('@/hooks/useEmpresa', () => ({ useEmpresa: () => ({ empresa: { id: 'emp-1' } }) }));
vi.mock('@/lib/realtime', () => ({
  assinarTabela: (_config: unknown, ouvinte: { onEvento: (payload: unknown) => void }) => {
    estado.ouvinte = ouvinte;
    return vi.fn();
  },
}));
vi.mock('@/services/chat/chat.service', () => ({
  listarConversas: vi.fn(async () => []),
  listarDisparos: vi.fn(async () => []),
  listarMensagens: vi.fn(async () => ({ mensagens: [], temMais: false })),
  buscarConversa: vi.fn(async () => null),
  marcarLido: (...args: unknown[]) => estado.marcarLido(...args),
  marcarEntregue: (...args: unknown[]) => estado.marcarEntregue(...args),
  enviarMensagem: vi.fn(),
  abrirConversa: vi.fn(),
  esbocoDeConversa: vi.fn(),
  souParte: (...args: unknown[]) => estado.souParte(...args),
}));

import { useChat } from './useChat';

function payload(id: string) {
  return {
    table: 'chat_mensagens', eventType: 'INSERT', old: {},
    new: {
      id, conversa_id: 'c-1', autor_id: 'ana', texto: 'Oi', anexos: [],
      criado_em: '2026-08-26T16:00:00Z', disparo_id: null, expurgado_em: null,
    },
  };
}

describe('useChat e visibilidade real da conversa', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    estado.ouvinte = null;
    estado.marcarLido.mockResolvedValue(undefined);
    estado.marcarEntregue.mockResolvedValue(undefined);
    estado.souParte.mockResolvedValue(true);
  });

  it('avisa mensagem realtime mas só marca lida se a janela estiver visível', async () => {
    const recebida = vi.fn();
    const hook = renderHook(
      ({ visivel }) => useChat(true, visivel, recebida),
      { initialProps: { visivel: false } },
    );
    await waitFor(() => expect(estado.ouvinte).not.toBeNull());

    act(() => hook.result.current.abrir('c-1'));
    await waitFor(() => expect(estado.marcarLido).toHaveBeenCalled());
    estado.marcarLido.mockClear();

    act(() => estado.ouvinte?.onEvento(payload('m-1')));
    // `souParte` é assíncrono: o aviso sai no microtask seguinte, não no mesmo.
    await waitFor(() =>
      expect(recebida).toHaveBeenCalledWith(expect.objectContaining({ id: 'm-1' })));
    expect(estado.marcarEntregue).toHaveBeenCalledWith('c-1', 'eu');
    await new Promise(resolve => setTimeout(resolve, 450));
    expect(estado.marcarLido).not.toHaveBeenCalled();

    hook.rerender({ visivel: true });
    act(() => estado.ouvinte?.onEvento(payload('m-2')));
    await waitFor(() => expect(estado.marcarLido).toHaveBeenCalledWith('c-1', 'eu'));
  });

  /*
   * O defeito relatado em 03/09/2026: a conta de super admin recebia aviso de
   * grupos do play 3 sem participar de nenhum. A RLS deixa quem monitora LER a
   * conversa alheia — isso é a monitoria funcionando — e o Realtime respeita a
   * RLS, então o INSERT chega ao cliente de qualquer jeito. Quem separa «posso
   * ler» de «me avise» é esta pergunta.
   */
  it('não avisa nem carimba entrega em conversa de que eu não participo', async () => {
    estado.souParte.mockResolvedValue(false);
    const recebida = vi.fn();
    renderHook(() => useChat(true, true, recebida));
    await waitFor(() => expect(estado.ouvinte).not.toBeNull());

    act(() => estado.ouvinte?.onEvento(payload('m-monitorada')));
    await waitFor(() => expect(estado.souParte).toHaveBeenCalledWith('c-1'));

    expect(recebida).not.toHaveBeenCalled();
    expect(estado.marcarEntregue).not.toHaveBeenCalled();
  });

  it('avisa o autor quando curtem a mensagem dele, uma vez por curtida', async () => {
    const curtiram = vi.fn();
    renderHook(() => useChat(true, true, vi.fn(), curtiram));
    await waitFor(() => expect(estado.ouvinte).not.toBeNull());

    const curtida = {
      table: 'chat_mensagens', eventType: 'UPDATE', old: {},
      new: {
        id: 'm-9', conversa_id: 'c-1', autor_id: 'eu', texto: 'Oi', anexos: [],
        criado_em: '2026-09-03T16:00:00Z', disparo_id: null, expurgado_em: null,
        curtida_em: '2026-09-03T17:00:00Z', curtida_por: 'ana',
      },
    };

    act(() => estado.ouvinte?.onEvento(curtida));
    expect(curtiram).toHaveBeenCalledWith(expect.objectContaining({ id: 'm-9' }));

    // O mesmo evento repetido (reconexão) não vira um segundo aviso.
    act(() => estado.ouvinte?.onEvento(curtida));
    expect(curtiram).toHaveBeenCalledTimes(1);
  });

  it('não avisa curtida na mensagem dos outros nem a minha própria curtida', async () => {
    const curtiram = vi.fn();
    renderHook(() => useChat(true, true, vi.fn(), curtiram));
    await waitFor(() => expect(estado.ouvinte).not.toBeNull());

    const base = {
      id: 'm-10', conversa_id: 'c-1', texto: 'Oi', anexos: [],
      criado_em: '2026-09-03T16:00:00Z', disparo_id: null, expurgado_em: null,
      curtida_em: '2026-09-03T17:00:00Z',
    };

    // Mensagem de outra pessoa: o aviso é do AUTOR.
    act(() => estado.ouvinte?.onEvento({
      table: 'chat_mensagens', eventType: 'UPDATE', old: {},
      new: { ...base, autor_id: 'ana', curtida_por: 'bia' },
    }));
    // Curtida minha na minha mensagem: eu estava olhando quando cliquei.
    act(() => estado.ouvinte?.onEvento({
      table: 'chat_mensagens', eventType: 'UPDATE', old: {},
      new: { ...base, id: 'm-11', autor_id: 'eu', curtida_por: 'eu' },
    }));
    // Descurtida: `curtida_por` volta a nulo e não há nada a anunciar.
    act(() => estado.ouvinte?.onEvento({
      table: 'chat_mensagens', eventType: 'UPDATE', old: {},
      new: { ...base, id: 'm-12', autor_id: 'eu', curtida_por: null },
    }));

    expect(curtiram).not.toHaveBeenCalled();
  });
});
