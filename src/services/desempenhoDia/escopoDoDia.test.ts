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
  setores: null as unknown,
}));

vi.mock('@/lib/supabase', () => {
  function construtor(tabela: keyof typeof respostas) {
    const alvo = {
      select: () => alvo,
      eq: () => alvo,
      in: () => alvo,
      maybeSingle: () => Promise.resolve({ data: respostas.setores, error: null }),
      then: (
        resolve: (v: { data: unknown; error: null }) => unknown,
      ) => Promise.resolve({ data: respostas[tabela], error: null }).then(resolve),
    };
    return alvo;
  }
  return { supabase: { from: (t: string) => construtor(t as keyof typeof respostas) } };
});

import { resolverEscopoDoDia } from './desempenhoDia.service';

const BASE = { empresaId: 'e-1', perfilId: 'u-1', setorId: 's-1' };

beforeEach(() => {
  respostas.equipe_lideres = [];
  respostas.perfis = [];
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
    respostas.perfis = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    const r = await resolverEscopoDoDia({ ...BASE, cargo: 'gerencia' });

    expect(r.rotulo).toBe('Setor Receptivo');
    expect(r.setorId).toBe('s-1');
    expect(r.escopo.tipo).toBe('equipe');
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
    respostas.perfis = [{ id: 'a' }, { id: 'b' }];

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

  it('liderando mais de uma equipe, soma todas', async () => {
    // Acontece: 13 vínculos para 9 líderes na BookPlay.
    respostas.equipe_lideres = [
      { equipes: { id: 'eq-1', nome: 'Matheus' } },
      { equipes: { id: 'eq-2', nome: 'Bryan' } },
    ];
    respostas.perfis = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

    const r = await resolverEscopoDoDia({ ...BASE, cargo: 'lider' });
    expect(r.rotulo).toBe('2 equipes');
    if (r.escopo.tipo === 'equipe') expect(r.escopo.operadores.size).toBe(4);
  });

  /** 22 dos 31 líderes da BookPlay estão neste caso. */
  it('sem equipe nenhuma, cai no setor', async () => {
    respostas.equipe_lideres = [];
    respostas.perfis = [{ id: 'a' }, { id: 'b' }];

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
