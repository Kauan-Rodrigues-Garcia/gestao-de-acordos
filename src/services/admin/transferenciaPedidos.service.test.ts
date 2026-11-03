/**
 * aprovarItens — aprovar parte de um pedido, uma pessoa de cada vez.
 *
 * Cenário: 3 pessoas aprovadas de um pedido. A primeira transfere; a segunda
 * está sendo transferida por outro super admin (reserva recusada); a terceira
 * falha na transferência e volta a pendente. Cada uma tem o seu resultado.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ItemPedido, PedidoTransferencia } from '@/lib/transferenciaPedidos';

const { mockRpc, mockExecutar } = vi.hoisted(() => ({ mockRpc: vi.fn(), mockExecutar: vi.fn() }));

vi.mock('@/lib/supabaseSemTipo', () => ({ rpcSemTipo: mockRpc }));
vi.mock('./transferenciaUsuario.service', () => ({ executarTransferencia: mockExecutar }));

import { aprovarItens, podeLevarAcordos } from './transferenciaPedidos.service';

const PLAY2 = { id: 's-play2', nome: 'Play 2', empresa_id: 'bp', cidade: 'Birigui', regra: 'nosso_produto' };
const PLAY3 = { id: 's-play3', nome: 'Play 3', empresa_id: 'bp', cidade: 'Birigui', regra: 'nosso_produto' };
const PLAY3_COFEN = { ...PLAY3, regra: 'cofen' };

const item = (id: string, nome: string): ItemPedido => ({
  id, perfil_id: `p-${id}`, perfil_nome: nome, perfil_cargo: 'operador', status: 'pendente',
  reservado_em: null, decidido_por_nome: null, decidido_em: null, motivo_recusa: null,
  erro: null, levou_acordos: null, atual: null,
});

const PEDIDO: PedidoTransferencia = {
  id: 'ped-1', empresa_id: 'bp', solicitante_id: 'lider', solicitante_nome: 'João', solicitante_cargo: 'lider',
  solicitante_setor: 'Play 2', solicitante_foto: null, direcao: 'tirar', origem: PLAY2, destino: PLAY3,
  levar_acordos: true, motivo: null, status: 'pendente', criado_em: '2026-11-03T12:00:00Z', concluido_em: null,
  itens: [item('a', 'Ana'), item('b', 'Bia'), item('c', 'Caio'), item('d', 'Duda'), item('e', 'Edu')],
};

const reserva = (id: string) => ({
  ok: true, perfil_id: `p-${id}`, nome: id, usuario: id,
  origem_empresa_id: 'bp', origem_setor_id: 's-play2', origem_equipe_id: 'eq-1',
  destino_empresa_id: 'bp', destino_setor_id: 's-play3',
});

beforeEach(() => {
  mockRpc.mockReset();
  mockExecutar.mockReset();
  mockRpc.mockImplementation(async (nome: string, args: { p_item?: string }) => {
    if (nome === 'fn_transferencia_item_reservar') {
      if (args.p_item === 'b') return { data: { ok: false, erro: 'em_andamento' }, error: null };
      return { data: reserva(args.p_item!), error: null };
    }
    return { data: { ok: true }, error: null };
  });
  mockExecutar.mockImplementation(async ({ alvo }: { alvo: { perfilId: string } }) => (
    alvo.perfilId === 'p-c'
      ? { status: 'falha', mensagem: 'Sem permissão para transferir este usuário.' }
      : {
          status: 'ok', transferenciaId: 'transf-a', acordosApagados: 0, acordosMovidos: 4, clonesRemovidos: 0,
          relatorio: null, avisoRegistro: null, liderancasRemovidas: ['Equipe Manhã'],
        }
  ));
});

describe('aprovarItens', () => {
  it('cada pessoa tem o próprio resultado, e a falha de uma não leva as outras', async () => {
    const r = await aprovarItens({ pedido: PEDIDO, itemIds: ['a', 'b', 'c'], levarAcordos: true, executadoPorId: 'super-1' });

    expect(r.map(x => [x.itemId, x.ok])).toEqual([['a', true], ['b', false], ['c', false]]);
    expect(r[1].mensagem).toMatch(/Outro super admin/);
    expect(r[2].mensagem).toMatch(/Sem permissão/);
    expect(r[0].acordosMovidos).toBe(4);
    expect(r[0].aviso).toMatch(/Deixou de liderar: Equipe Manhã/);

    // A reservada por outro super admin nem chega a transferir.
    expect(mockExecutar).toHaveBeenCalledTimes(2);
    const nomes = mockRpc.mock.calls.map(c => [c[0], (c[1] as { p_item?: string }).p_item]);
    expect(nomes).toContainEqual(['fn_transferencia_item_concluir', 'a']);
    expect(nomes).toContainEqual(['fn_transferencia_item_falhou', 'c']);
    expect(nomes).not.toContainEqual(['fn_transferencia_item_concluir', 'c']);
  });

  it('a transferência recebe o cadastro de HOJE, vindo da reserva', async () => {
    await aprovarItens({ pedido: PEDIDO, itemIds: ['a'], levarAcordos: true, executadoPorId: 'super-1' });
    const chamada = mockExecutar.mock.calls[0][0];
    expect(chamada.alvo).toMatchObject({ perfilId: 'p-a', origemSetorId: 's-play2', origemEquipeId: 'eq-1', destinoSetorId: 's-play3' });
    expect(chamada.levarAcordos).toBe(true);
    expect(chamada.executadoPorId).toBe('super-1');
  });

  it('regra diferente nunca leva as tabulações, mesmo pedido', async () => {
    await aprovarItens({ pedido: { ...PEDIDO, destino: PLAY3_COFEN }, itemIds: ['a'], levarAcordos: true, executadoPorId: 'super-1' });
    expect(mockExecutar.mock.calls[0][0].levarAcordos).toBe(false);
  });
});

describe('podeLevarAcordos', () => {
  it('só na mesma empresa e na mesma regra', () => {
    expect(podeLevarAcordos({ origem: PLAY2, destino: PLAY3 })).toBe(true);
    expect(podeLevarAcordos({ origem: PLAY2, destino: PLAY3_COFEN })).toBe(false);
    expect(podeLevarAcordos({ origem: PLAY2, destino: { ...PLAY3, empresa_id: 'pp' } })).toBe(false);
    expect(podeLevarAcordos({ origem: null, destino: PLAY3 })).toBe(false);
  });
});
