/**
 * usePainelMetas — o que ESTE hook decide.
 *
 * `useAnaliticoDashboard` e `useEscopoAnalitico` são mockados de propósito: eles
 * têm testes próprios, e o que interessa aqui é a precedência da meta, o gate do
 * Direto/Extra, os dias úteis e o `carregando` que segura a tela.
 *
 * Data fixada em 11/08/2026 — agosto/2026 tem 21 dias úteis e 6 decorridos com
 * `contar_dia_atual = false`, que é o cenário da print de referência.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

// ─"?─"? vi.hoisted ─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?

const {
  perfilRef, empresaRef, tenantRef,
  analiticoRef, escopoRef, configRef, rankingRef, diretoExtraSpy, agendadoSpy, rpcSpy,
} = vi.hoisted(() => ({
  perfilRef:   { current: null as unknown },
  empresaRef:  { current: null as unknown },
  tenantRef:   { current: { slug: 'bookplay', isPaguePlay: false } },
  analiticoRef: { current: null as unknown },
  escopoRef:    { current: null as unknown },
  configRef:    { current: null as unknown },
  rankingRef:   { current: [] as unknown[] },
  diretoExtraSpy: vi.fn(),
  agendadoSpy:    vi.fn(),
  rpcSpy:         vi.fn(),
}));

// ─"?─"? Mocks ─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?

vi.mock('@/hooks/useAuth',    () => ({ useAuth:    () => ({ perfil:  perfilRef.current }) }));
vi.mock('@/hooks/useEmpresa', () => ({ useEmpresa: () => ({ empresa: empresaRef.current }) }));
vi.mock('@/lib/tenant-config', () => ({ useTenant: () => tenantRef.current }));

vi.mock('@/hooks/useAnaliticoDashboard', async () => {
  const real = await vi.importActual<typeof import('@/hooks/useAnaliticoDashboard')>(
    '@/hooks/useAnaliticoDashboard',
  );
  return { ...real, useAnaliticoDashboard: () => analiticoRef.current };
});

vi.mock('@/hooks/useEscopoAnalitico', () => ({
  useEscopoAnalitico: () => escopoRef.current,
}));

vi.mock('@/services/metas/metasConfig.service', () => ({
  getMetasConfig: () => Promise.resolve({ data: configRef.current, dbAtiva: true }),
}));

vi.mock('@/services/analitico/diretoExtra.service', () => ({
  buscarDiretoExtraDoMes: (p: unknown) => {
    diretoExtraSpy(p);
    return Promise.resolve({
      direto: 37_870.98, extra: 27_740.64, naoTabulado: 0,
      qtdDireto: 40, qtdExtra: 12, qtdNaoTabulado: 0,
    });
  },
  buscarAgendadoPorDia: (p: unknown) => {
    agendadoSpy(p);
    return Promise.resolve([{ dia: 12, agendado: 5_000 }]);
  },
}));

// ─"?─"? supabase: fila FIFO por tabela ─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?

type MockResult = { data: unknown; error: { message: string } | null };
const filas: Record<string, MockResult[]> = {};
const VAZIO: MockResult = { data: null, error: null };

function proximo(tabela: string): MockResult {
  return filas[tabela]?.shift() ?? VAZIO;
}
function enfileirar(tabela: string, r: MockResult) {
  (filas[tabela] ??= []).push(r);
}

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (tabela: string) => {
      const b: Record<string, unknown> = {};
      const chain = () => b;
      for (const m of ['select', 'eq', 'in', 'gte', 'lte', 'order', 'limit', 'range']) {
        b[m] = vi.fn(chain);
      }
      b.maybeSingle = vi.fn(() => Promise.resolve(proximo(tabela)));
      b.then = (res: (v: MockResult) => unknown) => Promise.resolve(proximo(tabela)).then(res);
      return b;
    },
    // Existe para o teste PROVAR que este hook não chama RPC nenhuma. O
    // ranking é do MetaProgressoHeader, não daqui.
    rpc: rpcSpy,
  },
}));

// ─"?─"? SUT ─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?

import { usePainelMetas, type ParametrosPainelMetas } from '../usePainelMetas';

const EMPRESA = 'emp-1';
const EU      = 'op-1';
const EQUIPE  = 'eq-1';

/** Linha no formato que `fn_analitico_dashboard_mes` devolve. */
function linha(dia: number, total: number, qtd = 1, over: Record<string, unknown> = {}) {
  return {
    dia: `2026-08-${String(dia).padStart(2, '0')}`,
    operador_id: EU,
    setor_id: 'set-1',
    forma_pagamento: 'boleto_pix',
    forma_detalhe: 'Pix',
    status_tabulacao: 'tabulado',
    total, total_ho: 0, qtd,
    ...over,
  };
}

