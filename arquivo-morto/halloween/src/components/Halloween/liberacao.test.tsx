/**
 * liberacao.test.tsx — o botão «Liberar o Halloween para todos», de ponta a
 * ponta no navegador: o super_admin confirma, o banco grava, o sinal chega a
 * quem está logado e a mensagem de outubro fica pendente para essa pessoa.
 *
 * O banco é falso; o que se prova aqui é o lado da tela. O lado do banco é a
 * migration 20261001140000.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, renderHook, waitFor } from '@testing-library/react';
import type { SinalMudou, OuvinteSinal } from '@/lib/sinais';

const banco = vi.hoisted(() => ({
  linha: null as { liberado_em: string } | null,
  erroLeitura: null as { message: string } | null,
  erroRpc: null as { message: string } | null,
  leituras: 0,
  rpcs: [] as string[],
  ouvintes: new Map<string, OuvinteSinal>(),
}));

vi.mock('@/lib/supabase', () => {
  const consulta = () => {
    const q = {
      select: () => q,
      limit: () => q,
      maybeSingle: () => q,
      then: (ok: (r: unknown) => unknown, falha?: (e: unknown) => unknown) => {
        banco.leituras += 1;
        return Promise.resolve({ data: banco.linha, error: banco.erroLeitura }).then(ok, falha);
      },
    };
    return q;
  };
  return {
    supabase: {
      from: () => consulta(),
      rpc: (nome: string) => {
        banco.rpcs.push(nome);
        if (banco.erroRpc) return Promise.resolve({ data: null, error: banco.erroRpc });
        banco.linha ??= { liberado_em: '2026-10-01T15:00:00Z' };
        return Promise.resolve({ data: banco.linha.liberado_em, error: null });
      },
    },
  };
});

vi.mock('@/lib/sinais', () => ({
  assinarSinal: (nome: string, empresa: string, ouvinte: OuvinteSinal) => {
    banco.ouvintes.set(`${nome}:${empresa}`, ouvinte);
    return () => { banco.ouvintes.delete(`${nome}:${empresa}`); };
  },
}));

vi.mock('@/hooks/useEmpresa', () => ({ useEmpresa: () => ({ empresa: { id: 'emp-1' } }) }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('@/lib/index', async (original) => ({
  ...(await original<typeof import('@/lib/index')>()),
  getTodayISO: () => '2026-10-01',
}));

/** O módulo guarda o estado da liberação: cada caso começa de um zerado. */
async function carregarModulos() {
  vi.resetModules();
  const liberacao = await import('./liberacao');
  const { default: Cartao } = await import('@/components/admin/LiberacaoHalloween');
  const { toast } = await import('sonner');
  return { ...liberacao, Cartao, toast };
}

const sinal = (tabela: string): SinalMudou => ({ tabela, operacao: 'INSERT', importado_por: [] });

beforeEach(() => {
  banco.linha = null;
  banco.erroLeitura = null;
  banco.erroRpc = null;
  banco.leituras = 0;
  banco.rpcs = [];
  banco.ouvintes.clear();
  // A resposta fica guardada no navegador (09/10/2026): cada caso começa sem ela.
  localStorage.clear();
});

