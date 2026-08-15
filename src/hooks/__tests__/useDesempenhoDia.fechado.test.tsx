/**
 * useDesempenhoDia.fechado.test.tsx
 *
 * Desde que o painel deixou de ser exclusivo da PaguePlay, ele é MONTADO em toda
 * página do sistema — o `AnimatePresence` esconde o conteúdo, mas a função do
 * componente roda igual, e com ela os hooks.
 *
 * Sem trava, abrir qualquer tela disparava a leitura de 15 dias de analítico
 * (até 12 páginas de 1.000 linhas) para um painel que ninguém pediu. Era esse
 * trabalho competindo com o resto que deixava a navegação pesada.
 *
 * Este teste fixa a trava. Se alguém remover o `if (!aberto) return`, ele quebra.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const chamadas = vi.hoisted(() => ({
  analitico: vi.fn(),
  acordos: vi.fn(),
  formalizados: vi.fn(),
  pix: vi.fn(),
  meta: vi.fn(),
  escopo: vi.fn(),
}));

vi.mock('@/services/desempenhoDia/desempenhoDia.service', async () => {
  const real = await vi.importActual<
    typeof import('@/services/desempenhoDia/desempenhoDia.service')
  >('@/services/desempenhoDia/desempenhoDia.service');
  return {
    ...real,
    buscarAnaliticoPeriodo: (...a: unknown[]) => {
      chamadas.analitico(...a);
      return Promise.resolve({ linhas: [], erro: null });
    },
    buscarAcordosDoDia: (...a: unknown[]) => {
      chamadas.acordos(...a);
      return Promise.resolve({ acordos: [], erro: null });
    },
    contarFormalizadosDoDia: (...a: unknown[]) => {
      chamadas.formalizados(...a);
      return Promise.resolve(0);
    },
    buscarPixDoDia: (...a: unknown[]) => {
      chamadas.pix(...a);
      return Promise.resolve([]);
    },
    buscarMetaDoEscopo: (...a: unknown[]) => {
      chamadas.meta(...a);
      return Promise.resolve(null);
    },
    // Também é consulta ao banco: fechado, nem o escopo deve ser resolvido.
    resolverEscopoDoDia: (...a: unknown[]) => {
      chamadas.escopo(...a);
      return Promise.resolve({
        escopo: { tipo: 'operador' as const, operadorId: 'u-1' },
        rotulo: 'Os seus números',
        operadorId: 'u-1',
        setorId: null,
      });
    },
  };
});

vi.mock('@/services/metas/metasConfig.service', () => ({
  getMetasConfig: () => Promise.resolve({ data: null, dbAtiva: true }),
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ perfil: { id: 'u-1', perfil: 'operador', setor_id: 's-1' } }),
}));
vi.mock('@/hooks/useEmpresa', () => ({
  useEmpresa: () => ({ empresa: { id: 'e-1' }, tenantSlug: 'bookplay' }),
}));
vi.mock('@/hooks/useCargoPermissoes', () => ({
  useCargoPermissoes: () => ({ temPermissao: () => false }),
}));
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => {
      throw new Error('nenhuma consulta direta deveria sair daqui no teste');
    },
  },
}));

import { useDesempenhoDia } from '../useDesempenhoDia';

const BASE = {
  dia: '2026-08-14',
  unidade: 'bruto' as const,
  temLogicaDiretoExtra: false,
  isPaguePlay: false,
  tags: [],
};

beforeEach(() => {
  for (const fn of Object.values(chamadas)) fn.mockClear();
});

describe('useDesempenhoDia — fechado não consulta nada', () => {
  it('não dispara nenhuma leitura com o painel fechado', async () => {
    renderHook(() => useDesempenhoDia({ ...BASE, aberto: false }));

    // Espaço para qualquer efeito assíncrono que fosse escapar.
    await new Promise(r => setTimeout(r, 20));

    expect(chamadas.escopo).not.toHaveBeenCalled();
    expect(chamadas.analitico).not.toHaveBeenCalled();
    expect(chamadas.acordos).not.toHaveBeenCalled();
    expect(chamadas.formalizados).not.toHaveBeenCalled();
    expect(chamadas.pix).not.toHaveBeenCalled();
    expect(chamadas.meta).not.toHaveBeenCalled();
  });

  it('aberto, busca uma vez', async () => {
    renderHook(() => useDesempenhoDia({ ...BASE, aberto: true }));
    await waitFor(() => expect(chamadas.analitico).toHaveBeenCalledTimes(1));
    expect(chamadas.acordos).toHaveBeenCalledTimes(1);
  });

  /**
   * Fechado, `carregando` NÃO vira false: se virasse, a primeira abertura
   * mostraria «nenhum acordo» por um quadro — um vazio com cara de resposta.
   */
  it('fechado mantém o estado de carregando, para não piscar vazio', async () => {
    const { result } = renderHook(() => useDesempenhoDia({ ...BASE, aberto: false }));
    await new Promise(r => setTimeout(r, 20));
    expect(result.current.carregando).toBe(true);
  });
});
