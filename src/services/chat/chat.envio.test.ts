import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ from: vi.fn(), assinar: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabase: {
  from: mock.from, storage: { from: () => ({ createSignedUrls: mock.assinar }) },
} }));
import { enviarMensagem, urlDoAnexo, urlDoAnexoEmCache } from './chat.service';

describe('confirmação idempotente no serviço do chat', () => {
  beforeEach(() => vi.clearAllMocks());
  it('persiste o UUID local e devolve o carimbo confirmado pelo banco', async () => {
    const confirmada = { id: 'uuid', criado_em: '2026-09-08T14:00:00Z' };
    const q = { insert: vi.fn().mockReturnThis(), select: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: confirmada, error: null }) };
    mock.from.mockReturnValue(q);
    const resultado = await enviarMensagem({ id: 'uuid', conversaId: 'c', empresaId: 'e', autorId: 'eu', texto: '  Olá  ' });
    expect(q.insert).toHaveBeenCalledWith(expect.objectContaining({ id: 'uuid', texto: 'Olá', conversa_id: 'c' }));
    expect(resultado.mensagem).toEqual(confirmada);
  });

  it('recupera confirmação perdida sem inserir outra mensagem ou atualizar a existente', async () => {
    const q = { insert: vi.fn().mockReturnThis(), select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValueOnce({ data: null, error: { code: '23505', message: 'duplicate key' } })
        .mockResolvedValueOnce({ data: { id: 'uuid', texto: 'Original' }, error: null }) };
    mock.from.mockReturnValue(q);
    const resultado = await enviarMensagem({ id: 'uuid', conversaId: 'c', empresaId: 'e', autorId: 'eu', texto: 'Original' });
    expect(resultado.erro).toBeNull();
    expect(resultado.mensagem?.id).toBe('uuid');
    expect(q.insert).toHaveBeenCalledTimes(1);
    expect(q.eq.mock.calls).toEqual([['id', 'uuid'], ['conversa_id', 'c'], ['autor_id', 'eu']]);
  });
});

describe('carregamento dos anexos', () => {
  afterEach(() => vi.useRealTimers());
  it('agrupa fotos em uma requisição, compartilha chamadas em curso e reutiliza URLs válidas', async () => {
    mock.assinar.mockResolvedValue({ data: [
      { path: 'foto-a', signedUrl: 'https://exemplo/a', error: null },
      { path: 'foto-b', signedUrl: 'https://exemplo/b', error: null },
    ], error: null });
    const urls = await Promise.all([urlDoAnexo('foto-a'), urlDoAnexo('foto-b'), urlDoAnexo('foto-a')]);
    expect(urls).toEqual(['https://exemplo/a', 'https://exemplo/b', 'https://exemplo/a']);
    expect(mock.assinar).toHaveBeenCalledTimes(1);
    expect(mock.assinar).toHaveBeenCalledWith(['foto-a', 'foto-b'], 3600);
    expect(urlDoAnexoEmCache('foto-a')).toBe('https://exemplo/a');
    await urlDoAnexo('foto-a');
    expect(mock.assinar).toHaveBeenCalledTimes(1);
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 3600_000);
    expect(urlDoAnexoEmCache('foto-a')).toBeNull();
  });

  it('falha libera o pedido para nova tentativa e prévia local dispensa rede', async () => {
    mock.assinar.mockClear();
    mock.assinar.mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ data: [{ path: 'foto-falha', signedUrl: 'https://exemplo/recuperada', error: null }], error: null });
    expect(await urlDoAnexo('foto-falha')).toBeNull();
    expect(await urlDoAnexo('foto-falha')).toBe('https://exemplo/recuperada');
    expect(await urlDoAnexo('blob:local')).toBe('blob:local');
    expect(mock.assinar).toHaveBeenCalledTimes(2);
  });
});