/** `agregarAnalitico` roda de verdade sobre estas linhas — o mock é só do fetch. */
const LINHAS_PADRAO = [
  linha(1,  611.62,   3),
  linha(8,  10_789.01, 40),
  linha(10, 18_384.11, 121),
  linha(11, 4_667.80,  12),
];

function linhasAnalitico(carregado = true, linhas: unknown[] = LINHAS_PADRAO) {
  return {
    linhas, carregado, dbAtiva: true,
    total: { porOperador: {} }, refetch: vi.fn(),
  };
}

function paramsBase(over: Partial<ParametrosPainelMetas> = {}): ParametrosPainelMetas {
  return { mes: '2026-08', ...over };
}

beforeEach(() => {
  vi.setSystemTime(new Date('2026-08-11T12:00:00Z'));
  for (const k of Object.keys(filas)) delete filas[k];
  rankingRef.current = [];
  diretoExtraSpy.mockClear();
  agendadoSpy.mockClear();
  rpcSpy.mockClear();

  empresaRef.current = { id: EMPRESA, nome: 'Empresa' };
  perfilRef.current  = { id: EU, perfil: 'operador', setor_id: 'set-1', equipe_id: null };
  tenantRef.current  = { slug: 'bookplay', isPaguePlay: false };
  analiticoRef.current = linhasAnalitico();
  escopoRef.current = {
    escopo: { tipo: 'operador', operadorId: EU },
    fontes: { operadorEquipeMap: {}, equipesExtrasPorOperador: {}, setorDaEquipe: new Map(), setoresAlternativos: new Set() },
    carimboDisponivel: true,
    pendente: false,
  };
  configRef.current = { feriados: [], quartis: [], contar_dia_atual: false };
});

afterEach(() => { vi.useRealTimers(); });

// ─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?

describe('usePainelMetas — carregando', () => {
  it('segura a tela enquanto o escopo está pendente', async () => {
    escopoRef.current = { escopo: null, fontes: null, carimboDisponivel: false, pendente: true };
    const { result } = renderHook(() => usePainelMetas(paramsBase()));
    expect(result.current.carregando).toBe(true);
  });

  it('segura a tela enquanto o analítico não chegou', async () => {
    analiticoRef.current = linhasAnalitico(false, []);
    const { result } = renderHook(() => usePainelMetas(paramsBase()));
    expect(result.current.carregando).toBe(true);
  });

  it('libera quando tudo chegou', async () => {
    const { result } = renderHook(() => usePainelMetas(paramsBase()));
    await waitFor(() => expect(result.current.carregando).toBe(false));
  });

  /**
   * Regressão de 11/08/2026: o painel do LÍDER carregava e o do OPERADOR ficava
   * no esqueleto para sempre.
   *
   * Causa: `carregando` esperava por `fontes`. `useEscopoAnalitico` resolve as
   * fontes com `.then()` sem `.catch()`, e `buscarFontesDeEscopo` lê `equipes`
   * e `perfis` — leitura que a RLS nega ao operador. Rejeitada a promessa,
   * `fontes` fica `null` para sempre.
   *
   * O escopo de operador não depende das fontes; só equipe e setor dependem, e
   * para esses `escopoPendente` já é `true`.
   */
  it('operador carrega mesmo com as fontes de escopo indisponíveis', async () => {
    escopoRef.current = {
      escopo: { tipo: 'operador', operadorId: EU },
      fontes: null,                 // RLS negou a leitura — nunca vai chegar
      carimboDisponivel: true,
      pendente: false,
    };
    const { result } = renderHook(() => usePainelMetas(paramsBase()));
    await waitFor(() => expect(result.current.carregando).toBe(false));
    expect(result.current.totalRecebido).toBeGreaterThan(0);
  });

  it('escopo de equipe continua esperando — ele PRECISA das fontes', () => {
    escopoRef.current = { escopo: null, fontes: null, carimboDisponivel: true, pendente: true };
    const { result } = renderHook(() =>
      usePainelMetas(paramsBase({ setorId: 'set-1', equipeId: EQUIPE })));
    expect(result.current.carregando).toBe(true);
  });
});

