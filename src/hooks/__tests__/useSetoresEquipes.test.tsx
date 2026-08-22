/**
 * useSetoresEquipes.test.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * O hook que substituiu o `useAnalytics()` que o Dashboard montava só para
 * pegar as listas de setor e equipe — e que, junto com o do AnalyticsPanel,
 * fazia a tela varrer todos os acordos do mês duas vezes.
 *
 * O teste que mais importa aqui é o do LAÇO. Na primeira versão o hook
 * dependia do objeto `perfil` inteiro; como `useAuth` devolve um objeto novo a
 * cada render, `carregar` mudava de identidade sempre, o efeito disparava de
 * novo, o `setState` provocava outro render — e a suíte morria com "JavaScript
 * heap out of memory". Não é um caso hipotético: aconteceu.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

const { perfilRef, empresaRef, chavesRef, fromSpy } = vi.hoisted(() => ({
  perfilRef:    { current: { perfil: 'lider', setor_id: 'setor-1' } as Record<string, unknown> | null },
  empresaRef:   { current: { id: 'emp-1' } as { id: string } | null },
  chavesRef:    { current: new Set<string>() },
  fromSpy:      vi.fn(),
}));

// `useAuth` devolve um OBJETO NOVO a cada chamada, de propósito: é assim que o
// hook real se comporta e é o que provocava o laço.
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ perfil: perfilRef.current ? { ...perfilRef.current } : null }),
}));
vi.mock('@/hooks/useEmpresa', () => ({
  useEmpresa: () => ({ empresa: empresaRef.current ? { ...empresaRef.current } : null }),
}));
vi.mock('@/hooks/useCargoPermissoes', () => ({
  useCargoPermissoes: () => ({ temPermissao: (c: string) => chavesRef.current.has(c) }),
}));
vi.mock('@/lib/supabase', () => ({
  supabase: { from: (tabela: string) => fromSpy(tabela) },
}));

const { useSetoresEquipes } = await import('@/hooks/useSetoresEquipes');

/** Construtor encadeável que devolve `linhas` no `.order()`. */
function construtor(linhas: Record<string, unknown>[]) {
  const alvo = {
    select: () => alvo,
    eq:     () => alvo,
    order:  () => Promise.resolve({ data: linhas, error: null }),
  };
  return alvo;
}

beforeEach(() => {
  perfilRef.current    = { perfil: 'lider', setor_id: 'setor-1' };
  empresaRef.current   = { id: 'emp-1' };
  // Padrao: o caso do lider — enxerga o proprio setor e escolhe equipe, mas
  // nao escolhe setor.
  chavesRef.current = new Set(['dashboard_escopo_individual', 'dashboard_escopo_equipe']);
  fromSpy.mockReset();
  fromSpy.mockImplementation((tabela: string) =>
    construtor(tabela === 'equipes'
      ? [{ id: 'eq-1', nome: 'Equipe A', setor_id: 'setor-1' }]
      : [{ id: 's-1', nome: 'Setor 1' }]));
});

describe('useSetoresEquipes — não entra em laço', () => {
  it('consulta o banco UMA vez, mesmo com `perfil` mudando de identidade', async () => {
    const { result, rerender } = renderHook(() => useSetoresEquipes());
    await waitFor(() => expect(result.current.loading).toBe(false));

    const chamadasIniciais = fromSpy.mock.calls.length;
    // Cada rerender faz `useAuth` devolver um objeto novo. Se as dependências
    // do efeito fossem o objeto, cada um destes dispararia outra rodada de
    // consultas — e em produção não haveria rerender que parasse.
    rerender();
    rerender();
    rerender();

    expect(fromSpy.mock.calls.length).toBe(chamadasIniciais);
  });

  it('recarrega quando o setor do usuário realmente muda', async () => {
    const { result, rerender } = renderHook(() => useSetoresEquipes());
    await waitFor(() => expect(result.current.loading).toBe(false));
    const antes = fromSpy.mock.calls.length;

    perfilRef.current = { perfil: 'lider', setor_id: 'setor-2' };
    rerender();

    await waitFor(() => expect(fromSpy.mock.calls.length).toBeGreaterThan(antes));
  });
});

