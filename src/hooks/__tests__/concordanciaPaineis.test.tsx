/**
 * O painel de metas e o painel "Dados Analíticos" mostram o MESMO total?
 *
 * Este é o risco número um da mudança, e não é hipotético: `escopoAnalitico.ts`
 * documenta em comentário o dia em que três telas montavam à mão o conjunto de
 * operadores que conta, e o dashboard somava clone com `conta_recebimento`
 * desligado enquanto a aba Analítico não somava.
 *
 * O contrato que este teste protege: `usePainelMetas` reporta exatamente
 * `agregarAnalitico(linhas, escopo).bruto` — nem um filtro a mais. No dia em
 * que alguém acrescentar um `.filter()` "só para ajustar" dentro do hook, é
 * aqui que quebra.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { permissoesDoCargo } from '@/test/permissoesDoCargo';

const { perfilRef, empresaRef, tenantRef, analiticoRef, escopoRef, configRef } = vi.hoisted(() => ({
  perfilRef:    { current: null as unknown },
  empresaRef:   { current: null as unknown },
  tenantRef:    { current: { slug: 'bookplay', isPaguePlay: false } },
  analiticoRef: { current: null as unknown },
  escopoRef:    { current: null as unknown },
  configRef:    { current: null as unknown },
}));

vi.mock('@/hooks/useAuth',      () => ({ useAuth:    () => ({ perfil:  perfilRef.current }) }));
vi.mock('@/hooks/useCargoPermissoes', () => ({
  useCargoPermissoes: () => permissoesDoCargo(
    (perfilRef.current as { perfil?: string } | null)?.perfil),
}));
vi.mock('@/hooks/useEmpresa',   () => ({ useEmpresa: () => ({ empresa: empresaRef.current }) }));
vi.mock('@/lib/tenant-config',  () => ({ useTenant:  () => tenantRef.current }));
vi.mock('@/hooks/useEscopoAnalitico', () => ({ useEscopoAnalitico: () => escopoRef.current }));

vi.mock('@/hooks/useAnaliticoDashboard', async () => {
  const real = await vi.importActual<typeof import('@/hooks/useAnaliticoDashboard')>(
    '@/hooks/useAnaliticoDashboard',
  );
  return { ...real, useAnaliticoDashboard: () => analiticoRef.current };
});

vi.mock('@/services/metas/metasConfig.service', () => ({
  getMetasConfig: () => Promise.resolve({ data: configRef.current, dbAtiva: true }),
}));

vi.mock('@/services/analitico/diretoExtra.service', () => ({
  buscarDiretoExtraDoMes: () => Promise.resolve({
    direto: 0, extra: 0, naoTabulado: 0,
    qtdDireto: 0, qtdExtra: 0, qtdNaoTabulado: 0,
  }),
  buscarAgendadoPorDia: () => Promise.resolve([]),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => {
      const b: Record<string, unknown> = {};
      const chain = () => b;
      for (const m of ['select', 'eq', 'in', 'gte', 'lte', 'order', 'limit', 'range']) b[m] = vi.fn(chain);
      b.maybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null }));
      b.then = (r: (v: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(r);
      return b;
    },
    // Ranking — irrelevante para a concordância, mas o hook o busca no escopo
    // pessoal. A RPC é encadeada com `.order()`, então o mock precisa devolver
    // um thenable, não uma Promise pura.
    rpc: vi.fn(() => {
      const res = { data: [], error: null };
      const q: Record<string, unknown> = {};
      q.order = () => q;
      q.then = (r: (v: unknown) => unknown) => Promise.resolve(res).then(r);
      return q;
    }),
  },
}));

// ─"?─"? SUT + a função que o painel de cima usa ─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?─"?

import { usePainelMetas } from '../usePainelMetas';
import { agregarAnalitico } from '../useAnaliticoDashboard';
import type { EscopoAnalitico } from '@/services/analitico/escopoAnalitico';

const EMPRESA = 'emp-1';
const ANA   = 'ana';
const BRUNO = 'bruno';
const SETOR_A = 'setor-a';
const SETOR_B = 'setor-b';

function linha(over: Record<string, unknown>) {
  return {
    dia: '2026-08-05',
    operador_id: ANA,
    setor_id: SETOR_A,
    forma_pagamento: 'boleto_pix',
    forma_detalhe: 'Pix',
    status_tabulacao: 'tabulado',
    total: 0, total_ho: 0, qtd: 1,
    ...over,
  };
}

/**
 * Relatório com as armadilhas que já morderam o projeto:
 *  - linha ─"RF─f (sem operador cadastrado), carimbada num setor;
 *  - operador de outro setor;
 *  - mais de um dia.
 */
