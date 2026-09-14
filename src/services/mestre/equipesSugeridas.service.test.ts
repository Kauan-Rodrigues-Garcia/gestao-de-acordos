/**
 * As sugestões de equipe para os subgrupos do 59.
 *
 * ## O que se trava aqui
 *
 * **O que vem MARCADO.** A tela pré-marca as sugestões seguras, e é essa régua
 * que decide se alguém vai clicar «vincular» sem olhar. Marcar demais é o mesmo
 * que vincular sozinho — e vínculo errado feito em silêncio é pior que subgrupo
 * sem vínculo: o sem vínculo aparece pedindo atenção, o errado some no meio dos
 * certos.
 *
 * **Uma pessoa não faz concentração.** Com um operador só, «100% do dinheiro é
 * dessa equipe» significa apenas que existe um operador. Em setembro/2026 são
 * justamente esses os casos de R$ 200 a R$ 600, todos de gente emprestada de
 * outro setor.
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
  buscarEquipesSugeridas,
  sugestaoConfiavel,
  CONCENTRACAO_SEGURA,
  type EquipeSugerida,
} from './equipesSugeridas.service';

/*
 * O caso que provou o mecanismo: «EQUIPE DOUGLAS» é a equipe «HIBRIDO».
 * Nenhum casamento de nome chegaria lá — as pessoas chegam.
 */
const DOUGLAS = {
  cod_grupo_filtro: '56',
  nome_subgrupo: 'EQUIPE DOUGLAS',
  carteira: 'PLAYMIX - VANESSA',
  setor_id: 'setor-playmix',
  setor_nome: 'Playmix',
  valor: '42741.80',
  linhas: '311',
  pessoas: '9',
  equipe_id: 'eq-hibrido',
  equipe_nome: 'HIBRIDO',
  equipe_setor_id: 'setor-playmix',
  equipe_setor_nome: 'Playmix',
  concentracao: '1.0000',
  pessoas_na_equipe: '9',
  mesmo_setor: true,
};

const base = (over: Partial<EquipeSugerida> = {}): EquipeSugerida => ({
  codGrupo: '1', subgrupo: 'X', carteira: 'C', setorId: 's1', setorNome: 'S1',
  valor: 1000, linhas: 10, pessoas: 4,
  equipeId: 'e1', equipeNome: 'E1', equipeSetorId: 's1', equipeSetorNome: 'S1',
  concentracao: 1, pessoasNaEquipe: 4, mesmoSetor: true,
  ...over,
});

beforeEach(() => { mock.porRpc = {}; mock.args = {}; });

describe('buscarEquipesSugeridas', () => {
  it('converte os números e preserva a identidade do subgrupo', async () => {
    mock.porRpc = { fn_mestre_equipes_sugeridas: { data: [DOUGLAS], error: null } };

    const [s] = await buscarEquipesSugeridas('emp-1', '2026-09');

    expect(s.subgrupo).toBe('EQUIPE DOUGLAS');
    expect(s.equipeNome).toBe('HIBRIDO');
    expect(typeof s.valor).toBe('number');
    expect(s.valor).toBeCloseTo(42741.80, 2);
    expect(s.concentracao).toBeCloseTo(1, 4);
    expect(s.pessoasNaEquipe).toBe(9);
  });

  it('repassa o mínimo de concentração para o banco', async () => {
    mock.porRpc = { fn_mestre_equipes_sugeridas: { data: [], error: null } };

    await buscarEquipesSugeridas('emp-1', '2026-09', 0.5);
    expect(mock.args.fn_mestre_equipes_sugeridas).toMatchObject({ p_minimo: 0.5 });

    await buscarEquipesSugeridas('emp-1', '2026-09');
    expect(mock.args.fn_mestre_equipes_sugeridas).toMatchObject({ p_minimo: 0.8 });
  });

  it('lista vazia não vira erro — é o estado de «tudo vinculado»', async () => {
    mock.porRpc = { fn_mestre_equipes_sugeridas: { data: null, error: null } };
    await expect(buscarEquipesSugeridas('emp-1', '2026-09')).resolves.toEqual([]);
  });

  it('erro do banco vira exceção com a mensagem do banco', async () => {
    mock.porRpc = {
      fn_mestre_equipes_sugeridas: { data: null, error: { message: 'Sem acesso a esta empresa.' } },
    };
    await expect(buscarEquipesSugeridas('emp-1', '2026-09'))
      .rejects.toThrow('Sem acesso a esta empresa.');
  });
});

describe('sugestaoConfiavel', () => {
  it('aceita a sugestão forte do mesmo setor', () => {
    expect(sugestaoConfiavel(base())).toBe(true);
  });

  /*
   * Equipe de outro setor quase sempre é pessoa emprestada, não a equipe daquele
   * subgrupo. Em setembro: «EQUIPE CAMILA» dentro da carteira do Play 5
   * sugerindo a Equipe Camila do Play Mix, com uma pessoa e R$ 237,33.
   */
  it('não marca quando a equipe é de outro setor', () => {
    expect(sugestaoConfiavel(base({ mesmoSetor: false }))).toBe(false);
  });

  it('não marca com uma pessoa só, mesmo a 100%', () => {
    expect(sugestaoConfiavel(base({ pessoasNaEquipe: 1, concentracao: 1 }))).toBe(false);
  });

  it('não marca abaixo da concentração segura', () => {
    expect(sugestaoConfiavel(base({ concentracao: CONCENTRACAO_SEGURA - 0.01 }))).toBe(false);
    expect(sugestaoConfiavel(base({ concentracao: CONCENTRACAO_SEGURA }))).toBe(true);
  });

  /*
   * O «TIME HOME OFFICE» do Receptivo: 80,2% para a equipe Luciana, com três
   * pessoas. Aparece na lista, mas desmarcado — um quinto do dinheiro é de
   * outra equipe, e isso merece olho humano.
   */
  it('deixa a sugestão de 80% na lista, porém desmarcada', () => {
    const homeOffice = base({ concentracao: 0.802, pessoasNaEquipe: 3 });
    expect(sugestaoConfiavel(homeOffice)).toBe(false);
  });
});
