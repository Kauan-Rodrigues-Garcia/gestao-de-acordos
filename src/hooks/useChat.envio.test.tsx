import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MensagemChat } from '@/services/chat/chat.service';

const mock = vi.hoisted(() => ({
  listarMensagens: vi.fn(), enviarMensagem: vi.fn(), subirAnexo: vi.fn(),
  evento: null as null | ((p: unknown) => void), perfil: 'eu',
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ perfil: { id: mock.perfil } }) }));
vi.mock('@/hooks/useEmpresa', () => ({ useEmpresa: () => ({ empresa: { id: 'empresa' } }) }));
vi.mock('@/lib/realtime', () => ({ assinarTabela: (_: unknown, ouvinte: { onEvento: (p: unknown) => void }) => {
  mock.evento = ouvinte.onEvento;
  return vi.fn();
} }));
vi.mock('@/services/chat/chat.service', () => ({
  listarConversas: async () => [], listarDisparos: async () => [],
  listarMensagens: (...args: unknown[]) => mock.listarMensagens(...args),
  enviarMensagem: (...args: unknown[]) => mock.enviarMensagem(...args),
  subirAnexo: (...args: unknown[]) => mock.subirAnexo(...args),
  buscarConversa: async () => null, marcarLido: async () => {}, marcarEntregue: async () => {},
  souParte: async () => true, abrirConversa: vi.fn(), esbocoDeConversa: vi.fn(),
}));
import { useChat } from './useChat';