const RELATORIO = [
  linha({ operador_id: ANA,   setor_id: SETOR_A, total: 1_000, dia: '2026-08-05' }),
  linha({ operador_id: BRUNO, setor_id: SETOR_B, total: 800,   dia: '2026-08-06' }),
  linha({ operador_id: null,  setor_id: SETOR_A, total: 250,   dia: '2026-08-06' }),
  linha({ operador_id: ANA,   setor_id: SETOR_A, total: 300,   dia: '2026-08-07', status_tabulacao: 'nao_tabulado' }),
];

beforeEach(() => {
  vi.setSystemTime(new Date('2026-08-11T12:00:00Z'));
  empresaRef.current = { id: EMPRESA, nome: 'Empresa' };
  perfilRef.current  = { id: ANA, perfil: 'operador', setor_id: SETOR_A, equipe_id: null };
  tenantRef.current  = { slug: 'bookplay', isPaguePlay: false };
  configRef.current  = { feriados: [], quartis: [], contar_dia_atual: false };
  analiticoRef.current = {
    linhas: RELATORIO, carregado: true, dbAtiva: true,
    total: { porOperador: {} }, refetch: vi.fn(),
  };
});

afterEach(() => { vi.useRealTimers(); });

/** Roda o hook com um escopo fixo e devolve o total que ele reporta. */
async function totalDoPainel(escopo: EscopoAnalitico): Promise<number> {
  escopoRef.current = {
    escopo,
    fontes: { operadorEquipeMap: {}, equipesExtrasPorOperador: {}, setorDaEquipe: new Map(), setoresAlternativos: new Set() },
    carimboDisponivel: true,
    pendente: false,
  };
  const { result } = renderHook(() =>
    usePainelMetas({ mes: '2026-08' }));
  await waitFor(() => expect(result.current.carregando).toBe(false));
  return result.current.totalRecebido;
}

/** O que o AnalyticsPanel calcula: `agregarAnalitico` sobre as mesmas linhas. */
function totalDoAnalyticsPanel(escopo: EscopoAnalitico): number {
  return agregarAnalitico(RELATORIO as never, escopo).bruto;
}

/**
 * Escopo de setor montado como `escopoDeSetor` monta.
 *
 * `origensExcluidas` e `setorDoOperador` chegaram na 20260812e (composição do
 * acumulado). São opcionais na fábrica mas obrigatórios no tipo, e
 * `linhaNoEscopo` os acessa sem guarda — um literal sem eles compila e explode
 * em tempo de execução. Este helper existe para o teste não cair nessa.
 */
function escopoSetor(setorId: string, porRelatorio: boolean, operadores: Set<string>): EscopoAnalitico {
  return {
    tipo: 'setor',
    setorId,
    porRelatorio,
    operadores,
    origensExcluidas: new Set(),
    setorDoOperador: () => null,
  };
}

const CASOS: Array<[string, EscopoAnalitico]> = [
  ['empresa — inclui a linha órfã',        { tipo: 'empresa' }],
  ['operador — só as linhas dele',         { tipo: 'operador', operadorId: ANA }],
  ['equipe — órfã fica de fora',           { tipo: 'equipe', operadores: new Set([ANA, BRUNO]) }],
  ['setor por carimbo — órfã do setor entra', escopoSetor(SETOR_A, true,  new Set([ANA]))],
  ['setor alternativo — soma por usuários',   escopoSetor(SETOR_B, false, new Set([BRUNO]))],
];

describe('PainelMetas concorda com o AnalyticsPanel', () => {
  for (const [nome, escopo] of CASOS) {
    it(nome, async () => {
      const doPainel = await totalDoPainel(escopo);
      expect(doPainel).toBe(totalDoAnalyticsPanel(escopo));
    });
  }

  it('os escopos realmente produzem totais diferentes — o teste não é vazio', () => {
    const totais = CASOS.map(([, e]) => totalDoAnalyticsPanel(e));
    expect(new Set(totais).size).toBeGreaterThan(1);
    // empresa = 1000 + 800 + 250 + 300
    expect(totalDoAnalyticsPanel({ tipo: 'empresa' })).toBe(2_350);
    // equipe exclui a órfã de 250
    expect(totalDoAnalyticsPanel({ tipo: 'equipe', operadores: new Set([ANA, BRUNO]) })).toBe(2_100);
  });

  it('o não tabulado sai do mesmo agregado, e não de outra conta', async () => {
    escopoRef.current = {
      escopo: { tipo: 'empresa' },
      fontes: { operadorEquipeMap: {}, equipesExtrasPorOperador: {}, setorDaEquipe: new Map(), setoresAlternativos: new Set() },
      carimboDisponivel: true,
      pendente: false,
    };
    const { result } = renderHook(() =>
      usePainelMetas({ mes: '2026-08' }));
    await waitFor(() => expect(result.current.carregando).toBe(false));
    expect(result.current.naoTabulado)
      .toBe(agregarAnalitico(RELATORIO as never, { tipo: 'empresa' }).naoTabuladoBruto);
  });
});