/*
 * Estes casos falavam em cargo — "lider", "administrador" — porque era o cargo
 * que decidia. Agora quem decide sao os NIVEIS DA ABA, entao os casos falam
 * neles. O cargo continua no `perfilRef` porque o setor do perfil ainda importa
 * para quem nao escolhe setor.
 */
describe('useSetoresEquipes — o que cada nivel enxerga', () => {
  it('sem o nivel todos_setores nao ha lista de setores, so as equipes', async () => {
    const { result } = renderHook(() => useSetoresEquipes());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.setores).toEqual([]);
    expect(result.current.equipesDoSetor).toHaveLength(1);
    expect(fromSpy).not.toHaveBeenCalledWith('setores');
  });

  it('com todos_setores recebe as duas listas', async () => {
    chavesRef.current.add('dashboard_escopo_setor');
    chavesRef.current.add('dashboard_escopo_todos_setores');
    const { result } = renderHook(() => useSetoresEquipes());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.setores).toHaveLength(1);
    expect(result.current.equipesDoSetor).toHaveLength(1);
  });

  /*
   * Antes este caso era "administrador recebe os setores e nenhuma equipe",
   * porque a lista de equipes saia de `isPerfilLider` e admin nao esta la.
   * Cargo nao decide mais: o que tira a lista de equipes e nao ter o nivel.
   */
  it('sem o nivel equipe, nenhuma equipe e carregada', async () => {
    perfilRef.current = { perfil: 'administrador', setor_id: null };
    chavesRef.current = new Set([
      'dashboard_escopo_individual', 'dashboard_escopo_setor', 'dashboard_escopo_todos_setores',
    ]);
    const { result } = renderHook(() => useSetoresEquipes());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.setores).toHaveLength(1);
    expect(result.current.equipesDoSetor).toEqual([]);
  });

  it('so com individual nao consulta nada', async () => {
    perfilRef.current = { perfil: 'operador', setor_id: 'setor-1' };
    chavesRef.current = new Set(['dashboard_escopo_individual']);
    const { result } = renderHook(() => useSetoresEquipes());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(fromSpy).not.toHaveBeenCalled();
    expect(result.current.setores).toEqual([]);
  });

  it('sem empresa, sai de loading sem consultar', async () => {
    empresaRef.current = null;
    const { result } = renderHook(() => useSetoresEquipes());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(fromSpy).not.toHaveBeenCalled();
  });

  /*
   * O defeito que o filtro unico veio consertar: a lista de equipes nao
   * seguia o setor escolhido. Com alcance amplo ela trazia a empresa inteira,
   * entao escolher o setor B e depois uma equipe do setor A cruzava dois
   * recortes impossiveis e devolvia tela vazia.
   */
  it('as equipes seguem o setor escolhido', async () => {
    chavesRef.current.add('dashboard_escopo_setor');
    chavesRef.current.add('dashboard_escopo_todos_setores');
    fromSpy.mockImplementation((tabela: string) =>
      construtor(tabela === 'equipes'
        ? [
            { id: 'eq-1', nome: 'Equipe A', setor_id: 'setor-1' },
            { id: 'eq-2', nome: 'Equipe B', setor_id: 'setor-2' },
          ]
        : [{ id: 'setor-1', nome: 'Setor 1' }, { id: 'setor-2', nome: 'Setor 2' }]));

    const { result } = renderHook(() => useSetoresEquipes());
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Sem setor escolhido: as equipes que a consulta trouxe.
    expect(result.current.equipesDoSetor).toHaveLength(2);

    act(() => result.current.setSetorFiltro('setor-2'));
    expect(result.current.equipesDoSetor.map(e => e.id)).toEqual(['eq-2']);

    act(() => result.current.setSetorFiltro('setor-1'));
    expect(result.current.equipesDoSetor.map(e => e.id)).toEqual(['eq-1']);

    // De volta a "todos os setores": a lista inteira.
    act(() => result.current.setSetorFiltro(null));
    expect(result.current.equipesDoSetor).toHaveLength(2);
  });

  it('falha no banco não quebra a tela — devolve listas vazias', async () => {
    fromSpy.mockImplementation(() => { throw new Error('banco fora'); });
    const { result } = renderHook(() => useSetoresEquipes());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.setores).toEqual([]);
    expect(result.current.equipesDoSetor).toEqual([]);
  });
});
