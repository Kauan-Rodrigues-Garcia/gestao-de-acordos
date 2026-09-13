/**
 * O recebimento por pessoa no 59.
 *
 * ## O que se trava aqui
 *
 * **Os dois números convivem.** `total` é tudo o que a pessoa cobrou;
 * `no_setor_dele` é a parte que caiu no setor DELA. Confundir os dois faz o
 * painel mostrar para o operador um valor que o setor dele não tem — foi
 * exatamente a leitura errada que criou os «18 operadores divergentes».
 *
 * **`numeric` vem como STRING.** O PostgREST entrega `numeric` em texto, e sem
 * coerção `total - noSetorDele` concatena em vez de subtrair. Já aconteceu neste
 * projeto (ver `diferencaDetalhe.test.ts`), e aqui há seis campos assim.
 *
 * **O dublê é THENABLE, e não `Promise`.** `supabase.rpc()` devolve o construtor
 * do PostgREST: tem `.then`, não tem `.catch`. Um dublê que devolvesse
 * `Promise.resolve(...)` seria MAIS capaz que a coisa real, e deixaria passar o
 * `.catch is not a function` que derrubou duas abas em 10/09/2026.
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

import { buscarOperadoresDoMes, buscarOperadorDetalhe } from './operadores.service';

/*
 * A Karolaine de setembro/2026, como o banco devolve. É o caso que provou a
 * regra: R$ 37.081,78 cobrados, dos quais só R$ 7.445,58 caíram no setor dela
 * — e são esses R$ 7.445,58 que batem ao centavo com o 58 do Play 1.
 */
const KAROLAINE = {
  cobradora: 'KAROLAINE_SILVA',
  operador_id: 'perfil-1',
  nome: 'Karolaine Silva',
  tem_perfil: true,
  setor_do_operador_id: 'setor-play1',
  setor_do_operador: 'Play 1',
  total: '37081.78',
  no_setor_dele: '7445.58',
  fora_do_setor_dele: '29636.20',
  linhas: '412',
  carteiras: '2',
  subgrupos: '1',
};

/** Quem aparece no 59 e não tem perfil. Conta para o setor do mesmo jeito. */
const SEM_REGISTRO = {
  ...KAROLAINE,
  cobradora: 'FULANO_QUE_SAIU',
  operador_id: null,
  nome: null,
  tem_perfil: false,
  setor_do_operador_id: null,
  setor_do_operador: null,
  total: '1200.00',
  no_setor_dele: '0',
  fora_do_setor_dele: '1200.00',
};

beforeEach(() => { mock.porRpc = {}; mock.args = {}; });

describe('buscarOperadoresDoMes', () => {
  it('traz os dois números como NÚMERO, e eles fecham', async () => {
    mock.porRpc = { fn_mestre_operadores_do_mes: { data: [KAROLAINE], error: null } };

    const [o] = await buscarOperadoresDoMes('emp-1', '2026-09');

    expect(typeof o.total).toBe('number');
    expect(typeof o.noSetorDele).toBe('number');
    expect(o.total).toBeCloseTo(37081.78, 2);
    expect(o.noSetorDele).toBeCloseTo(7445.58, 2);
    // A conta que a tela desenha: total = no setor + fora.
    expect(o.noSetorDele + o.foraDoSetorDele).toBeCloseTo(o.total, 2);
  });

  it('mantém a pessoa sem perfil, com o login como identidade', async () => {
    mock.porRpc = { fn_mestre_operadores_do_mes: { data: [SEM_REGISTRO], error: null } };

    const [o] = await buscarOperadoresDoMes('emp-1', '2026-09');

    expect(o.temPerfil).toBe(false);
    expect(o.nome).toBeNull();
    // A cobradora é a chave: é ela que sobrevive a quem não está cadastrado.
    expect(o.cobradora).toBe('FULANO_QUE_SAIU');
    expect(o.total).toBeCloseTo(1200, 2);
  });

  it('repassa o dia de corte, inclusive quando é ausente', async () => {
    mock.porRpc = { fn_mestre_operadores_do_mes: { data: [], error: null } };

    await buscarOperadoresDoMes('emp-1', '2026-09', 10);
    expect(mock.args.fn_mestre_operadores_do_mes).toMatchObject({ p_dia_corte: 10 });

    await buscarOperadoresDoMes('emp-1', '2026-09');
    expect(mock.args.fn_mestre_operadores_do_mes).toMatchObject({ p_dia_corte: null });
  });

  it('lista vazia não vira erro', async () => {
    mock.porRpc = { fn_mestre_operadores_do_mes: { data: null, error: null } };
    await expect(buscarOperadoresDoMes('emp-1', '2026-09')).resolves.toEqual([]);
  });

  it('erro do banco vira exceção com a mensagem do banco', async () => {
    mock.porRpc = {
      fn_mestre_operadores_do_mes: { data: null, error: { message: 'Sem acesso a esta empresa.' } },
    };
    await expect(buscarOperadoresDoMes('emp-1', '2026-09'))
      .rejects.toThrow('Sem acesso a esta empresa.');
  });
});

