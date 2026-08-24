/**
 * escopoDoDia.test.ts
 *
 * O painel do dia não pergunta «o dia de quem?» — ele responde a partir dos
 * NÍVEIS do Dashboard, a aba onde vive. Esta é a regra inteira:
 *
 *   todos_setores ............................ a empresa
 *   equipe ................................... as equipes que a pessoa lidera
 *          sem equipe nenhuma, com setor ..... o setor dela
 *          sem equipe nenhuma, sem setor ..... só ela
 *   setor .................................... o setor dela
 *   só individual ............................ só ela
 *
 * O caso «líder sem equipe» não é exceção rara: 22 dos 31 líderes da BookPlay
 * não estão em `equipe_lideres`. Se ele caísse em «só você», o painel ficaria
 * vazio justamente para quem mais o usa.
 *
 * ## Isto era decidido por CARGO até 24/08/2026
 *
 *   diretoria, administrador, super_admin → empresa
 *   gerencia → setor · lider → equipes · todos os demais → só ele
 *
 * Quatro listas escritas dentro do serviço, que discordavam do próprio
 * Dashboard sobre as mesmas pessoas: a gerência via a empresa nos cartões e o
 * setor aqui; o elite via o setor nos cartões e só a si aqui. Os dois passaram
 * a ver o que o painel já dizia — e desfazer qualquer um dos dois agora é
 * desligar um nível na tela de Permissões, não editar este arquivo.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

/** Respostas por tabela, montadas em cada teste. */
const respostas = vi.hoisted(() => ({
  equipe_lideres: [] as unknown[],
  perfis: [] as unknown[],
  equipes: [] as unknown[],
  setores: null as unknown,
}));

vi.mock('@/lib/supabase', () => {
  function construtor(tabela: keyof typeof respostas) {
    const alvo = {
      select: () => alvo,
      eq: () => alvo,
      in: () => alvo,
      order: () => alvo,
      maybeSingle: () => Promise.resolve({ data: respostas.setores, error: null }),
      then: (
        resolve: (v: { data: unknown; error: null }) => unknown,
      ) => Promise.resolve({ data: respostas[tabela], error: null }).then(resolve),
    };
    return alvo;
  }
  return { supabase: { from: (t: string) => construtor(t as keyof typeof respostas) } };
});

import { resolverEscopoDoDia, aplicarEquipeEscolhida } from './desempenhoDia.service';
import { niveisLiberados } from '@/lib/permissoes-escopo';
import { temPermissaoDoCargo } from '@/test/permissoesDoCargo';

/**
 * Os niveis de Dashboard que o catalogo concede a este cargo.
 *
 * O painel do dia deixou de perguntar o CARGO em 24/08/2026 e passou a receber
 * os niveis da aba onde vive. Os testes continuam declarando o cargo — e ele
 * continua significando a mesma coisa — porque a traducao usa os PADROES REAIS
 * do catalogo, e nao uma tabela paralela escrita aqui.
 */
const niveisDoCargo = (cargo: string) =>
  niveisLiberados('dashboard', temPermissaoDoCargo(cargo));

const BASE = { empresaId: 'e-1', perfilId: 'u-1', setorId: 's-1' };

beforeEach(() => {
  respostas.equipe_lideres = [];
  respostas.perfis = [];
  respostas.equipes = [];
  respostas.setores = { nome: 'Receptivo' };
});