describe('usePainelMetas — dias úteis', () => {
  it('agosto/2026 dá 21 totais e 6 decorridos sem contar o dia atual', async () => {
    const { result } = renderHook(() => usePainelMetas(paramsBase()));
    await waitFor(() => expect(result.current.carregando).toBe(false));
    expect(result.current.diasUteisTotal).toBe(21);
    expect(result.current.diasUteisPassados).toBe(6);
  });

  it('restantes é sempre total menos passados', async () => {
    const { result } = renderHook(() => usePainelMetas(paramsBase()));
    await waitFor(() => expect(result.current.carregando).toBe(false));
    const { diasUteisTotal: t, diasUteisPassados: p, diasUteisRestantes: r } = result.current;
    expect(r).toBe(t - p);
  });

  it('feriado em dia útil reduz o total', async () => {
    configRef.current = { feriados: ['2026-08-17'], quartis: [], contar_dia_atual: false };
    const { result } = renderHook(() => usePainelMetas(paramsBase()));
    await waitFor(() => expect(result.current.diasUteisTotal).toBe(20));
  });

  it('feriado em fim de semana não reduz o total', async () => {
    configRef.current = { feriados: ['2026-08-15'], quartis: [], contar_dia_atual: false };
    const { result } = renderHook(() => usePainelMetas(paramsBase()));
    await waitFor(() => expect(result.current.carregando).toBe(false));
    expect(result.current.diasUteisTotal).toBe(21);
  });

  it('mês fechado: passados iguala o total e restantes zera', async () => {
    const { result } = renderHook(() => usePainelMetas(paramsBase({ mes: '2026-07' })));
    await waitFor(() => expect(result.current.carregando).toBe(false));
    expect(result.current.diasUteisPassados).toBe(result.current.diasUteisTotal);
    expect(result.current.diasUteisRestantes).toBe(0);
    expect(result.current.noMesAtual).toBe(false);
  });
});

describe('usePainelMetas — meta', () => {
  it('modo "eu" usa a meta do tipo operador', async () => {
    enfileirar('metas', { data: { meta_valor: 130_000 }, error: null });
    const { result } = renderHook(() => usePainelMetas(paramsBase()));
    await waitFor(() => expect(result.current.meta).toBe(130_000));
  });

  it('sem meta cadastrada devolve null — e projeção null junto', async () => {
    const { result } = renderHook(() => usePainelMetas(paramsBase()));
    await waitFor(() => expect(result.current.carregando).toBe(false));
    expect(result.current.meta).toBeNull();
    expect(result.current.projecao).toBeNull();
  });

  it('projeção usa a mesma conta de calcularProjecao', async () => {
    enfileirar('metas', { data: { meta_valor: 130_000 }, error: null });
    const { result } = renderHook(() => usePainelMetas(paramsBase()));
    await waitFor(() => expect(result.current.projecao).not.toBeNull());
    // 130.000 ÷ 21 ─- 6 = 37.142,857─?─
    expect(result.current.projecao!.esperado).toBeCloseTo(37_142.857, 2);
  });
});

/**
 * O escopo do painel N─fO tem alternador próprio: ele segue os filtros do
 * Dashboard, os mesmos que recortam a tabela de acordos e o painel de métricas.
 * Duas barras "Visualizar:" na mesma tela permitiam duas verdades ao mesmo tempo.
 */
