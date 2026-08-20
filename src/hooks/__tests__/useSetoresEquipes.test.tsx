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
import { renderHook, waitFor } from '@testing-library/react';

const { perfilRef, empresaRef, permissaoRef, fromSpy } = vi.hoisted(() => ({
  perfilRef:    { current: { perfil: 'lider', setor_id: 'setor-1' } as Record<string, unknown> | null },
  empresaRef:   { current: { id: 'emp-1' } as { id: string } | null },
  permissaoRef: { current: false },
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
  useCargoPermissoes: () => ({
    temPermissao: (chave: string) => {
      const cargo = perfilRef.current?.perfil;
      if (chave === 'ver_todos_setores') return permissaoRef.current || cargo === 'administrador';
      if (chave === 'filtrar_por_setor') return permissaoRef.current || cargo === 'administrador';
      if (chave === 'filtrar_por_equipe') return cargo === 'lider';
      return false;
    },
  }),
}));
vi.mock('@/lib/supabase', () => ({
  supabase: { from: (tabela: string) => fromSpy(tabela) },
}));

const { useSetoresEquipes } = await import('@/hooks/useSetoresEquipes');

/** Construtor encadeável que devolve `linhas` no `.order()`. */
function construtor(linhas: { id: string; nome: string }[]) {
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
  permissaoRef.current = false;
  fromSpy.mockReset();
  fromSpy.mockImplementation((tabela: string) =>
    construtor(tabela === 'equipes'
      ? [{ id: 'eq-1', nome: 'Equipe A' }]
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

describe('useSetoresEquipes — o que cada cargo enxerga', () => {
  it('líder sem "ver_todos_setores" não recebe lista de setores, só as equipes', async () => {
    const { result } = renderHook(() => useSetoresEquipes());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.setores).toEqual([]);
    expect(result.current.equipesDoSetor).toHaveLength(1);
    expect(fromSpy).not.toHaveBeenCalledWith('setores');
  });

  it('líder com "ver_todos_setores" recebe as duas listas', async () => {
    permissaoRef.current = true;
    const { result } = renderHook(() => useSetoresEquipes());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.setores).toHaveLength(1);
    expect(result.current.equipesDoSetor).toHaveLength(1);
  });

  it('administrador recebe os setores e nenhuma equipe', async () => {
    perfilRef.current = { perfil: 'administrador', setor_id: null };
    const { result } = renderHook(() => useSetoresEquipes());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.setores).toHaveLength(1);
    expect(result.current.equipesDoSetor).toEqual([]);
  });

  it('operador não consulta nada', async () => {
    perfilRef.current = { perfil: 'operador', setor_id: 'setor-1' };
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

  it('falha no banco não quebra a tela — devolve listas vazias', async () => {
    fromSpy.mockImplementation(() => { throw new Error('banco fora'); });
    const { result } = renderHook(() => useSetoresEquipes());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.setores).toEqual([]);
    expect(result.current.equipesDoSetor).toEqual([]);
  });
});
