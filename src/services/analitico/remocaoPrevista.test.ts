/**
 * A trava de arquivo curto.
 *
 * O que se trava aqui é a CHAVE e o CORTE.
 *
 * A chave tem de ser idêntica à que o importador usa para decidir o que
 * sobrevive (`chaveGrupoAnalitico`, menos o mês). Se divergir, o aviso mente —
 * e mente para menos, dizendo que nada sai quando sai, que é o pior lado.
 *
 * O corte decide quando falar. Falar demais treina a pessoa a fechar o aviso sem
 * ler, e aí no dia do estrago ela fecha também.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({
  porRpc: {} as Record<string, { data: unknown; error: { message: string } | null }>,
  args: {} as Record<string, unknown>,
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: (nome: string, args: unknown) => {
      mock.args[nome] = args;
      const r = mock.porRpc[nome] ?? { data: null, error: null };
      return { then: (ok: (v: unknown) => unknown) => ok(r) };
    },
  },
}));

import {
  chaveDaLinha,
  preverRemocao,
  remocaoPreocupa,
  CORTE_LINHAS,
  CORTE_VALOR,
} from './remocaoPrevista';

beforeEach(() => { mock.porRpc = {}; mock.args = {}; });

describe('chaveDaLinha', () => {
  /*
   * `chaveGrupoAnalitico` é `operador::codigo::mes`. Aqui o mês já está no
   * recorte da consulta, então a chave para. Mudar o separador ou a ordem em um
   * lado sem mudar no outro quebra o aviso em silêncio.
   */
  it('é operador::codigo, na ordem, com o mesmo separador do importador', () => {
    expect(chaveDaLinha('GABRIEL_OLIVEIRA', '12984182')).toBe('GABRIEL_OLIVEIRA::12984182');
  });

  it('não normaliza nada — a comparação no banco é literal', () => {
    expect(chaveDaLinha('juliana_itala', '007')).toBe('juliana_itala::007');
  });
});

describe('preverRemocao', () => {
  it('soma as linhas e o valor dos dias que perdem algo', async () => {
    mock.porRpc = {
      fn_analitico_remocao_prevista: {
        data: [
          { dia: '2026-09-12', linhas: '146', valor: '39003.15' },
          { dia: '2026-09-13', linhas: '16',  valor: '3299.30' },
          { dia: '2026-09-14', linhas: '1',   valor: '249.06' },
        ],
        error: null,
      },
    };

    const r = await preverRemocao('emp-1', 'setor-1', '2026-09', ['A::1']);

    expect(r!.linhas).toBe(163);
    expect(r!.valor).toBeCloseTo(42551.51, 2);
    expect(r!.porDia).toHaveLength(3);
    // `numeric` vem como string do PostgREST; sem coerção a soma concatena.
    expect(typeof r!.porDia[0].valor).toBe('number');
  });

  it('sem setor não prevê nada — a sincronização mensal nem roda', async () => {
    await expect(preverRemocao('emp-1', null, '2026-09', ['A::1'])).resolves.toBeNull();
    expect(mock.args.fn_analitico_remocao_prevista).toBeUndefined();
  });

  it('mês fora do formato não vai ao banco', async () => {
    await expect(preverRemocao('emp-1', 'setor-1', 'setembro', ['A::1'])).resolves.toBeNull();
    expect(mock.args.fn_analitico_remocao_prevista).toBeUndefined();
  });

  it('manda a data como primeiro dia do mês e tira chave repetida', async () => {
    mock.porRpc = { fn_analitico_remocao_prevista: { data: [], error: null } };

    await preverRemocao('emp-1', 'setor-1', '2026-09', ['A::1', 'A::1', 'B::2']);

    expect(mock.args.fn_analitico_remocao_prevista).toMatchObject({ p_mes: '2026-09-01' });
    const { p_chaves } = mock.args.fn_analitico_remocao_prevista as { p_chaves: string[] };
    expect(p_chaves.sort()).toEqual(['A::1', 'B::2']);
  });

  it('nada a remover devolve zero, não null — «não sai nada» é resposta', async () => {
    mock.porRpc = { fn_analitico_remocao_prevista: { data: [], error: null } };
    const r = await preverRemocao('emp-1', 'setor-1', '2026-09', ['A::1']);
    expect(r).toEqual({ linhas: 0, valor: 0, porDia: [] });
  });

  it('erro do banco vira exceção com a mensagem do banco', async () => {
    mock.porRpc = {
      fn_analitico_remocao_prevista: { data: null, error: { message: 'Sem acesso a esta empresa.' } },
    };
    await expect(preverRemocao('emp-1', 'setor-1', '2026-09', ['A::1']))
      .rejects.toThrow('Sem acesso a esta empresa.');
  });
});

describe('remocaoPreocupa', () => {
  const r = (linhas: number, valor: number) => ({ linhas, valor, porDia: [] });

  it('cala quando não há remoção', () => {
    expect(remocaoPreocupa(null)).toBe(false);
    expect(remocaoPreocupa(r(0, 0))).toBe(false);
  });

  /*
   * Remoção legítima costuma ser de uma ou duas linhas — um acordo cancelado no
   * ERP. Avisar nesse caso seria ruído diário.
   */
  it('cala na remoção pequena, que é a rotina', () => {
    expect(remocaoPreocupa(r(2, 300))).toBe(false);
    expect(remocaoPreocupa(r(CORTE_LINHAS - 1, CORTE_VALOR - 1))).toBe(false);
  });

  it('fala por quantidade OU por valor — basta um', () => {
    // Muitas linhas pequenas: uma faxina inteira somando pouco.
    expect(remocaoPreocupa(r(CORTE_LINHAS, 10))).toBe(true);
    // Poucas linhas caras: o caso que um corte só por quantidade deixaria passar.
    expect(remocaoPreocupa(r(1, CORTE_VALOR))).toBe(true);
  });

  it('fala no caso que motivou a trava', () => {
    // 13/09/2026: um export antigo apagou 413 linhas e R$ 175.768,38.
    expect(remocaoPreocupa(r(413, 175768.38))).toBe(true);
  });
});