describe('usePainelMetas — escopo vem dos filtros do Dashboard', () => {
  const EQUIPES_RECEPTIVO = [
    { id: 'eq-bryan',   nome: 'Bryan',   setor_id: 'set-1', treinamento: false, treinamento_inicio: null },
    { id: 'eq-luciana', nome: 'Luciana', setor_id: 'set-1', treinamento: false, treinamento_inicio: null },
    { id: EQUIPE,       nome: 'Matheus', setor_id: 'set-1', treinamento: false, treinamento_inicio: null },
  ];

  function comoLider() {
    perfilRef.current = { id: 'lid-1', perfil: 'lider', setor_id: 'set-1', equipe_id: null };
    enfileirar('equipes', { data: EQUIPES_RECEPTIVO, error: null });
  }

  it('operador com setor travado ainda assim fica no escopo pessoal', async () => {
    // O Dashboard trava `setorFiltro` no setor do operador. Sem a checagem de
    // cargo, ele cairia no escopo de setor e veria a meta do setor.
    const { result } = renderHook(() => usePainelMetas(paramsBase({ setorId: 'set-1' })));
    await waitFor(() => expect(result.current.carregando).toBe(false));
    expect(result.current.escopoRotulo).toBe('individual');
    expect(result.current.modoAgregado).toBe(false);
  });

  it('líder sem equipe escolhida soma o setor', async () => {
    comoLider();
    const { result } = renderHook(() => usePainelMetas(paramsBase({ setorId: 'set-1' })));
    await waitFor(() => expect(result.current.escopoRotulo).toBe('do setor'));
    expect(result.current.modoAgregado).toBe(true);
  });

  it('equipe escolhida no Dashboard nomeia o escopo', async () => {
    comoLider();
    const { result } = renderHook(() => usePainelMetas(
      paramsBase({ setorId: 'set-1', equipeId: EQUIPE })));
    await waitFor(() => expect(result.current.escopoRotulo).toBe('da equipe Matheus'));
    expect(result.current.modoAgregado).toBe(true);
  });

  it('operador escolhido vence a equipe — mesma ordem do useEscopoAnalitico', async () => {
    comoLider();
    const { result } = renderHook(() => usePainelMetas(
      paramsBase({ setorId: 'set-1', equipeId: EQUIPE, operadorId: 'op-x' })));
    await waitFor(() => expect(result.current.carregando).toBe(false));
    expect(result.current.escopoRotulo).toBe('individual');
    expect(result.current.modoAgregado).toBe(false);
  });

  it('equipe em treinamento corta os dias anteriores ao início', async () => {
    perfilRef.current = { id: 'lid-1', perfil: 'lider', setor_id: 'set-1', equipe_id: null };
    enfileirar('equipes', {
      data: [{ id: EQUIPE, nome: 'Novatos', setor_id: 'set-1', treinamento: true, treinamento_inicio: '2026-08-17' }],
      error: null,
    });
    const { result } = renderHook(() => usePainelMetas(
      paramsBase({ setorId: 'set-1', equipeId: EQUIPE })));
    // Dias úteis a partir de 17/08: 17..21, 24..28, 31 = 11
    await waitFor(() => expect(result.current.diasUteisTotal).toBe(11));
    expect(result.current.diasUteisPassados).toBe(0);
  });
});

describe('usePainelMetas — ranking NÃO é responsabilidade deste hook', () => {
  /**
   * O ranking é do `MetaProgressoHeader`, abaixo da saudação. Eu cheguei a
   * duplicá-lo aqui; o resultado seria a MESMA `fn_analitico_resumo_por_operador`
   * chamada duas vezes para mostrar o mesmo número duas vezes na tela.
   */
  it('não chama RPC nenhuma no escopo pessoal', async () => {
    const { result } = renderHook(() => usePainelMetas(paramsBase()));
    await waitFor(() => expect(result.current.carregando).toBe(false));
    expect(rpcSpy).not.toHaveBeenCalled();
  });
});

