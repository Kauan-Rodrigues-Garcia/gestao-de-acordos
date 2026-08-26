import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const estado = vi.hoisted(() => ({
  ouvinte: null as null | { onEvento: (payload: unknown) => void },
  marcarLido: vi.fn(),
  marcarEntregue: vi.fn(),
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
    expect(recebida).toHaveBeenCalledWith(expect.objectContaining({ id: 'm-1' }));
    expect(estado.marcarEntregue).toHaveBeenCalledWith('c-1', 'eu');
    await new Promise(resolve => setTimeout(resolve, 450));
    expect(estado.marcarLido).not.toHaveBeenCalled();

    hook.rerender({ visivel: true });
    act(() => estado.ouvinte?.onEvento(payload('m-2')));
    await waitFor(() => expect(estado.marcarLido).toHaveBeenCalledWith('c-1', 'eu'));
  });
});