describe('buscarOperadorDetalhe', () => {
  const DETALHE = {
    cobradora: 'KAROLAINE_SILVA',
    mes: '2026-09',
    operador_id: 'perfil-1',
    tem_perfil: true,
    nome: 'Karolaine Silva',
    setor_do_operador_id: 'setor-play1',
    setor_do_operador: 'Play 1',
    total: '37081.78',
    no_setor_dele: '7445.58',
    fora_do_setor_dele: '29636.20',
    por_setor: [
      { setor_id: 'setor-play1', rotulo: 'Play 1', oficial: true,
        e_o_setor_dele: true, valor: '7445.58', linhas: '96' },
      { setor_id: null, rotulo: 'Sem vinculo · MARILIA - COFEN', oficial: false,
        e_o_setor_dele: false, valor: '29636.20', linhas: '316' },
    ],
    por_carteira: [
      { cod: '25', nome: 'COB PLAY 1 - PAOLA', oficial: true,
        setor_nome: 'Play 1', valor: '7445.58', linhas: '96' },
      { cod: '72', nome: 'MARILIA - COFEN', oficial: false,
        setor_nome: null, valor: '29636.20', linhas: '316' },
    ],
    por_equipe: [
      { subgrupo: 'EQUIPE X', cod_grupo: '25', carteira: 'COB PLAY 1 - PAOLA',
        equipe_id: 'eq-1', equipe_nome: 'Equipe X', vinculada: true,
        valor: '7445.58', linhas: '96' },
      { subgrupo: 'COFEN GERAL', cod_grupo: '72', carteira: 'MARILIA - COFEN',
        equipe_id: null, equipe_nome: null, vinculada: false,
        valor: '29636.20', linhas: '316' },
    ],
    por_dia: [{ dia: '2026-09-01', valor: '1000.00', linhas: '12' }],
  };

  it('converte todos os valores aninhados, não só os do topo', async () => {
    mock.porRpc = { fn_mestre_operador_detalhe: { data: DETALHE, error: null } };

    const d = await buscarOperadorDetalhe('emp-1', '2026-09', 'KAROLAINE_SILVA');

    expect(typeof d.porSetor[0].valor).toBe('number');
    expect(typeof d.porCarteira[0].valor).toBe('number');
    expect(typeof d.porEquipe[0].valor).toBe('number');
    expect(typeof d.porDia[0].valor).toBe('number');
    // As partes somam o total — se uma delas ficar como string, isto cai.
    const soma = d.porSetor.reduce((s, p) => s + p.valor, 0);
    expect(soma).toBeCloseTo(d.total, 2);
  });

  /*
   * Carteira sem vínculo NÃO é erro: é setor que ainda não foi cadastrado na
   * planilha. Ela aparece com o nome do ERP e `oficial: false`, e o valor conta
   * igual. Se alguém transformar isso em erro, a tela passa a acusar R$ 1,1
   * milhão de «divergência» que não existe.
   */
  it('marca a carteira sem vínculo sem escondê-la', async () => {
    mock.porRpc = { fn_mestre_operador_detalhe: { data: DETALHE, error: null } };

    const d = await buscarOperadorDetalhe('emp-1', '2026-09', 'KAROLAINE_SILVA');

    const semVinculo = d.porCarteira.find(c => !c.oficial)!;
    expect(semVinculo.nome).toBe('MARILIA - COFEN');
    expect(semVinculo.valor).toBeCloseTo(29636.20, 2);
    expect(d.porSetor.find(s => !s.oficial)).toBeDefined();
  });

  it('separa o setor da pessoa do resto', async () => {
    mock.porRpc = { fn_mestre_operador_detalhe: { data: DETALHE, error: null } };

    const d = await buscarOperadorDetalhe('emp-1', '2026-09', 'KAROLAINE_SILVA');

    expect(d.porSetor.filter(s => s.eOSetorDele)).toHaveLength(1);
    expect(d.noSetorDele).toBeCloseTo(7445.58, 2);
    expect(d.foraDoSetorDele).toBeCloseTo(29636.20, 2);
  });

  it('resposta vazia vira exceção — não um detalhe silenciosamente zerado', async () => {
    mock.porRpc = { fn_mestre_operador_detalhe: { data: null, error: null } };
    await expect(buscarOperadorDetalhe('emp-1', '2026-09', 'X'))
      .rejects.toThrow('não devolveu resultado');
  });
});
