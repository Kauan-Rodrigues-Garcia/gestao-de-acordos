/**
 * A comparação 59 × sistema e o detalhe «onde está cada centavo».
 *
 * ## O que se trava aqui
 *
 * **A coluna do meio.** `fn_mestre_comparar_setores` devolve `mestre_comparavel`
 * e mede `diferenca` contra ELA. A tela mostrava `mestre_total`, e a leitura
 * virava «126.699,77 no mestre, 0 no sistema, +99.571,88 de diferença» — que
 * parece conta errada e não é. Se o mapeamento voltar a perder essa coluna, a
 * tela volta a mentir em silêncio: `undefined` num `formatBRL` não estoura,
 * vira «R$ 0,00».
 *
 * **Os dois lados são numéricos.** O PostgREST entrega `numeric` como STRING.
 * Sem a coerção, `mestre_total - mestre_contribuido` concatena em vez de
 * subtrair, e ninguém percebe até alguém somar a coluna.
 *
 * ## O dublê é THENABLE, e não `Promise`
 *
 * `supabase.rpc()` devolve o construtor do PostgREST: tem `.then`, não tem
 * `.catch` nem `.finally`. Um dublê que devolve `Promise.resolve(...)` é MAIS
 * capaz que a coisa real — foi assim que o `Le(...).catch is not a function`
 * chegou em produção com a suíte verde. O dublê fica na camada de baixo
 * (`@/lib/supabase`) e imita o original: thenable pelado.
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

import { compararSetores, buscarDetalheDaDiferenca } from './mestre.service';

/*
 * Uma linha do jeito que o banco entrega: `numeric` em string, e a diferença
 * medida sobre o COMPARÁVEL. É o caso que apareceu na tela — carteira com
 * Integral recebido e nada de analítico ainda.
 */
const LINHA_CRUA = {
  cod_grupo_filtro: '107',
  rotulo: 'CARTEIRA X',
  setor_id: 'setor-1',
  setor_nome: 'Play 1',
  estado: 'vinculado',
  mestre_total: '126699.77',
  mestre_proprio: '99571.88',
  mestre_contribuido: '27127.89',
  mestre_colchao_fora: '0',
  mestre_emprestado_para: '0',
  mestre_emprestado_de: '0',
  mestre_comparavel: '99571.88',
  sistema_total: '0',
  sistema_linhas: '0',
  sistema_analitico: '0',
  sistema_ajustes: '0',
  diferenca: '99571.88',
};

const DETALHE_CRU = {
  setor_id: 'setor-1',
  setor_nome: 'Play 1',
  carteira: 'CARTEIRA X',
  mes: '2026-09',
  mestre_total: '126699.77',
  contrib_integral: '27127.89',
  comparavel: '99571.88',
  sistema_analitico: '0',
  sistema_ajustes: '0',
  sistema_total: '0',
  diferenca: '99571.88',
  nao_explicado: '0',
  nrs_truncado: '3',
  estrutura: [
    { chave: 'contrib_integral', rotulo: 'Integral recebido de outra carteira',
      valor: '27127.89', nota: 'Conta no 59 dos dois lados.' },
    { chave: 'colchao_fora', rotulo: 'Colchao fora da meta', valor: '0', nota: '...' },
  ],
  resumo_nrs: { so_59: '99571.88', so_sistema: '0', difere: '0', qtd: '12' },
  nrs: [
    { nr: '900123', mestre: '5000.5', sistema: '0', delta: '5000.5',
      situacao: 'outro_setor', cobradora: 'FULANO', carteira: 'CARTEIRA X',
      operador: null, onde: 'Play 2' },
    { nr: '900124', mestre: '0', sistema: '80.1', delta: '-80.1',
      situacao: 'so_no_sistema', cobradora: null, carteira: null,
      operador: 'BELTRANO', onde: null },
  ],
};

beforeEach(() => { mock.porRpc = {}; mock.args = {}; });

describe('compararSetores', () => {
  it('traz o comparável e os dois lados como número', async () => {
    mock.porRpc = { fn_mestre_comparar_setores: { data: [LINHA_CRUA], error: null } };

    const [l] = await compararSetores('emp-1', '2026-09');

    expect(l.mestre_total).toBeCloseTo(126699.77, 2);
    expect(l.mestre_contribuido).toBeCloseTo(27127.89, 2);
    // A coluna que a tela não mostrava.
    expect(l.mestre_comparavel).toBeCloseTo(99571.88, 2);
    expect(l.sistema_analitico).toBe(0);
    expect(l.sistema_ajustes).toBe(0);
    expect(typeof l.mestre_comparavel).toBe('number');
  });

  /*
   * A conta que a tela desenha na horizontal. Se qualquer um dos três campos
   * sumir do mapeamento ele vira `undefined`, a subtração vira `NaN`, e este
   * teste cai — que é exatamente o que não aconteceu da primeira vez.
   */
  it('Mestre − Integral = Comparável, e Comparável − Sistema = Diferença', async () => {
    mock.porRpc = { fn_mestre_comparar_setores: { data: [LINHA_CRUA], error: null } };

    const [l] = await compararSetores('emp-1', '2026-09');

    expect(l.mestre_total - l.mestre_contribuido).toBeCloseTo(l.mestre_comparavel, 2);
    expect(l.mestre_comparavel - l.sistema_total).toBeCloseTo(l.diferenca, 2);
  });

  it('erro do banco vira exceção com a mensagem do banco', async () => {
    mock.porRpc = {
      fn_mestre_comparar_setores: { data: null, error: { message: 'Somente super_admin.' } },
    };
    await expect(compararSetores('emp-1', '2026-09')).rejects.toThrow('Somente super_admin.');
  });
});

