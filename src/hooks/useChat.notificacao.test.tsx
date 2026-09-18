import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Ouvinte = { onSinal: (payload: Record<string, unknown>, sinal: string) => void };

const estado = vi.hoisted(() => ({
  assinatura: null as null | { topico: string; escutas: unknown[] },
  ouvinte: null as null | Ouvinte,
  marcarLido: vi.fn(),
  marcarEntregue: vi.fn(),
  /** A resposta de `souParte`: é ela que separa participar de monitorar. */
  souParte: vi.fn(),
  /** O que `buscarMensagem` devolve — o banco, lido pela RLS. */
  mensagens: new Map<string, Record<string, unknown>>(),
  buscarMensagem: vi.fn(),
}));

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ perfil: { id: 'eu' } }) }));
vi.mock('@/hooks/useEmpresa', () => ({ useEmpresa: () => ({ empresa: { id: 'emp-1' } }) }));
vi.mock('@/lib/realtime', () => ({
  assinarTabela: (config: { topico: string; escutas: unknown[] }, ouvinte: Ouvinte) => {
    estado.assinatura = config;
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
  buscarMensagem: (...args: unknown[]) => estado.buscarMensagem(...args),
}));

import { useChat } from './useChat';

function mensagem(id: string, extra: Record<string, unknown> = {}) {
  return {
    id, conversa_id: 'c-1', autor_id: 'ana', texto: 'Oi', anexos: [],
    criado_em: '2026-08-26T16:00:00Z', disparo_id: null, expurgado_em: null,
    curtida_em: null, curtida_por: null,
    ...extra,
  };
}

/** O banco grava a mensagem e manda o aviso — só com ids, como o gatilho. */
function avisar(msg: Record<string, unknown>, operacao: 'INSERT' | 'UPDATE' = 'INSERT', curtidaAntes: string | null = null) {
  estado.mensagens.set(String(msg.id), msg);
  estado.ouvinte?.onSinal({
    operacao,
    id:               msg.id,
    conversa_id:      msg.conversa_id,
    autor_id:         msg.autor_id,
    curtida_por:      msg.curtida_por ?? null,
    curtida_em:       msg.curtida_em ?? null,
    curtida_em_antes: curtidaAntes,
  }, 'mensagem');
}

describe('useChat e visibilidade real da conversa', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    estado.assinatura = null;
    estado.ouvinte = null;
    estado.mensagens.clear();
    estado.marcarLido.mockResolvedValue(undefined);
    estado.marcarEntregue.mockResolvedValue(undefined);
    estado.souParte.mockResolvedValue(true);
    estado.buscarMensagem.mockImplementation(async (id: string) => estado.mensagens.get(id) ?? null);
  });

  it('ouve o tópico pessoal por Broadcast, não a tabela', async () => {
    renderHook(() => useChat(true, true, vi.fn()));
    await waitFor(() => expect(estado.ouvinte).not.toBeNull());

    expect(estado.assinatura).toEqual({
      topico: 'chat:eu',
      escutas: [{ sinal: 'mensagem' }, { sinal: 'participante' }],
    });
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

    act(() => avisar(mensagem('m-1')));
    // A mensagem é lida pelo id e `souParte` é assíncrono: o aviso sai depois.
    await waitFor(() =>
      expect(recebida).toHaveBeenCalledWith(expect.objectContaining({ id: 'm-1', texto: 'Oi' })));
    expect(estado.buscarMensagem).toHaveBeenCalledWith('m-1');
    expect(estado.marcarEntregue).toHaveBeenCalledWith('c-1', 'eu');
    await new Promise(resolve => setTimeout(resolve, 450));
    expect(estado.marcarLido).not.toHaveBeenCalled();

    hook.rerender({ visivel: true });
    act(() => avisar(mensagem('m-2')));
    await waitFor(() => expect(estado.marcarLido).toHaveBeenCalledWith('c-1', 'eu'));
  });

  /*
   * O defeito relatado em 03/09/2026: a conta de super admin recebia aviso de
   * grupos do play 3 sem participar de nenhum. O aviso agora só vai para quem
   * participa, mas `souParte` continua sendo a definição de participar — e é
   * ela que decide se toca.
   */
  it('não avisa nem carimba entrega em conversa de que eu não participo', async () => {
    estado.souParte.mockResolvedValue(false);
    const recebida = vi.fn();
    renderHook(() => useChat(true, true, recebida));
    await waitFor(() => expect(estado.ouvinte).not.toBeNull());

    act(() => avisar(mensagem('m-monitorada')));
    await waitFor(() => expect(estado.souParte).toHaveBeenCalledWith('c-1'));

    expect(recebida).not.toHaveBeenCalled();
    expect(estado.marcarEntregue).not.toHaveBeenCalled();
  });

  it('mensagem que a RLS não devolve não vira aviso', async () => {
    const recebida = vi.fn();
    renderHook(() => useChat(true, true, recebida));
    await waitFor(() => expect(estado.ouvinte).not.toBeNull());

    estado.buscarMensagem.mockResolvedValueOnce(null);
    act(() => avisar(mensagem('m-sumiu')));
    await waitFor(() => expect(estado.buscarMensagem).toHaveBeenCalledWith('m-sumiu'));
    await Promise.resolve();

    expect(recebida).not.toHaveBeenCalled();
    expect(estado.souParte).not.toHaveBeenCalled();
  });

  it('minha própria mensagem, fora de conversa aberta, não é lida de novo', async () => {
    renderHook(() => useChat(true, true, vi.fn()));
    await waitFor(() => expect(estado.ouvinte).not.toBeNull());

    act(() => avisar(mensagem('m-minha', { autor_id: 'eu' })));
    await Promise.resolve();

    expect(estado.buscarMensagem).not.toHaveBeenCalled();
  });

  it('avisa o autor quando curtem a mensagem dele, uma vez por curtida', async () => {
    const curtiram = vi.fn();
    renderHook(() => useChat(true, true, vi.fn(), curtiram));
    await waitFor(() => expect(estado.ouvinte).not.toBeNull());

    const curtida = mensagem('m-9', {
      autor_id: 'eu', criado_em: '2026-09-03T16:00:00Z',
      curtida_em: '2026-09-03T17:00:00Z', curtida_por: 'ana',
    });

    act(() => avisar(curtida, 'UPDATE'));
    await waitFor(() => expect(curtiram).toHaveBeenCalledWith(expect.objectContaining({ id: 'm-9' })));

    // O mesmo evento repetido (reconexão) não vira um segundo aviso.
    act(() => avisar(curtida, 'UPDATE'));
    await waitFor(() => expect(estado.buscarMensagem).toHaveBeenCalledTimes(2));
    await Promise.resolve();
    expect(curtiram).toHaveBeenCalledTimes(1);
  });

  it('não avisa curtida na mensagem dos outros nem a minha própria curtida', async () => {
    const curtiram = vi.fn();
    renderHook(() => useChat(true, true, vi.fn(), curtiram));
    await waitFor(() => expect(estado.ouvinte).not.toBeNull());

    const base = { criado_em: '2026-09-03T16:00:00Z', curtida_em: '2026-09-03T17:00:00Z' };

    // Mensagem de outra pessoa: o aviso é do AUTOR.
    act(() => avisar(mensagem('m-10', { ...base, autor_id: 'ana', curtida_por: 'bia' }), 'UPDATE'));
    // Curtida minha na minha mensagem: eu estava olhando quando cliquei.
    act(() => avisar(mensagem('m-11', { ...base, autor_id: 'eu', curtida_por: 'eu' }), 'UPDATE'));
    // Descurtida: `curtida_por` volta a nulo e não há nada a anunciar.
    act(() => avisar(mensagem('m-12', { ...base, autor_id: 'eu', curtida_por: null }), 'UPDATE'));
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(curtiram).not.toHaveBeenCalled();
  });
});
