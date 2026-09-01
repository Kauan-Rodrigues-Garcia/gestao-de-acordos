import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockRpc } = vi.hoisted(() => ({ mockRpc: vi.fn() }));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
    storage: { from: vi.fn() },
  },
}));

vi.mock('@/lib/supabaseSemTipo', () => ({
  rpcSemTipo: (...args: unknown[]) => mockRpc(...args),
}));

import {
  listarDestinosDisparo, PAGINA_DESTINOS_DISPARO, esbocoDeConversa, abrirConversa,
} from './chat.service';

describe('listarDestinosDisparo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('carrega 50, normaliza as relações e sinaliza a próxima página', async () => {
    const linhas = Array.from({ length: PAGINA_DESTINOS_DISPARO + 1 }, (_, i) => ({
      perfil_id: `p-${i + 1}`,
      conversa_id: `c-${i + 1}`,
      nome: i === 0 ? '  Ana  ' : `Pessoa ${i + 1}`,
      usuario: i === 0 ? 'ana' : null,
      foto_url: null,
      empresa_slug: 'bookplay',
    }));
    mockRpc.mockResolvedValue({ data: linhas, error: null });

    const resultado = await listarDestinosDisparo('d-1', 50);

    expect(mockRpc).toHaveBeenCalledWith('fn_chat_destinos_disparo', {
      p_disparo: 'd-1',
      p_inicio: 50,
      p_limite: 51,
    });
    expect(resultado.temMais).toBe(true);
    expect(resultado.destinos).toHaveLength(50);
    expect(resultado.destinos[0]).toMatchObject({
      nome: 'Ana', usuario: 'ana', empresa_slug: 'bookplay', conversa_id: 'c-1',
    });
  });

  it('mantém a linha se um perfil histórico não tiver mais nome disponível', async () => {
    mockRpc.mockResolvedValue({
      data: [{
        perfil_id: 'p-1', conversa_id: 'c-1', nome: null,
        usuario: null, foto_url: null, empresa_slug: null,
      }],
      error: null,
    });

    const resultado = await listarDestinosDisparo('d-1');

    expect(resultado.destinos).toEqual([{
      perfil_id: 'p-1',
      conversa_id: 'c-1',
      nome: 'Pessoa indisponível',
      usuario: null,
      foto_url: null,
      empresa_slug: null,
    }]);
  });

  it('transforma erro de leitura em mensagem segura para a interface', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'permission denied' } });

    const resultado = await listarDestinosDisparo('d-1');

    expect(resultado).toEqual({
      destinos: [], temMais: false, erro: 'Não foi possível carregar os destinatários.',
    });
  });
});


/*
 * ── A conversa nova ───────────────────────────────────────────────────────
 *
 * Conversa recém-aberta não está em `fn_chat_minhas_conversas` (a lista exige
 * `ultima_mensagem_em`, e ela ainda não tem mensagem). Até 03/09/2026 a tela
 * dependia só de `buscarConversa` para essa primeira pintura, e qualquer
 * tropeço ali deixava a janela sem conversa nenhuma — o «não abre».
 */
describe('esbocoDeConversa', () => {
  const contato = {
    perfil_id: 'p-1',
    nome: 'Ana Operadora',
    usuario: 'ana_op',
    foto_url: 'https://exemplo/ana.png',
    empresa_slug: 'bookplay',
  };

  it('monta a conversa com o que a tela já sabe da pessoa', () => {
    const c = esbocoDeConversa('conv-1', contato);
    expect(c.id).toBe('conv-1');
    expect(c.outro_id).toBe('p-1');
    expect(c.outro_nome).toBe('Ana Operadora');
    expect(c.outro_foto).toBe('https://exemplo/ana.png');
    expect(c.outro_empresa).toBe('bookplay');
    expect(c.tipo).toBe('direta');
  });

  it('nasce sem mensagem e sem não lidas — é uma conversa que ainda não aconteceu', () => {
    const c = esbocoDeConversa('conv-1', contato);
    expect(c.ultima_mensagem_em).toBeNull();
    expect(c.ultimo_texto).toBeNull();
    expect(c.nao_lidas).toBe(0);
    expect(c.em_historico).toBe(false);
  });

  it('pessoa sem nome não vira conversa sem cabeçalho', () => {
    const c = esbocoDeConversa('conv-1', { perfil_id: 'p-2', nome: '' });
    expect(c.outro_nome).toBe('Sem nome');
    expect(c.outro_usuario).toBeNull();
    expect(c.outro_foto).toBeNull();
  });
});

describe('abrirConversa', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('devolve o id da conversa', async () => {
    mockRpc.mockResolvedValueOnce({ data: 'conv-9', error: null });
    await expect(abrirConversa('p-1')).resolves.toEqual({ id: 'conv-9', erro: null });
  });

  it('a recusa vira motivo legível — e vai para o console com nome', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'fora_do_alcance' } });
    const r = await abrirConversa('p-1');
    expect(r.id).toBeNull();
    expect(r.erro).toBeTruthy();
    expect(console.warn).toHaveBeenCalled();
  });
});