describe('buscarDetalheDaDiferenca', () => {
  it('desmonta o jsonb inteiro, com os números coeridos', async () => {
    mock.porRpc = { fn_mestre_diferenca_detalhe: { data: DETALHE_CRU, error: null } };

    const d = await buscarDetalheDaDiferenca('emp-1', '2026-09', 'setor-1');

    expect(d.setorNome).toBe('Play 1');
    expect(d.mestreTotal).toBeCloseTo(126699.77, 2);
    expect(d.contribIntegral).toBeCloseTo(27127.89, 2);
    expect(d.comparavel).toBeCloseTo(99571.88, 2);
    expect(d.diferenca).toBeCloseTo(99571.88, 2);
    expect(d.naoExplicado).toBe(0);
    expect(d.nrsTruncado).toBe(3);

    expect(d.estrutura).toHaveLength(2);
    expect(d.estrutura[0].chave).toBe('contrib_integral');
    expect(d.estrutura[0].valor).toBeCloseTo(27127.89, 2);

    expect(d.resumo.qtd).toBe(12);
    expect(d.resumo.so59).toBeCloseTo(99571.88, 2);
  });

  it('cada NR diz onde está e quem mexeu', async () => {
    mock.porRpc = { fn_mestre_diferenca_detalhe: { data: DETALHE_CRU, error: null } };

    const d = await buscarDetalheDaDiferenca('emp-1', '2026-09', 'setor-1');

    expect(d.nrs).toHaveLength(2);

    const emOutroSetor = d.nrs[0];
    expect(emOutroSetor.situacao).toBe('outro_setor');
    expect(emOutroSetor.onde).toBe('Play 2');
    expect(emOutroSetor.cobradora).toBe('FULANO');
    expect(emOutroSetor.delta).toBeCloseTo(5000.5, 2);

    // Negativo é o sistema tendo mais — o sinal precisa sobreviver à coerção.
    const soNoSistema = d.nrs[1];
    expect(soNoSistema.situacao).toBe('so_no_sistema');
    expect(soNoSistema.delta).toBeCloseTo(-80.1, 2);
    expect(soNoSistema.operador).toBe('BELTRANO');
    expect(soNoSistema.onde).toBeNull();
  });

  it('manda o limite e o setor para a RPC', async () => {
    mock.porRpc = { fn_mestre_diferenca_detalhe: { data: DETALHE_CRU, error: null } };

    await buscarDetalheDaDiferenca('emp-1', '2026-09', 'setor-1', 50);

    expect(mock.args.fn_mestre_diferenca_detalhe).toEqual({
      p_empresa_id: 'emp-1', p_mes: '2026-09', p_setor_id: 'setor-1', p_limite: 50,
    });
  });

  /*
   * Listas ausentes no jsonb não podem virar `.map of undefined` dentro do
   * componente. Vazio é resposta válida: setor que bate ao centavo.
   */
  it('sem estrutura e sem NRs, devolve listas vazias', async () => {
    mock.porRpc = {
      fn_mestre_diferenca_detalhe: {
        data: { ...DETALHE_CRU, estrutura: undefined, nrs: undefined, resumo_nrs: undefined },
        error: null,
      },
    };

    const d = await buscarDetalheDaDiferenca('emp-1', '2026-09', 'setor-1');

    expect(d.estrutura).toEqual([]);
    expect(d.nrs).toEqual([]);
    expect(d.resumo.qtd).toBe(0);
  });

  it('setor fora da comparação estoura com a mensagem do banco', async () => {
    mock.porRpc = {
      fn_mestre_diferenca_detalhe: {
        data: null,
        error: { message: 'SETOR_SEM_COMPARACAO: setor x nao esta na comparacao de 2026-09.' },
      },
    };
    await expect(buscarDetalheDaDiferenca('emp-1', '2026-09', 'x'))
      .rejects.toThrow('SETOR_SEM_COMPARACAO');
  });

  it('resposta vazia não vira objeto meio preenchido', async () => {
    mock.porRpc = { fn_mestre_diferenca_detalhe: { data: null, error: null } };
    await expect(buscarDetalheDaDiferenca('emp-1', '2026-09', 'setor-1'))
      .rejects.toThrow('não devolveu resultado');
  });
});
