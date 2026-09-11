/**
 * useMinhaComissao.test.tsx — de onde vem o realizado do painel do operador.
 *
 * A regressão que este arquivo segura: o painel lia
 * `fn_analitico_resumo_por_operador`, que devolve VAZIO, sem erro, para quem não
 * tem a chave do Ranking. O operador via R$ 0,00 e «Nenhuma faixa ainda» — a
 * comissão que o card do Dashboard mostrava tinha sumido.
 *
 * O realizado vem das próprias linhas do agregado do Dashboard, a mesma base do
 * card de antes. Aqui o resumo por operador volta vazio de propósito.
 */
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnaliticoDashboardLinha } from '@/lib/supabase';

const mock = vi.hoisted(() => ({
  isPaguePlay: false,
  linhas: [] as unknown[],
  meta: null as unknown,
  config: {
    id: 'cfg', empresaId: 'e1', setorId: 's1', equipeId: null, ano: 2026, mes: 9,
    modoIndireta: 'junto', pctIndireta: null, pctIndiretaEspecial: null,
    regraSetor: 'nenhuma', multiplicador: null,
    setorMetaConfirmadaEm: null, setorMetaConfirmadaPor: null, setorMetaConfirmadaPorNome: null,
    faixas: [
      { ordem: 1, pct: 1.75, pctEspecial: null },
      { ordem: 2, pct: 2.11, pctEspecial: null },
      { ordem: 3, pct: 3.30, pctEspecial: null },
      { ordem: 4, pct: 4.03, pctEspecial: null },
    ],
  },
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ perfil: { id: 'op1', setor_id: 's1', equipe_id: 'eq1', nome: 'Ana' } }),
}));

vi.mock('@/hooks/useEmpresa', () => ({
  useEmpresa: () => ({ empresa: { id: 'e1' } }),
}));

vi.mock('@/hooks/useCargoPermissoes', () => ({
  useCargoPermissoes: () => ({ temPermissao: (chave: string) => chave === 'dashboard_comissao' }),
}));

vi.mock('@/lib/tenant-config', () => ({
  useTenant: () => ({ isPaguePlay: mock.isPaguePlay }),
}));

vi.mock('@/lib/supabase', () => {
  const cadeia = {
    select: () => cadeia,
    eq: () => cadeia,
    maybeSingle: async () => ({ data: mock.meta, error: null }),
  };
  return { supabase: { from: () => cadeia, rpc: vi.fn() } };
});

// Quem não tem a chave do Ranking recebe isto: nenhuma linha, e nenhum erro.
vi.mock('@/services/analitico/analitico.service', () => ({
  buscarResumoOperadoresAnalitico: vi.fn(async () => ({ data: [], error: null })),
  buscarAnaliticoDashboardMes: vi.fn(async () => ({ data: [], dbAtiva: true, error: null })),
}));

vi.mock('@/hooks/useAnaliticoDashboard', async importOriginal => ({
  ...(await importOriginal<typeof import('@/hooks/useAnaliticoDashboard')>()),
  useAnaliticoDashboard: () => ({
    linhas: mock.linhas, total: null, carregado: true, dbAtiva: true, refetch: async () => {},
  }),
}));

vi.mock('@/services/metas/recebimentoIndireto.service', () => ({
  buscarRecebimentoIndireto: vi.fn(async () => ({})),
}));

vi.mock('./useConfigsComissao', () => ({
  useConfigsComissao: () => ({
    configs: [mock.config], dbAtiva: true, carregado: true, recarregar: () => {},
  }),
}));

import { useMinhaComissao } from './useMinhaComissao';

function linha(over: Partial<AnaliticoDashboardLinha>): AnaliticoDashboardLinha {
  return {
    dia: '2026-09-05', operador_id: 'op1', setor_id: 's1',
    forma_pagamento: 'boleto_pix', forma_detalhe: null, status_tabulacao: 'tabulado',
    total: 0, total_ho: 0, qtd: 1,
    ...over,
  };
}

async function calcular() {
  const { result } = renderHook(() => useMinhaComissao({ aberto: true, mes: '2026-09' }));
  await waitFor(() => expect(result.current.resultado).not.toBeNull());
  return result.current.resultado;
}

beforeEach(() => {
  mock.isPaguePlay = false;
  mock.meta = {
    tipo: 'operador', referencia_id: 'op1',
    meta_valor: 34_000, metas_extras: [37_000, 40_000, 43_000],
  };
  mock.linhas = [
    linha({ dia: '2026-09-02', total: 20_000, total_ho: 4_992 }),
    linha({ dia: '2026-09-05', total: 18_450, total_ho: 4_605.12 }),
    // De outra pessoa. Para o líder o Dashboard traz a empresa toda, e o painel
    // é da comissão de quem está logado.
    linha({ operador_id: 'op2', total: 90_000, total_ho: 22_464 }),
  ];
});

describe('useMinhaComissao — o realizado', () => {
  it('vem das próprias linhas do Dashboard, mesmo com o resumo por operador vazio', async () => {
    const r = await calcular();
    expect(r?.recebido).toBe(38_450);
    expect(r?.atual?.ordem).toBe(2);
    expect(r?.total).toBe(811.3);
  });

  it('na PaguePlay, soma o H.O. das próprias linhas', async () => {
    mock.isPaguePlay = true;
    // 36.000 × 24,96% = R$ 8.985,60 de meta em H.O.
    mock.meta = { tipo: 'operador', referencia_id: 'op1', meta_valor: 36_000, metas_extras: [] };
    const r = await calcular();
    expect(r?.recebido).toBe(9_597.12);
    expect(r?.atual?.ordem).toBe(1);
  });
});