describe('resolverEscopoDoDia — por cargo', () => {
  it('diretoria, administrador e super_admin veem a empresa', async () => {
    for (const cargo of ['diretoria', 'administrador', 'super_admin']) {
      const r = await resolverEscopoDoDia({ ...BASE, niveis: niveisDoCargo(cargo) });
      expect(r.escopo.tipo, cargo).toBe('empresa');
      expect(r.rotulo).toBe('Empresa inteira');
      // Escopo de empresa não filtra nada no banco: a soma é da empresa toda.
      expect(r.operadorId).toBeNull();
      expect(r.setorId).toBeNull();
    }
  });

  /*
   * A gerência passou a ver a EMPRESA, e antes via o setor.
   *
   * Não é regressão nem descuido: ela tem `dashboard_escopo_todos_setores` e já
   * via a empresa nos cartões do Dashboard, logo acima deste painel. Só aqui
   * ficava presa ao setor, por uma linha `cargo === 'gerencia'` escrita no
   * serviço — e nenhum painel de permissões conseguia mudar isso.
   *
   * Para devolvê-la ao setor, basta desligar `dashboard_escopo_todos_setores`
   * para o cargo. É o teste ao lado, e agora funciona.
   */
  it('quem tem todos os setores vê a empresa — inclusive a gerência', async () => {
    const r = await resolverEscopoDoDia({ ...BASE, niveis: niveisDoCargo('gerencia') });
    expect(r.escopo.tipo).toBe('empresa');
    expect(r.rotulo).toBe('Empresa inteira');
  });

  it('sem `todos_setores`, o mesmo cargo volta ao setor', async () => {
    respostas.perfis = [
      { id: 'a', equipe_id: 'eq-1' },
      { id: 'b', equipe_id: 'eq-1' },
      { id: 'c', equipe_id: null },
    ];
    // Exatamente o que o painel produz ao desligar o nível mais amplo.
    const r = await resolverEscopoDoDia({ ...BASE, niveis: ['individual', 'setor'] });

    expect(r.rotulo).toBe('Setor Receptivo');
    expect(r.setorId).toBe('s-1');
    expect(r.escopo.tipo).toBe('equipe');
    // Os três, inclusive quem não está em equipe nenhuma: «todas» é o setor.
    if (r.escopo.tipo === 'equipe') expect(r.escopo.operadores.size).toBe(3);
  });

  it('operador vê só a si', async () => {
    const r = await resolverEscopoDoDia({ ...BASE, niveis: niveisDoCargo('operador') });
    expect(r.escopo).toEqual({ tipo: 'operador', operadorId: 'u-1' });
    expect(r.rotulo).toBe('Os seus números');
    expect(r.operadorId).toBe('u-1');
  });

  it('quem só tem `individual` vê só a si — ouvidoria e operador', async () => {
    for (const cargo of ['ouvidoria', 'operador']) {
      const r = await resolverEscopoDoDia({ ...BASE, niveis: niveisDoCargo(cargo) });
      expect(r.escopo.tipo, cargo).toBe('operador');
    }
  });

  /*
   * O elite passou a alcançar a equipe/o setor, e antes via só a si.
   *
   * Mesma história da gerência: ele tem `dashboard_escopo_equipe` e `_setor`, e
   * caía no ramo final por não estar escrito em nenhuma das listas de cargo do
   * serviço. O Dashboard ao lado já lhe mostrava o setor.
   *
   * Sem equipe sob liderança ele cai no setor, que é o mesmo caminho do líder.
   */
  it('elite alcança além de si — tem os níveis, e agora eles valem', async () => {
    const r = await resolverEscopoDoDia({ ...BASE, niveis: niveisDoCargo('elite') });
    expect(r.escopo.tipo).not.toBe('operador');
  });
});

describe('resolverEscopoDoDia — líder', () => {
  it('vê a equipe que lidera, com o nome dela no rótulo', async () => {
    respostas.equipe_lideres = [{ equipes: { id: 'eq-1', nome: 'Matheus' } }];
    respostas.perfis = [{ id: 'a', equipe_id: 'eq-1' }, { id: 'b', equipe_id: 'eq-1' }];

    const r = await resolverEscopoDoDia({ ...BASE, niveis: niveisDoCargo('lider') });

    expect(r.rotulo).toBe('Equipe Matheus');
    expect(r.escopo.tipo).toBe('equipe');
    // Os dois membros mais o próprio líder: o acordo que ele tabula é produção
    // da equipe dele.
    if (r.escopo.tipo === 'equipe') {
      expect(r.escopo.operadores.has('u-1')).toBe(true);
      expect(r.escopo.operadores.size).toBe(3);
    }
  });

  it('liderando mais de uma equipe, soma todas e oferece o seletor', async () => {
    // Acontece: 13 vínculos para 9 líderes na BookPlay.
    respostas.equipe_lideres = [
      { equipes: { id: 'eq-1', nome: 'Matheus' } },
      { equipes: { id: 'eq-2', nome: 'Bryan' } },
    ];
    respostas.perfis = [
      { id: 'a', equipe_id: 'eq-1' },
      { id: 'b', equipe_id: 'eq-1' },
      { id: 'c', equipe_id: 'eq-2' },
    ];

    const r = await resolverEscopoDoDia({ ...BASE, niveis: niveisDoCargo('lider') });

    expect(r.rotulo).toBe('Todas as equipes');
    if (r.escopo.tipo === 'equipe') expect(r.escopo.operadores.size).toBe(4);
    // Ordenadas por nome, para o seletor não trocar de ordem entre aberturas.
    expect(r.equipes.map(e => e.nome)).toEqual(['Bryan', 'Matheus']);
  });

  /** 22 dos 31 líderes da BookPlay estão neste caso. */
  it('sem equipe nenhuma, cai no setor', async () => {
    respostas.equipe_lideres = [];
    respostas.perfis = [{ id: 'a', equipe_id: null }, { id: 'b', equipe_id: null }];

    const r = await resolverEscopoDoDia({ ...BASE, niveis: niveisDoCargo('lider') });
    expect(r.rotulo).toBe('Setor Receptivo');
    expect(r.setorId).toBe('s-1');
  });

  it('sem equipe e sem setor, vê só a si — e não um conjunto vazio', async () => {
    // Escopo vazio somaria zero e pareceria dado real.
    const r = await resolverEscopoDoDia({ ...BASE, niveis: niveisDoCargo('lider'), setorId: null });
    expect(r.escopo).toEqual({ tipo: 'operador', operadorId: 'u-1' });
    expect(r.rotulo).toBe('Os seus números');
  });

  it('setor sem nome cadastrado ainda produz rótulo legível', async () => {
    respostas.setores = null;
    const r = await resolverEscopoDoDia({ ...BASE, niveis: ['individual', 'setor'] });
    expect(r.rotulo).toBe('Seu setor');
  });
});

