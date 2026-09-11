/**
 * Excluir um aparelho — escrito em 11/09/2026, quando a operação descobriu que
 * um celular cadastrado não saía mais da lista, e reescrito no mesmo dia com a
 * Lixeira de Números.
 *
 * A exclusão deixou de ser dois `delete` (números, depois aparelho) e virou uma
 * RPC só: o banco guarda a cópia de tudo na lixeira e apaga na mesma transação.
 * O que estes testes travam é que a tela chama UMA vez, com o id certo, que a
 * recusa do banco chega como frase — nunca como «excluído» —, e que um banco
 * ainda sem a migration cai no caminho antigo em vez de quebrar.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({
  rpc: vi.fn(async (_nome: string, _args: Record<string, unknown>) => (
    { error: null as unknown }
  )),
  chamadas: [] as string[],
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: mock.rpc,
    from: (tabela: string) => ({
      delete: () => ({
        eq: (coluna: string, valor: string) => {
          mock.chamadas.push(`${tabela}.${coluna}=${valor}`);
          if (tabela === 'numeros_whatsapp') return Promise.resolve({ error: null });
          return { select: () => Promise.resolve({ data: [{ id: valor }], error: null }) };
        },
      }),
    }),
  },
}));

import {
  excluirCelular, excluirNumero, restaurarDaLixeira,
} from '../numeros.service';
import { podeExcluirCelular, type EstadoNumero } from '../numerosRegras';

const noNucleo: EstadoNumero = { situacao: 'ativo', posse: 'nucleo', operadorId: null };

/** O que o PostgREST responde quando a função não existe no banco. */
const SEM_A_FUNCAO = {
  error: { code: 'PGRST202', message: 'Could not find the function public.fn_numeros_excluir' },
};

describe('podeExcluirCelular', () => {
  it('aparelho vazio sai sempre', () => {
    expect(podeExcluirCelular([])).toBe(true);
  });

  it('sai com os números quando todos ainda estão no Núcleo e sem dono', () => {
    expect(podeExcluirCelular([
      noNucleo,
      { ...noNucleo, situacao: 'em_aquecimento' },
      { ...noNucleo, situacao: 'banido', tratamento: 'pendente' },
    ])).toBe(true);
  });

  it('para o Núcleo, um número com um setor segura o aparelho inteiro', () => {
    expect(podeExcluirCelular([noNucleo, { ...noNucleo, posse: 'setor' }])).toBe(false);
    expect(podeExcluirCelular([
      { ...noNucleo, posse: 'setor', operadorId: 'op-1' },
    ])).toBe(false);
  });

  it('o super_admin exclui o aparelho mesmo com número na mão de alguém', () => {
    expect(podeExcluirCelular(
      [noNucleo, { ...noNucleo, posse: 'setor', operadorId: 'op-1' }],
      { superAdmin: true },
    )).toBe(true);
  });
});

describe('excluir vai para a lixeira, numa chamada só', () => {
  beforeEach(() => {
    mock.rpc.mockClear();
    mock.chamadas = [];
  });

  it('o aparelho sai por fn_numeros_excluir_celular, com os números junto', async () => {
    expect(await excluirCelular('c1')).toEqual({ ok: true });
    expect(mock.rpc).toHaveBeenCalledTimes(1);
    expect(mock.rpc).toHaveBeenCalledWith('fn_numeros_excluir_celular', { p_celular_id: 'c1' });
    expect(mock.chamadas).toEqual([]);
  });

  it('o número sai por fn_numeros_excluir', async () => {
    expect(await excluirNumero('n1')).toEqual({ ok: true });
    expect(mock.rpc).toHaveBeenCalledWith('fn_numeros_excluir', { p_numero_id: 'n1' });
    expect(mock.chamadas).toEqual([]);
  });

  it('a recusa do banco chega como a frase dele, e não como «excluído»', async () => {
    mock.rpc.mockResolvedValueOnce({
      error: {
        code: '22023',
        message: 'Não dá para excluir: 2 número(s) deste celular estão com setores. Relance ao Núcleo antes.',
      },
    });
    const r = await excluirCelular('c1');
    expect(r.ok).toBe(false);
    expect(r.erro).toContain('Relance ao Núcleo');
    // Recusa não é «função ausente»: o caminho antigo não é tentado.
    expect(mock.chamadas).toEqual([]);
  });

  it('restaurar num aparelho cheio vira a frase do limite', async () => {
    mock.rpc.mockResolvedValueOnce({
      error: { code: '23514', message: 'O celular "Celular 05" ja tem 6 numeros, que e o limite.' },
    });
    const r = await restaurarDaLixeira('l1');
    expect(r.ok).toBe(false);
    expect(r.erro).toBe('Este celular já tem 6 números, que é o limite.');
  });
});

/*
 * O front pode chegar à produção antes de a migration 20260911150000 ser
 * aplicada no SQL Editor. Nesse intervalo, excluir não pode quebrar.
 */
describe('banco ainda sem a Lixeira', () => {
  beforeEach(() => {
    mock.rpc.mockClear();
    mock.chamadas = [];
  });

  it('o número cai no delete antigo', async () => {
    mock.rpc.mockResolvedValueOnce(SEM_A_FUNCAO);
    expect(await excluirNumero('n1')).toEqual({ ok: true });
    expect(mock.chamadas).toEqual(['numeros_whatsapp.id=n1']);
  });

  it('o aparelho sai pelo caminho antigo: números primeiro, depois ele', async () => {
    mock.rpc.mockResolvedValueOnce(SEM_A_FUNCAO);
    expect(await excluirCelular('c1')).toEqual({ ok: true });
    expect(mock.chamadas).toEqual([
      'numeros_whatsapp.celular_id=c1',
      'numeros_celulares.id=c1',
    ]);
  });
});
