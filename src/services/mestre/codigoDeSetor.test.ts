/**
 * O código do setor, do lado do cliente.
 *
 * A lógica que vale testar aqui é a TRADUÇÃO das exceções: o banco recusa em
 * SQLSTATE e texto cru, e o que aparece na tela precisa dizer o próximo passo.
 * A recusa mais importante é o código já usado por outro setor — sem o nome do
 * dono na frase, a pessoa fica sem saber onde mexer.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({
  resposta: { data: null as unknown, error: null as { message: string } | null },
  ultimaChamada: null as { nome: string; args: Record<string, unknown> } | null,
}));

vi.mock('@/lib/supabaseSemTipo', () => ({
  rpcSemTipo: (nome: string, args: Record<string, unknown>) => {
    mock.ultimaChamada = { nome, args };
    return Promise.resolve(mock.resposta);
  },
  tabelaSemTipo: () => ({ select: () => ({ eq: () => ({ order: () => ({ limit: () => [] }) }) }) }),
}));
vi.mock('@/lib/supabase', () => ({ supabase: { rpc: () => Promise.resolve({ error: null }) } }));

import { definirCodigoDeSetor, buscarCodigosDeSetor } from './mestre.service';

describe('definirCodigoDeSetor', () => {
  beforeEach(() => {
    mock.resposta = { data: null, error: null };
    mock.ultimaChamada = null;
  });

  it('devolve a carteira que o código encontrou', async () => {
    mock.resposta = {
      data: [{ codigo_erp: '25', carteira: 'COB PLAY 1 - PAOLA', vinculou: true, desvinculou: null }],
      error: null,
    };

    const r = await definirCodigoDeSetor({ setorId: 'setor-1', codigo: '25' });

    expect(r).toEqual({
      codigo: '25', carteira: 'COB PLAY 1 - PAOLA', vinculou: true, desvinculou: null,
    });
    expect(mock.ultimaChamada?.nome).toBe('fn_setor_definir_codigo_erp');
    expect(mock.ultimaChamada?.args).toEqual({ p_setor_id: 'setor-1', p_codigo: '25' });
  });

  /*
   * Trocar o código faz DUAS coisas, e a tela precisa das duas para contar o
   * que houve. Sem `desvinculou`, a carteira antiga sairia do setor em
   * silêncio — e é o tipo de silêncio que só aparece semanas depois, num
   * total que não fecha.
   */
  it('trocar o código conta o que soltou e o que amarrou', async () => {
    mock.resposta = {
      data: [{
        codigo_erp: '28', carteira: 'COB PLAY 2 - EDERLANDIA',
        vinculou: true, desvinculou: 'COB PLAY 1 - PAOLA',
      }],
      error: null,
    };

    const r = await definirCodigoDeSetor({ setorId: 'setor-1', codigo: '28' });

    expect(r.carteira).toBe('COB PLAY 2 - EDERLANDIA');
    expect(r.desvinculou).toBe('COB PLAY 1 - PAOLA');
  });

  it('apagar o código manda null, não string vazia', async () => {
    // String vazia entraria no índice único do banco, e o SEGUNDO setor sem
    // código seria recusado sem motivo visível na tela.
    mock.resposta = {
      data: [{ codigo_erp: null, carteira: null, vinculou: false, desvinculou: 'COB PLAY 1 - PAOLA' }],
      error: null,
    };

    const r = await definirCodigoDeSetor({ setorId: 'setor-1', codigo: null });

    expect(mock.ultimaChamada?.args.p_codigo).toBeNull();
    expect(r.codigo).toBeNull();
    // Apagar o código SOLTA a carteira: desde que o vínculo manual saiu, não
    // soltar deixaria carteira presa a um setor sem nada justificando.
    expect(r.desvinculou).toBe('COB PLAY 1 - PAOLA');
  });

  /*
   * A recusa que mais importa: sem o nome do dono, a pessoa lê "código em uso"
   * e não tem onde mexer.
   */
  it('código de outro setor: a frase diz de quem é', async () => {
    mock.resposta = {
      data: null,
      error: { message: 'CODIGO_ERP_EM_USO: o codigo 25 ja e do setor "Play 1". Um codigo pertence a um setor so.' },
    };

    await expect(definirCodigoDeSetor({ setorId: 'setor-2', codigo: '25' }))
      .rejects.toThrow('O código 25 já é do setor "Play 1". Um código pertence a um setor só.');
  });

  it('quem não é super_admin recebe a frase, não o SQLSTATE', async () => {
    mock.resposta = {
      data: null,
      error: { message: 'CODIGO_ERP_SO_SUPER_ADMIN: o codigo do relatorio 59 so pode ser alterado pelo super_admin.' },
    };

    await expect(definirCodigoDeSetor({ setorId: 'setor-1', codigo: '25' }))
      .rejects.toThrow('Só o super_admin pode alterar o código do relatório 59.');
  });

  it('erro que não conhecemos passa inteiro, sem virar frase genérica', async () => {
    // Esconder o desconhecido atrás de "tente de novo" é o que faz um defeito
    // novo levar semanas para ser notado.
    mock.resposta = { data: null, error: { message: 'canceling statement due to statement timeout' } };

    await expect(definirCodigoDeSetor({ setorId: 'setor-1', codigo: '25' }))
      .rejects.toThrow('canceling statement due to statement timeout');
  });

  it('resposta vazia não vira exceção: devolve o estado neutro', async () => {
    mock.resposta = { data: [], error: null };

    const r = await definirCodigoDeSetor({ setorId: 'setor-1', codigo: '25' });

    expect(r).toEqual({ codigo: null, carteira: null, vinculou: false, desvinculou: null });
  });
});

describe('buscarCodigosDeSetor', () => {
  beforeEach(() => { mock.resposta = { data: null, error: null }; });

  it('sem linhas devolve lista vazia, não null', async () => {
    mock.resposta = { data: null, error: null };
    await expect(buscarCodigosDeSetor('emp-1')).resolves.toEqual([]);
  });

  it('erro do banco sobe para quem chamou', async () => {
    mock.resposta = { data: null, error: { message: 'permission denied' } };
    await expect(buscarCodigosDeSetor('emp-1')).rejects.toThrow('permission denied');
  });
});
