/**
 * desligamento.service.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Depois do bug reportado em 2026-07-28, tudo que toca acordo alheio passa por
 * RPC SECURITY DEFINER. O motivo está no coração destes testes:
 *
 *   • `perfis_select` deixa o operador ler só a PRÓPRIA linha, então descobrir
 *     a situação de outro operador por SELECT voltava vazio — o desvio de
 *     desligado nunca disparava.
 *   • `acordos_select` (fail-closed, 20260723f) esconde o acordo alheio, então
 *     o fluxo do líder morria em "Acordo anterior não encontrado" mesmo com a
 *     senha certa, porque as queries saíam com a sessão do OPERADOR.
 *
 * Os testes travam as duas coisas: consulta por RPC (não por tabela) e repasse
 * do TOKEN do líder (não do id — id qualquer um adivinha).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const notificarMock = vi.fn();

vi.mock('@/services/notificacoes.service', () => ({
  criarNotificacao: (...a: unknown[]) => notificarMock(...a),
}));
vi.mock('@/services/nr_registros.service', () => ({
  transferirNr: vi.fn(async () => ({ ok: true })),
}));

// Só o .rpc() importa. `from` explode de propósito: se algum caminho voltar a
// tocar a tabela direto, o teste acusa em vez de passar silenciosamente.
const rpcMock  = vi.fn();
const fromMock = vi.fn(() => { throw new Error('não deve tocar tabela direto'); });

vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc:  (...a: unknown[]) => rpcMock(...a),
    from: (...a: unknown[]) => fromMock(...a),
  },
}));

import {
  situacaoDoOperador, operadorEstaDesligado, transferirAcordoDeDesligado,
  transferirAcordoNoServidor, mensagemErroTransferencia, AUTOR_AUTOMATICO,
} from './desligamento.service';

const fetchMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  notificarMock.mockResolvedValue(undefined);
  vi.stubGlobal('fetch', fetchMock);
});

describe('situacaoDoOperador', () => {
  it('consulta por RPC, nunca lendo a tabela perfis', async () => {
    rpcMock.mockResolvedValue({ data: 'desligado', error: null });

    await expect(situacaoDoOperador('op-1')).resolves.toBe('desligado');
    expect(rpcMock).toHaveBeenCalledWith('fn_situacao_operador', { p_operador_id: 'op-1' });
    expect(fromMock).not.toHaveBeenCalled();
    await expect(operadorEstaDesligado('op-1')).resolves.toBe(true);
  });

  // Erro de leitura NÃO pode abrir caminho pra transferir acordo alheio.
  it('devolve ativo quando a RPC falha (fail-closed)', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'timeout' } });
    await expect(situacaoDoOperador('op-1')).resolves.toBe('ativo');
    await expect(operadorEstaDesligado('op-1')).resolves.toBe(false);
  });

  it('devolve ativo quando a RPC não acha o operador', async () => {
    rpcMock.mockResolvedValue({ data: null, error: null });
    await expect(situacaoDoOperador('op-1')).resolves.toBe('ativo');
  });

  it('devolve ativo para id vazio, sem consultar', async () => {
    await expect(situacaoDoOperador('')).resolves.toBe('ativo');
    expect(rpcMock).not.toHaveBeenCalled();
  });
});

describe('transferirAcordoNoServidor', () => {
  it('sem token usa a sessão atual', async () => {
    rpcMock.mockResolvedValue({ data: { ok: true, base: 'dono_desligado' }, error: null });

    const r = await transferirAcordoNoServidor({ acordoId: 'ac-1', novoOperadorId: 'op-novo' });

    expect(r.ok).toBe(true);
    expect(rpcMock).toHaveBeenCalledWith('fn_transferir_acordo_nr', {
      p_acordo_id: 'ac-1', p_novo_operador_id: 'op-novo', p_motivo: 'transferencia_nr',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // O ponto do bug 2: sem mandar o token, a RPC rodaria como o operador e a
  // autorização de líder não valeria.
  it('com token do líder chama a RPC com aquele Bearer', async () => {
    fetchMock.mockResolvedValue({
      ok: true, status: 200, json: async () => ({ ok: true, base: 'lider', valor: 100 }),
    });

    const r = await transferirAcordoNoServidor({
      acordoId: 'ac-1', novoOperadorId: 'op-novo', token: 'token-do-lider',
    });

    expect(r.ok).toBe(true);
    expect(r.base).toBe('lider');
    expect(rpcMock).not.toHaveBeenCalled();

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/rest/v1/rpc/fn_transferir_acordo_nr');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer token-do-lider');
  });

  it('traduz o código de erro da RPC', async () => {
    rpcMock.mockResolvedValue({ data: { ok: false, erro: 'nao_autorizado' }, error: null });
    const r = await transferirAcordoNoServidor({ acordoId: 'ac-1' });
    expect(r.ok).toBe(false);
    expect(mensagemErroTransferencia(r.erro)).toBe('Sem autorização para assumir este acordo.');
  });

  it('não engole erro HTTP do fetch', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 403, json: async () => ({}) });
    const r = await transferirAcordoNoServidor({ acordoId: 'ac-1', token: 't' });
    expect(r.ok).toBe(false);
    expect(r.erro).toContain('403');
  });
});

describe('transferirAcordoDeDesligado', () => {
  const params = {
    acordoAnteriorId: 'ac-1',
    empresaId:        'emp-1',
    operadorAntId:    'op-velho',
    operadorAntNome:  'Fulano',
    novoOperadorId:   'op-novo',
    novoOperadorNome: 'Beltrano',
    labelNr:          'NR',
    valorNr:          '12345',
  };

  it('delega pra RPC e notifica o operador anterior', async () => {
    rpcMock.mockResolvedValue({
      data: { ok: true, base: 'dono_desligado', nome_cliente: 'Cliente X', valor: 250 },
      error: null,
    });

    const r = await transferirAcordoDeDesligado(params);

    expect(r.ok).toBe(true);
    expect(r.nomeClienteAnterior).toBe('Cliente X');
    expect(fromMock).not.toHaveBeenCalled();

    expect(notificarMock).toHaveBeenCalledTimes(1);
    const aviso = notificarMock.mock.calls[0][0] as { usuario_id: string; mensagem: string };
    expect(aviso.usuario_id).toBe('op-velho');
    expect(aviso.mensagem).toContain('Beltrano');
  });

  it('devolve mensagem amigável quando a RPC nega', async () => {
    rpcMock.mockResolvedValue({ data: { ok: false, erro: 'acordo_inexistente' }, error: null });
    const r = await transferirAcordoDeDesligado(params);
    expect(r.ok).toBe(false);
    expect(r.erro).toContain('não existe mais');
    expect(notificarMock).not.toHaveBeenCalled();
  });

  it('não derruba a operação se a notificação falhar', async () => {
    rpcMock.mockResolvedValue({ data: { ok: true, nome_cliente: 'C' }, error: null });
    notificarMock.mockRejectedValue(new Error('sem rede'));
    // Aqui o acordo antigo já foi excluído: falhar faria o chamador desistir de
    // gravar o novo, e o registro sumiria dos dois lados.
    await expect(transferirAcordoDeDesligado(params)).resolves.toMatchObject({ ok: true });
  });
});

describe('AUTOR_AUTOMATICO', () => {
  it('casa com o texto que a RPC grava na lixeira', () => {
    expect(AUTOR_AUTOMATICO).toBe('Sistema — operador desligado');
  });
});