function adiar<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>(r => { resolve = r; });
  return { promise, resolve };
}
function mensagem(id: string, conversa_id = 'a'): MensagemChat {
  return { id, conversa_id, autor_id: 'eu', texto: id, anexos: [], criado_em: '2026-09-08T12:00:00Z',
    disparo_id: null, expurgado_em: null, respondendo_id: null, curtida_em: null, curtida_por: null,
    sistema: null, sistema_dados: null };
}
async function abrir() {
  const hook = renderHook(() => useChat(true));
  act(() => hook.result.current.abrir('a'));
  await waitFor(() => expect(hook.result.current.carregandoMensagens).toBe(false));
  return hook;
}
describe('envio imediato e abertura de conversas', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock.perfil = 'eu';
    mock.listarMensagens.mockResolvedValue({ mensagens: [], temMais: false });
    mock.enviarMensagem.mockResolvedValue({ erro: null });
  });

  it.each(['api-primeiro', 'realtime-primeiro'])('mostra pendente antes da rede e reconcilia sem duplicar (%s)', async ordem => {
    const resposta = adiar<{ erro: null; mensagem: MensagemChat }>();
    mock.enviarMensagem.mockReturnValue(resposta.promise);
    const hook = await abrir();
    let envio!: Promise<string | null>;
    act(() => { envio = hook.result.current.enviar('Olá'); });
    expect(hook.result.current.mensagens).toHaveLength(1);
    expect(hook.result.current.mensagens[0]).toMatchObject({ texto: 'Olá', status_envio: 'pendente' });
    const confirmada = { ...hook.result.current.mensagens[0], status_envio: undefined, criado_em: '2026-09-08T15:00:00Z' };
    const evento = () => mock.evento?.({ table: 'chat_mensagens', eventType: 'INSERT', new: confirmada, old: {} });
    if (ordem === 'realtime-primeiro') act(evento);
    await act(async () => { resposta.resolve({ erro: null, mensagem: confirmada }); await envio; });
    if (ordem === 'api-primeiro') act(evento);
    expect(hook.result.current.mensagens).toHaveLength(1);
    expect(hook.result.current.mensagens[0].status_envio).toBeUndefined();
    expect(mock.enviarMensagem).toHaveBeenCalledWith(expect.objectContaining({ id: confirmada.id }));
  });

  it('mantém falha no balão e reutiliza o UUID no reenvio, mesmo depois de trocar de conversa', async () => {
    mock.enviarMensagem.mockResolvedValueOnce({ erro: 'Sem conexão' });
    const hook = await abrir();
    await act(async () => { await hook.result.current.enviar('Teste'); });
    const id = hook.result.current.mensagens[0].id;
    expect(hook.result.current.mensagens[0].status_envio).toBe('erro');
    act(() => hook.result.current.abrir('b'));
    await waitFor(() => expect(hook.result.current.carregandoMensagens).toBe(false));
    expect(hook.result.current.mensagens).toEqual([]);
    act(() => hook.result.current.abrir('a'));
    expect(hook.result.current.mensagens[0].id).toBe(id);
    await act(async () => { await hook.result.current.reenviar(id); });
    expect(hook.result.current.mensagens).toHaveLength(1);
    expect(hook.result.current.mensagens[0].status_envio).toBeUndefined();
    expect(mock.enviarMensagem.mock.calls.map(c => c[0].id)).toEqual([id, id]);
  });

  it('mostra foto local antes do upload e mantém a confirmação na conversa de origem', async () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:previa');
    const upload = adiar<{ erro: null; anexo: { url: string; nome: string; tipo: string; tamanho: number } }>();
    mock.subirAnexo.mockReturnValue(upload.promise);
    const hook = await abrir();
    let envio!: Promise<string | null>;
    act(() => { envio = hook.result.current.enviar('', [], null, [new File(['foto'], 'foto.png', { type: 'image/png' })]); });
    expect(hook.result.current.mensagens[0].anexos[0].url).toBe('blob:previa');
    expect(hook.result.current.mensagens[0].status_envio).toBe('pendente');
    expect(mock.enviarMensagem).not.toHaveBeenCalled();
    act(() => hook.result.current.abrir('b'));
    await act(async () => { upload.resolve({ erro: null, anexo: { url: 'a/foto', nome: 'foto.png', tipo: 'image/png', tamanho: 4 } }); await envio; });
    expect(hook.result.current.mensagens).toEqual([]);
    act(() => hook.result.current.abrir('a'));
    expect(hook.result.current.mensagens[0].anexos[0].url).toBe('a/foto');
    expect(hook.result.current.mensagens[0].status_envio).toBeUndefined();
  });

  it('descarta leitura fora de ordem e conserva mensagem realtime recebida durante a abertura', async () => {
    const a = adiar<{ mensagens: MensagemChat[]; temMais: boolean }>();
    const b = adiar<{ mensagens: MensagemChat[]; temMais: boolean }>();
    mock.listarMensagens.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);
    const hook = renderHook(() => useChat(true));
    act(() => hook.result.current.abrir('a'));
    act(() => hook.result.current.abrir('b'));
    act(() => mock.evento?.({ table: 'chat_mensagens', eventType: 'INSERT', new: mensagem('nova', 'b'), old: {} }));
    await act(async () => { b.resolve({ mensagens: [mensagem('antiga', 'b')], temMais: false }); await b.promise; });
    await act(async () => { a.resolve({ mensagens: [mensagem('errada')], temMais: true }); await a.promise; });
    expect(hook.result.current.conversaAberta).toBe('b');
    expect(hook.result.current.mensagens.map(m => m.id).sort()).toEqual(['antiga', 'nova']);
    expect(hook.result.current.temMais).toBe(false);
  });

  it('falha de recarga mantém o histórico disponível e permite tentar de novo', async () => {
    mock.listarMensagens.mockResolvedValueOnce({ mensagens: [mensagem('anterior')], temMais: false });
    const hook = await abrir();
    mock.listarMensagens.mockResolvedValueOnce({ mensagens: [], temMais: false, erro: 'Falha de rede' });
    act(() => hook.result.current.abrir('a'));
    await waitFor(() => expect(hook.result.current.erroMensagens).toBe('Falha de rede'));
    expect(hook.result.current.mensagens[0].id).toBe('anterior');
  });

  it('não reaproveita cache nem publica envio de uma sessão anterior', async () => {
    const resposta = adiar<{ erro: null }>();
    mock.enviarMensagem.mockReturnValue(resposta.promise);
    const hook = await abrir();
    let envio!: Promise<string | null>;
    act(() => { envio = hook.result.current.enviar('Privada'); });
    mock.perfil = 'outra-pessoa';
    hook.rerender();
    await act(async () => { resposta.resolve({ erro: null }); await envio; });
    expect(hook.result.current.mensagens).toEqual([]);
    expect(hook.result.current.conversaAberta).toBeNull();
  });
});