describe('Liberar o Halloween para todos', () => {
  it('confirmar chama o banco uma vez, avisa e o cartão some', async () => {
    const { Cartao, toast } = await carregarModulos();
    render(<Cartao />);
    await waitFor(() => expect(banco.leituras).toBeGreaterThan(0));

    fireEvent.click(screen.getByRole('button', { name: /Liberar o Halloween para todos/ }));
    expect(banco.rpcs).toEqual([]); // só abre a confirmação
    expect(screen.getByText('Liberar o Halloween para todos?')).toBeInTheDocument();

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Liberar agora' })); });

    expect(banco.rpcs).toEqual(['fn_halloween_liberar']);
    expect(toast.success).toHaveBeenCalledWith('Halloween liberado 🎃', expect.anything());
    await waitFor(() => expect(screen.queryByText(/Halloween — pré-estreia/)).toBeNull());
  });

  it('«Ainda não» fecha sem liberar', async () => {
    const { Cartao } = await carregarModulos();
    render(<Cartao />);
    fireEvent.click(screen.getByRole('button', { name: /Liberar o Halloween para todos/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Ainda não' }));
    expect(banco.rpcs).toEqual([]);
    expect(screen.getByText(/Halloween — pré-estreia/)).toBeInTheDocument();
  });

  it('banco recusa (sem a função, ou sem permissão): mostra o erro e o cartão fica', async () => {
    banco.erroRpc = { message: 'Could not find the function public.fn_halloween_liberar' };
    const { Cartao, toast } = await carregarModulos();
    render(<Cartao />);
    fireEvent.click(screen.getByRole('button', { name: /Liberar o Halloween para todos/ }));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Liberar agora' })); });

    expect(toast.error).toHaveBeenCalledWith('Não foi possível liberar o Halloween', {
      description: 'Could not find the function public.fn_halloween_liberar',
    });
    expect(screen.getByText(/Halloween — pré-estreia/)).toBeInTheDocument();
  });

  it('já liberado: o cartão nem aparece', async () => {
    banco.linha = { liberado_em: '2026-10-01T15:00:00Z' };
    const { Cartao } = await carregarModulos();
    render(<Cartao />);
    await waitFor(() => expect(screen.queryByText(/Halloween — pré-estreia/)).toBeNull());
  });
});

describe('quem está logado quando o Halloween é liberado', () => {
  it('recebe o sinal da empresa, relê e passa a ver o tema', async () => {
    const { useHalloweenLiberado } = await carregarModulos();
    const { result } = renderHook(() => useHalloweenLiberado('emp-1'));
    await waitFor(() => expect(banco.leituras).toBe(1));
    expect(result.current).toBe(false);

    // Outro sinal do mesmo tópico (permissão de cargo) não relê o Halloween.
    act(() => banco.ouvintes.get('permissoes:emp-1')?.onMudou?.(sinal('cargo_permissoes')));
    expect(banco.leituras).toBe(1);

    // O super_admin liberou em outra máquina.
    banco.linha = { liberado_em: '2026-10-01T15:00:00Z' };
    await act(async () => { banco.ouvintes.get('permissoes:emp-1')?.onMudou?.(sinal('halloween_liberacao')); });
    await waitFor(() => expect(result.current).toBe(true));
  });

  it('canal caiu e voltou no meio da liberação: relê e não perde', async () => {
    const { useHalloweenLiberado } = await carregarModulos();
    const { result } = renderHook(() => useHalloweenLiberado('emp-1'));
    await waitFor(() => expect(banco.leituras).toBe(1));
    banco.linha = { liberado_em: '2026-10-01T15:00:00Z' };
    await act(async () => { banco.ouvintes.get('permissoes:emp-1')?.onReconectado?.(); });
    await waitFor(() => expect(result.current).toBe(true));
  });

  it('tabela ausente (migration não aplicada) = não liberado, sem quebrar', async () => {
    banco.erroLeitura = { message: 'relation "public.halloween_liberacao" does not exist' };
    const { useHalloweenLiberado } = await carregarModulos();
    const { result } = renderHook(() => useHalloweenLiberado('emp-1'));
    await waitFor(() => expect(banco.leituras).toBe(1));
    expect(result.current).toBe(false);
  });

  it('liberado fica guardado no navegador: a próxima página nem pergunta', async () => {
    banco.linha = { liberado_em: '2026-10-01T15:00:00Z' };
    const primeira = await carregarModulos();
    const a = renderHook(() => primeira.useHalloweenLiberado('emp-1'));
    await waitFor(() => expect(a.result.current).toBe(true));
    expect(banco.leituras).toBe(1);

    // Outra carga de página (módulo novo): responde do guardado.
    const segunda = await carregarModulos();
    const b = renderHook(() => segunda.useHalloweenLiberado('emp-1'));
    await waitFor(() => expect(b.result.current).toBe(true));
    expect(banco.leituras).toBe(1);
  });

  it('«ainda não» guardado vale 5 min; depois pergunta de novo', async () => {
    const agora = Date.now();
    localStorage.setItem('halloween:liberacao', JSON.stringify({ liberadoEm: null, em: agora - 60_000 }));
    const m1 = await carregarModulos();
    renderHook(() => m1.useHalloweenLiberado('emp-1'));
    await act(async () => { await Promise.resolve(); });
    expect(banco.leituras).toBe(0);

    localStorage.setItem('halloween:liberacao', JSON.stringify({ liberadoEm: null, em: agora - 6 * 60_000 }));
    const m2 = await carregarModulos();
    renderHook(() => m2.useHalloweenLiberado('emp-1'));
    await waitFor(() => expect(banco.leituras).toBe(1));
  });

  it('a mensagem de outubro fica pendente para quem ainda não viu e não desligou', async () => {
    const { resolverHalloween, podeVerHalloween } = await import('./preferencia');
    const base = { temporada: true, localDesligado: null, localBoasVindas: null, perfilDesligado: false, perfilBoasVindas: null };
    // Antes: operador não vê nada.
    expect(resolverHalloween({ ...base, podeVer: podeVerHalloween('operador', false) }))
      .toMatchObject({ ligado: false, boasVindasPendentes: false });
    // Depois de liberar: tema ligado e mensagem pendente.
    expect(resolverHalloween({ ...base, podeVer: podeVerHalloween('operador', true) }))
      .toMatchObject({ ligado: true, boasVindasPendentes: true });
    // Quem já viu (o super_admin que validou) não recebe de novo.
    expect(resolverHalloween({ ...base, podeVer: true, perfilBoasVindas: '2026-10-01T12:00:00Z' }))
      .toMatchObject({ ligado: true, boasVindasPendentes: false });
  });
});