describe('usePainelMetas — Direto/Extra', () => {
  it('sem a lógica ativa não busca nada e devolve null', async () => {
    const { result } = renderHook(() => usePainelMetas(paramsBase()));
    await waitFor(() => expect(result.current.carregando).toBe(false));
    expect(result.current.diretoExtra).toBeNull();
    expect(diretoExtraSpy).not.toHaveBeenCalled();
  });

  it('com a lógica ativa entrega o MESMO escopo do total, não uma lista à mão', async () => {
    const { result } = renderHook(() =>
      usePainelMetas(paramsBase({ temLogicaDiretoExtra: true })));
    await waitFor(() => expect(result.current.diretoExtra).not.toBeNull());
    expect(result.current.diretoExtra!.direto).toBe(37_870.98);
    expect(diretoExtraSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        empresaId: EMPRESA,
        mes: '2026-08',
        escopo: { tipo: 'operador', operadorId: EU },
      }),
    );
  });
});

describe('usePainelMetas — total e baixa anterior', () => {
  it('total recebido é a soma do agregado do analítico', async () => {
    const { result } = renderHook(() => usePainelMetas(paramsBase()));
    await waitFor(() => expect(result.current.carregando).toBe(false));
    expect(result.current.totalRecebido).toBeCloseTo(34_452.54, 2);
  });

  it('baixa anterior é o último dia com movimento antes de hoje', async () => {
    const { result } = renderHook(() => usePainelMetas(paramsBase()));
    await waitFor(() => expect(result.current.carregando).toBe(false));
    // Hoje é 11; o dia 11 não conta como "anterior".
    expect(result.current.baixaAnterior).toEqual({ dia: 10, bruto: 18_384.11, qtd: 121 });
  });

  it('mês fechado torna o último dia do mês elegível', async () => {
    const { result } = renderHook(() => usePainelMetas(paramsBase({ mes: '2026-07' })));
    await waitFor(() => expect(result.current.carregando).toBe(false));
    expect(result.current.baixaAnterior?.dia).toBe(11);
  });

  it('soma o não tabulado separado, para fechar a conta com Direto/Extra', async () => {
    analiticoRef.current = linhasAnalitico(true, [
      linha(5, 1_000, 2),
      linha(6, 400, 1, { status_tabulacao: 'nao_tabulado' }),
    ]);
    const { result } = renderHook(() => usePainelMetas(paramsBase()));
    await waitFor(() => expect(result.current.carregando).toBe(false));
    expect(result.current.totalRecebido).toBe(1_400);
    expect(result.current.naoTabulado).toBe(400);
  });
});

describe('usePainelMetas — agendado', () => {
  /**
   * O agendado tem que sair do MESMO escopo do recebimento. Antes ele vinha do
   * `useAnalytics` do AnalyticsPanel, escopado pelos filtros do Dashboard: o
   * gráfico do líder em "Eu" misturava barras dele com uma linha do setor.
   */
  it('busca com o mesmo escopo que o total usa', async () => {
    const { result } = renderHook(() => usePainelMetas(paramsBase()));
    await waitFor(() => expect(result.current.carregando).toBe(false));
    expect(agendadoSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        empresaId: EMPRESA,
        mes: '2026-08',
        escopo: { tipo: 'operador', operadorId: EU },
      }),
    );
    expect(result.current.agendadoPorDia).toEqual([{ dia: 12, agendado: 5_000 }]);
  });

  it('não busca enquanto o escopo estiver pendente', () => {
    escopoRef.current = { escopo: null, fontes: null, carimboDisponivel: false, pendente: true };
    renderHook(() => usePainelMetas(paramsBase()));
    expect(agendadoSpy).not.toHaveBeenCalled();
  });
});

describe('usePainelMetas — relatório ausente', () => {
  it('marca semRelatorio quando o mês não tem linha nenhuma', async () => {
    analiticoRef.current = linhasAnalitico(true, []);
    const { result } = renderHook(() => usePainelMetas(paramsBase()));
    await waitFor(() => expect(result.current.carregando).toBe(false));
    expect(result.current.semRelatorio).toBe(true);
    expect(result.current.totalRecebido).toBe(0);
    expect(result.current.baixaAnterior).toBeNull();
  });
});