describe('equipes disponíveis para o seletor', () => {
  /*
   * O seletor de equipe pertence ao alcance de SETOR — é o recorte de dentro
   * dele. Quem tem `todos_setores` não recebe seletor: o painel já soma a
   * empresa, e escolher uma equipe seria estreitar duas vezes.
   */
  it('quem tem alcance de setor pode isolar as equipes dele', async () => {
    respostas.equipes = [{ id: 'eq-1', nome: 'Bryan' }, { id: 'eq-2', nome: 'Matheus' }];
    respostas.perfis = [
      { id: 'a', equipe_id: 'eq-1' },
      { id: 'b', equipe_id: 'eq-2' },
      { id: 'c', equipe_id: null },
    ];

    const r = await resolverEscopoDoDia({ ...BASE, niveis: ['individual', 'setor'] });
    expect(r.equipes.map(e => e.nome)).toEqual(['Bryan', 'Matheus']);
    expect(r.equipes[0].membros).toEqual(['a']);
  });

  /** Escolhê-la zeraria o painel, e o zero pareceria resultado do dia. */
  it('equipe sem ninguém não vira opção', async () => {
    respostas.equipes = [{ id: 'eq-1', nome: 'Cheia' }, { id: 'eq-2', nome: 'Vazia' }];
    respostas.perfis = [{ id: 'a', equipe_id: 'eq-1' }];

    const r = await resolverEscopoDoDia({ ...BASE, niveis: ['individual', 'setor'] });
    expect(r.equipes.map(e => e.nome)).toEqual(['Cheia']);
  });

  it('quem vê a empresa ou só a si não recebe seletor', async () => {
    for (const cargo of ['diretoria', 'operador']) {
      const r = await resolverEscopoDoDia({ ...BASE, niveis: niveisDoCargo(cargo) });
      expect(r.equipes, cargo).toEqual([]);
    }
  });
});

describe('aplicarEquipeEscolhida', () => {
  const base = {
    escopo: { tipo: 'equipe' as const, operadores: new Set(['a', 'b', 'c']) },
    rotulo: 'Setor Receptivo',
    operadorId: null,
    setorId: 's-1',
    equipes: [
      { id: 'eq-1', nome: 'Bryan', membros: ['a'] },
      { id: 'eq-2', nome: 'Matheus', membros: ['b', 'c'] },
    ],
  };

  it('«todas» devolve a base intacta', () => {
    expect(aplicarEquipeEscolhida(base, null)).toBe(base);
  });

  it('a equipe escolhida troca o conjunto e o rótulo', () => {
    const r = aplicarEquipeEscolhida(base, 'eq-2');
    expect(r.rotulo).toBe('Equipe Matheus');
    if (r.escopo.tipo === 'equipe') {
      expect([...r.escopo.operadores].sort()).toEqual(['b', 'c']);
    }
  });

  /**
   * Recortar por equipe E por setor daria a interseção dos dois, que não é o
   * que o seletor promete.
   */
  it('a equipe escolhida zera o filtro de setor', () => {
    expect(aplicarEquipeEscolhida(base, 'eq-1').setorId).toBeNull();
  });

  it('equipe desconhecida devolve a base, em vez de esvaziar a tela', () => {
    // Acontece quando a equipe é apagada com o painel aberto.
    expect(aplicarEquipeEscolhida(base, 'sumiu')).toBe(base);
  });

  it('a lista de equipes sobrevive à escolha — o seletor não some', () => {
    expect(aplicarEquipeEscolhida(base, 'eq-1').equipes).toHaveLength(2);
  });
});
