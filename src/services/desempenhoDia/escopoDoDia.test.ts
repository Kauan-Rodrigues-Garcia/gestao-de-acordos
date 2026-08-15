/**
 * escopoDoDia.test.ts
 *
 * O painel do dia não pergunta «o dia de quem?» — ele responde a partir do
 * cargo. Esta é a regra inteira:
 *
 *   diretoria, administrador, super_admin ..... a empresa
 *   gerencia ................................. o setor dele
 *   lider .................................... as equipes que ele lidera
 *            sem equipe nenhuma .............. o setor dele
 *   todos os demais .......................... só ele
 *
 * O caso «líder sem equipe» não é exceção rara: 22 dos 31 líderes da BookPlay
 * não estão em `equipe_lideres`. Se ele caísse em «só você», o painel ficaria
 * vazio justamente para quem mais o usa.
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
      const r = await resolverEscopoDoDia({ ...BASE, cargo });
      expect(r.escopo.tipo, cargo).toBe('empresa');
      expect(r.rotulo).toBe('Empresa inteira');
      // Escopo de empresa não filtra nada no banco: a soma é da empresa toda.
      expect(r.operadorId).toBeNull();
      expect(r.setorId).toBeNull();
    }
  });

  it('gerência vê o setor inteiro, com o nome no rótulo', async () => {
    respostas.perfis = [
      { id: 'a', equipe_id: 'eq-1' },
      { id: 'b', equipe_id: 'eq-1' },
      { id: 'c', equipe_id: null },
    ];
    const r = await resolverEscopoDoDia({ ...BASE, cargo: 'gerencia' });

    expect(r.rotulo).toBe('Setor Receptivo');
    expect(r.setorId).toBe('s-1');
    expect(r.escopo.tipo).toBe('equipe');
    // Os três, inclusive quem não está em equipe nenhuma: «todas» é o setor.
    if (r.escopo.tipo === 'equipe') expect(r.escopo.operadores.size).toBe(3);
  });

  it('operador vê só a si', async () => {
    const r = await resolverEscopoDoDia({ ...BASE, cargo: 'operador' });
    expect(r.escopo).toEqual({ tipo: 'operador', operadorId: 'u-1' });
    expect(r.rotulo).toBe('Os seus números');
    expect(r.operadorId).toBe('u-1');
  });

  it('elite e ouvidoria também veem só a si', async () => {
    for (const cargo of ['elite', 'ouvidoria']) {
      const r = await resolverEscopoDoDia({ ...BASE, cargo });
      expect(r.escopo.tipo, cargo).toBe('operador');
    }
  });
});

describe('resolverEscopoDoDia — líder', () => {
  it('vê a equipe que lidera, com o nome dela no rótulo', async () => {
    respostas.equipe_lideres = [{ equipes: { id: 'eq-1', nome: 'Matheus' } }];
    respostas.perfis = [{ id: 'a', equipe_id: 'eq-1' }, { id: 'b', equipe_id: 'eq-1' }];

    const r = await resolverEscopoDoDia({ ...BASE, cargo: 'lider' });

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

    const r = await resolverEscopoDoDia({ ...BASE, cargo: 'lider' });

    expect(r.rotulo).toBe('Todas as equipes');
    if (r.escopo.tipo === 'equipe') expect(r.escopo.operadores.size).toBe(4);
    // Ordenadas por nome, para o seletor não trocar de ordem entre aberturas.
    expect(r.equipes.map(e => e.nome)).toEqual(['Bryan', 'Matheus']);
  });

  /** 22 dos 31 líderes da BookPlay estão neste caso. */
  it('sem equipe nenhuma, cai no setor', async () => {
    respostas.equipe_lideres = [];
    respostas.perfis = [{ id: 'a', equipe_id: null }, { id: 'b', equipe_id: null }];

    const r = await resolverEscopoDoDia({ ...BASE, cargo: 'lider' });
    expect(r.rotulo).toBe('Setor Receptivo');
    expect(r.setorId).toBe('s-1');
  });

  it('sem equipe e sem setor, vê só a si — e não um conjunto vazio', async () => {
    // Escopo vazio somaria zero e pareceria dado real.
    const r = await resolverEscopoDoDia({ ...BASE, cargo: 'lider', setorId: null });
    expect(r.escopo).toEqual({ tipo: 'operador', operadorId: 'u-1' });
    expect(r.rotulo).toBe('Os seus números');
  });

  it('setor sem nome cadastrado ainda produz rótulo legível', async () => {
    respostas.setores = null;
    const r = await resolverEscopoDoDia({ ...BASE, cargo: 'gerencia' });
    expect(r.rotulo).toBe('Seu setor');
  });
});

describe('equipes disponíveis para o seletor', () => {
  it('gerência pode isolar as equipes do setor', async () => {
    respostas.equipes = [{ id: 'eq-1', nome: 'Bryan' }, { id: 'eq-2', nome: 'Matheus' }];
    respostas.perfis = [
      { id: 'a', equipe_id: 'eq-1' },
      { id: 'b', equipe_id: 'eq-2' },
      { id: 'c', equipe_id: null },
    ];

    const r = await resolverEscopoDoDia({ ...BASE, cargo: 'gerencia' });
    expect(r.equipes.map(e => e.nome)).toEqual(['Bryan', 'Matheus']);
    expect(r.equipes[0].membros).toEqual(['a']);
  });

  /** Escolhê-la zeraria o painel, e o zero pareceria resultado do dia. */
  it('equipe sem ninguém não vira opção', async () => {
    respostas.equipes = [{ id: 'eq-1', nome: 'Cheia' }, { id: 'eq-2', nome: 'Vazia' }];
    respostas.perfis = [{ id: 'a', equipe_id: 'eq-1' }];

    const r = await resolverEscopoDoDia({ ...BASE, cargo: 'gerencia' });
    expect(r.equipes.map(e => e.nome)).toEqual(['Cheia']);
  });

  it('quem vê a empresa ou só a si não recebe seletor', async () => {
    for (const cargo of ['diretoria', 'operador']) {
      const r = await resolverEscopoDoDia({ ...BASE, cargo });
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
