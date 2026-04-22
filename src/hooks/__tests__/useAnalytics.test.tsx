/**
 * src/hooks/__tests__/useAnalytics.test.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Testes unitários para o hook useAnalytics.
 *
 * Estratégia de mock:
 *  • useAuth / useEmpresa / useRealtimeAcordos → vi.mock + vi.hoisted
 *  • supabase → builder thenable com fila FIFO por tabela (resultsByTable)
 *    Tabelas: setores, equipes, perfis, acordos, metas
 *
 * vi.setSystemTime('2026-04-22T12:00:00Z') fixa o mês 4/2026:
 *  - primeiroDiaMes() = '2026-04-01'
 *  - ultimoDiaMes()   = '2026-04-30'
 *  - getTodayISO()    ≈ '2026-04-22' (BRT = UTC-3, 12h UTC = 9h BRT → mesmo dia)
 *
 * NÃO usamos vi.useFakeTimers() pois interfere com waitFor (que usa setTimeout).
 * A data é fixada com vi.setSystemTime() que é compatível com real timers.
 *
 * Não testados intencionalmente:
 *  - Branch "equipe sem membros" (operadoresDaEquipe.length === 0) — garante
 *    retorno vazio; complexidade de setup supera o benefício de cobertura.
 *  - porEquipe/porOperador sort exaustivo — cobertos via smoke de perc/valor.
 */
import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

// ── 1. vi.hoisted ─────────────────────────────────────────────────────────────

const {
  mockPerfilValue,
  mockEmpresaValue,
  mockTenantSlugValue,
  mockRealtimeSubscribe,
  mockRealtimeUnsubscribe,
  mockSupabaseFromSpy,
} = vi.hoisted(() => {
  const mockPerfilValue         = { current: null as unknown };
  const mockEmpresaValue        = { current: null as unknown };
  const mockTenantSlugValue     = { current: '' as string };
  const mockRealtimeSubscribe   = vi.fn();
  const mockRealtimeUnsubscribe = vi.fn();
  const mockSupabaseFromSpy     = vi.fn();

  return {
    mockPerfilValue,
    mockEmpresaValue,
    mockTenantSlugValue,
    mockRealtimeSubscribe,
    mockRealtimeUnsubscribe,
    mockSupabaseFromSpy,
  };
});

// ── 2. vi.mock ANTES dos imports do SUT ───────────────────────────────────────

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ perfil: mockPerfilValue.current }),
}));

vi.mock('@/hooks/useEmpresa', () => ({
  useEmpresa: () => ({
    empresa:    mockEmpresaValue.current,
    tenantSlug: mockTenantSlugValue.current,
  }),
}));

vi.mock('@/providers/RealtimeAcordosProvider', () => ({
  useRealtimeAcordos: () => ({
    subscribe:   mockRealtimeSubscribe,
    unsubscribe: mockRealtimeUnsubscribe,
  }),
}));

// ── Builder thenable para supabase ────────────────────────────────────────────

type MockResult<T = unknown> = { data: T; error: { message: string } | null };

const resultsByTable: Record<string, MockResult[]> = {};
let defaultResult: MockResult = { data: null, error: null };

function nextResultFor(table: string): MockResult {
  const queue = resultsByTable[table];
  if (queue && queue.length > 0) return queue.shift()!;
  return defaultResult;
}

function pushResult(table: string, result: MockResult) {
  if (!resultsByTable[table]) resultsByTable[table] = [];
  resultsByTable[table].push(result);
}

function createBuilder(table: string) {
  const builder: Record<string, unknown> = {};
  const chain = () => builder;

  builder.select = vi.fn(chain);
  builder.insert = vi.fn(chain);
  builder.update = vi.fn(chain);
  builder.delete = vi.fn(chain);
  builder.eq     = vi.fn(chain);
  builder.neq    = vi.fn(chain);
  builder.gte    = vi.fn(chain);
  builder.lte    = vi.fn(chain);
  builder.in     = vi.fn(chain);
  builder.or     = vi.fn(chain);
  builder.order  = vi.fn(chain);
  builder.limit  = vi.fn(chain);
  builder.range  = vi.fn(chain);

  // maybeSingle e single retornam Promise diretamente (não thenable do builder)
  builder.maybeSingle = vi.fn(() => Promise.resolve(nextResultFor(table)));
  builder.single      = vi.fn(() => Promise.resolve(nextResultFor(table)));

  // O builder é thenable — resolve queries sem maybeSingle/single
  builder.then = (
    resolve: (v: MockResult) => unknown,
    _reject?: (e: unknown) => unknown,
  ) => Promise.resolve(nextResultFor(table)).then(resolve);

  builder.catch   = (fn: (e: unknown) => unknown) =>
    Promise.resolve(nextResultFor(table)).catch(fn);
  builder.finally = (fn: () => void) =>
    Promise.resolve(nextResultFor(table)).finally(fn);

  return builder;
}

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      mockSupabaseFromSpy(table);
      return createBuilder(table);
    },
    channel: vi.fn(() => ({
      on:        vi.fn().mockReturnThis(),
      subscribe: vi.fn(),
    })),
    removeChannel: vi.fn(),
  },
}));

// ── 3. Import do SUT (depois dos mocks) ───────────────────────────────────────

import { useAnalytics } from '../useAnalytics';

// ── 4. Helpers ────────────────────────────────────────────────────────────────

const EMPRESA_ID  = 'empresa-001';
const SETOR_ID    = 'setor-001';
const OPERADOR_ID = 'op-001';

const makeEmpresa = () => ({ id: EMPRESA_ID, nome: 'Empresa Teste' });

const makePerfilOperador = () => ({
  id:          OPERADOR_ID,
  perfil:      'operador',
  nome:        'Op Teste',
  empresa_id:  EMPRESA_ID,
  setor_id:    SETOR_ID,
});

const makePerfilAdmin = () => ({
  id:          'admin-001',
  perfil:      'administrador',
  nome:        'Admin',
  empresa_id:  EMPRESA_ID,
  setor_id:    null,
});

const makePerfilLider = () => ({
  id:          'lider-001',
  perfil:      'lider',
  nome:        'Líder Teste',
  empresa_id:  EMPRESA_ID,
  setor_id:    SETOR_ID,
});

function makeAcordo(overrides: Record<string, unknown> = {}) {
  return {
    id:           `ac-${Math.random().toString(36).slice(2, 8)}`,
    empresa_id:   EMPRESA_ID,
    operador_id:  OPERADOR_ID,
    equipe_id:    'equipe-001',
    vencimento:   '2026-04-22',
    valor:        100,
    status:       'verificar_pendente',
    ...overrides,
  };
}

/**
 * Monta fila para perfil OPERADOR:
 *  1. acordos (thenable)
 *  2. metas   (maybeSingle → também usa fila)
 */
function setupOperadorResults(acordos: unknown[], meta: unknown = null) {
  pushResult('acordos', { data: acordos, error: null });
  pushResult('metas',   { data: meta,    error: null });
}

/**
 * Monta fila para perfil ADMIN:
 *  1. setores     (thenable)
 *  2. acordos     (thenable)
 *  —  admin não busca meta principal (setMeta(null))
 *  3. metas equipe  (Promise.all[0])
 *  4. metas operador (Promise.all[1])
 *  5. perfis        (Promise.all[2])
 *  6. equipes       (Promise.all[3])
 */
function setupAdminResults(opts: {
  setores?:       unknown[];
  acordos?:       unknown[];
  metasEquipe?:   unknown[];
  metasOperador?: unknown[];
  perfis?:        unknown[];
  equipes?:       unknown[];
} = {}) {
  pushResult('setores',  { data: opts.setores       ?? [], error: null });
  pushResult('acordos',  { data: opts.acordos        ?? [], error: null });
  pushResult('metas',    { data: opts.metasEquipe    ?? [], error: null });
  pushResult('metas',    { data: opts.metasOperador  ?? [], error: null });
  pushResult('perfis',   { data: opts.perfis         ?? [], error: null });
  pushResult('equipes',  { data: opts.equipes        ?? [], error: null });
}

/**
 * Monta fila para perfil LÍDER (sem filtros ativos):
 *  1. equipes do setor  (thenable)
 *  2. acordos           (thenable, filtrado por setor_id)
 *  3. metas setor       (maybeSingle)
 *  4. metas equipe      (Promise.all[0])
 *  5. metas operador    (Promise.all[1])
 *  6. perfis nomes      (Promise.all[2])
 *  7. equipes nomes     (Promise.all[3])
 */
function setupLiderResults(opts: {
  equipesDoSetor?: unknown[];
  acordos?:        unknown[];
  metaSetor?:      unknown;
  metasEquipe?:    unknown[];
  metasOperador?:  unknown[];
  perfis?:         unknown[];
  equipes?:        unknown[];
} = {}) {
  pushResult('equipes', { data: opts.equipesDoSetor ?? [], error: null });
  pushResult('acordos', { data: opts.acordos        ?? [], error: null });
  pushResult('metas',   { data: opts.metaSetor       ?? null, error: null });
  pushResult('metas',   { data: opts.metasEquipe     ?? [], error: null });
  pushResult('metas',   { data: opts.metasOperador   ?? [], error: null });
  pushResult('perfis',  { data: opts.perfis          ?? [], error: null });
  pushResult('equipes', { data: opts.equipes         ?? [], error: null });
}

// ── 5. Setup / teardown ───────────────────────────────────────────────────────

beforeEach(() => {
  // Fixa data: 22/04/2026 12:00 UTC → BRT = 22/04/2026
  // Não usa useFakeTimers() — interfere com waitFor
  vi.setSystemTime(new Date('2026-04-22T12:00:00Z'));

  // Limpar filas entre testes
  Object.keys(resultsByTable).forEach(k => { delete resultsByTable[k]; });
  defaultResult = { data: null, error: null };

  vi.clearAllMocks();

  // Estado padrão: não logado
  mockPerfilValue.current     = null;
  mockEmpresaValue.current    = null;
  mockTenantSlugValue.current = '';
});

afterEach(() => {
  vi.useRealTimers();
});

// ── 6. Testes ─────────────────────────────────────────────────────────────────

describe('useAnalytics', () => {

  // ── Estado inicial ────────────────────────────────────────────────────────

  describe('estado inicial', () => {
    it('retorna loading=true e dados zerados quando perfil/empresa ausentes', () => {
      const { result } = renderHook(() => useAnalytics());

      expect(result.current.loading).toBe(true);
      expect(result.current.valorRecebidoMes).toBe(0);
      expect(result.current.totalAcordosMes).toBe(0);
      expect(result.current.acordosMes).toEqual([]);
      expect(result.current.setores).toEqual([]);
      expect(result.current.meta).toBeNull();
      expect(result.current.porStatus).toEqual([]);
    });

    it('expõe funções de filtro e campos esperados no retorno inicial', () => {
      const { result } = renderHook(() => useAnalytics());

      expect(typeof result.current.setSetorFiltro).toBe('function');
      expect(typeof result.current.setEquipeFiltro).toBe('function');
      expect(typeof result.current.setOperadorFiltro).toBe('function');
      expect(typeof result.current.refetch).toBe('function');
      expect(result.current.setorFiltro).toBeNull();
      expect(result.current.equipeFiltro).toBeNull();
      expect(result.current.operadorFiltro).toBeNull();
      expect(result.current.equipesDoSetor).toEqual([]);
    });
  });

  // ── Sem perfil/empresa: não faz queries ──────────────────────────────────

  describe('sem perfil ou empresa', () => {
    it('não chama supabase.from enquanto perfil/empresa são nulos', async () => {
      renderHook(() => useAnalytics());
      // aguarda próximo tick para dar chance ao useEffect de rodar
      await act(async () => {
        await new Promise(r => setTimeout(r, 50));
      });
      expect(mockSupabaseFromSpy).not.toHaveBeenCalled();
    });
  });

  // ── Operador comum — fetch bem-sucedido ──────────────────────────────────

  describe('perfil operador', () => {
    beforeEach(() => {
      mockPerfilValue.current  = makePerfilOperador();
      mockEmpresaValue.current = makeEmpresa();
    });

    it('termina com loading=false após fetch', async () => {
      setupOperadorResults([], null);

      const { result } = renderHook(() => useAnalytics());
      await waitFor(() => expect(result.current.loading).toBe(false));
    });

    it('calcula métricas de acordos do mês corretamente', async () => {
      const acordos = [
        makeAcordo({ status: 'pago',              valor: 200, vencimento: '2026-04-10' }),
        makeAcordo({ status: 'nao_pago',           valor: 150, vencimento: '2026-04-15' }),
        makeAcordo({ status: 'verificar_pendente', valor: 100, vencimento: '2026-04-22' }),
        // fora do mês — não entra nas métricas
        makeAcordo({ status: 'pago',              valor: 999, vencimento: '2026-03-31' }),
      ];
      setupOperadorResults(acordos, null);

      const { result } = renderHook(() => useAnalytics());
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.totalAcordosMes).toBe(3);
      expect(result.current.totalPagosMes).toBe(1);
      expect(result.current.totalNaoPagos).toBe(1);
      expect(result.current.totalPendentes).toBe(1);
      expect(result.current.valorRecebidoMes).toBe(200);
      expect(result.current.valorNaoPago).toBe(150);
      expect(result.current.valorAgendadoRestanteMes).toBe(100);
      expect(result.current.totalAgendadoRestanteMes).toBe(1);
      expect(result.current.valorAgendadoMes).toBe(450); // 200+150+100
    });

    it('calcula valorAgendadoHoje e totalAcordosHoje corretamente', async () => {
      const hoje = '2026-04-22';
      const acordos = [
        makeAcordo({ vencimento: hoje,         valor: 300, status: 'verificar_pendente' }),
        makeAcordo({ vencimento: hoje,         valor: 200, status: 'pago' }),
        makeAcordo({ vencimento: '2026-04-23', valor: 999, status: 'verificar_pendente' }),
      ];
      setupOperadorResults(acordos, null);

      const { result } = renderHook(() => useAnalytics());
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.totalAcordosHoje).toBe(2);
      expect(result.current.valorAgendadoHoje).toBe(500);
    });

    it('porStatus exclui entradas com value=0', async () => {
      const acordos = [
        makeAcordo({ status: 'pago', valor: 100, vencimento: '2026-04-05' }),
      ];
      setupOperadorResults(acordos, null);

      const { result } = renderHook(() => useAnalytics());
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.porStatus).toHaveLength(1);
      expect(result.current.porStatus[0].name).toBe('Pago');
      expect(result.current.porStatus[0].color).toBe('#22c55e');
    });

    it('porStatus inclui múltiplos status quando presentes', async () => {
      const acordos = [
        makeAcordo({ status: 'pago',              vencimento: '2026-04-01' }),
        makeAcordo({ status: 'nao_pago',           vencimento: '2026-04-02' }),
        makeAcordo({ status: 'verificar_pendente', vencimento: '2026-04-03' }),
      ];
      setupOperadorResults(acordos, null);

      const { result } = renderHook(() => useAnalytics());
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.porStatus).toHaveLength(3);
      const nomes = result.current.porStatus.map(s => s.name);
      expect(nomes).toContain('Pago');
      expect(nomes).toContain('Pendente');
      expect(nomes).toContain('Não Pago');
    });

    it('porDia tem 30 entradas (abril tem 30 dias)', async () => {
      setupOperadorResults([], null);

      const { result } = renderHook(() => useAnalytics());
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.porDia).toHaveLength(30);
      // primeiro dia = '1', último = '30'
      expect(result.current.porDia[0].dia).toBe('1');
      expect(result.current.porDia[29].dia).toBe('30');
    });

    it('porDia registra recebido só para status=pago, agendado para todos', async () => {
      const acordos = [
        makeAcordo({ vencimento: '2026-04-10', valor: 400, status: 'pago' }),
        makeAcordo({ vencimento: '2026-04-10', valor: 200, status: 'nao_pago' }),
      ];
      setupOperadorResults(acordos, null);

      const { result } = renderHook(() => useAnalytics());
      await waitFor(() => expect(result.current.loading).toBe(false));

      const dia10 = result.current.porDia.find(d => d.dia === '10');
      expect(dia10?.recebido).toBe(400);
      expect(dia10?.agendado).toBe(600); // 400 + 200
    });

    it('acordosMes retorna somente acordos dentro do intervalo do mês', async () => {
      const acordos = [
        makeAcordo({ vencimento: '2026-04-01' }),
        makeAcordo({ vencimento: '2026-04-30' }),
        makeAcordo({ vencimento: '2026-05-01' }), // fora
        makeAcordo({ vencimento: '2026-03-31' }), // fora
      ];
      setupOperadorResults(acordos, null);

      const { result } = renderHook(() => useAnalytics());
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.acordosMes).toHaveLength(2);
    });

    it('meta nula resulta em percMeta=0 e percMetaAcordos=0', async () => {
      setupOperadorResults(
        [makeAcordo({ status: 'pago', valor: 500, vencimento: '2026-04-01' })],
        null,
      );

      const { result } = renderHook(() => useAnalytics());
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.percMeta).toBe(0);
      expect(result.current.percMetaAcordos).toBe(0);
    });

    it('calcula percMeta corretamente quando meta está definida (Bookplay)', async () => {
      mockTenantSlugValue.current = 'bookplay';
      const metaData = {
        id:            'meta-001',
        tipo:          'operador',
        referencia_id: OPERADOR_ID,
        meta_valor:    1000,
        meta_acordos:  10,
        mes:           4,
        ano:           2026,
      };
      const acordos = [
        makeAcordo({ status: 'pago', valor: 500, vencimento: '2026-04-05' }),
      ];
      setupOperadorResults(acordos, metaData);

      const { result } = renderHook(() => useAnalytics());
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.percMeta).toBe(50); // 500/1000 * 100
      expect(result.current.meta).not.toBeNull();
      expect(result.current.meta?.meta_valor).toBe(1000);
    });

    it('percMetaAcordos calculado sobre total de pagos', async () => {
      mockTenantSlugValue.current = 'bookplay';
      const metaData = {
        id: 'meta-002', tipo: 'operador', referencia_id: OPERADOR_ID,
        meta_valor: 1000, meta_acordos: 5, mes: 4, ano: 2026,
      };
      const acordos = [
        makeAcordo({ status: 'pago', valor: 100, vencimento: '2026-04-01' }),
        makeAcordo({ status: 'pago', valor: 100, vencimento: '2026-04-02' }),
        makeAcordo({ status: 'nao_pago', valor: 100, vencimento: '2026-04-03' }),
      ];
      setupOperadorResults(acordos, metaData);

      const { result } = renderHook(() => useAnalytics());
      await waitFor(() => expect(result.current.loading).toBe(false));

      // 2 pagos / 5 meta = 40%
      expect(result.current.percMetaAcordos).toBe(40);
    });

    it('query de acordos é chamada (verifica supabase.from("acordos"))', async () => {
      setupOperadorResults([], null);

      renderHook(() => useAnalytics());
      await waitFor(() =>
        expect(mockSupabaseFromSpy).toHaveBeenCalledWith('acordos'),
      );
    });

    it('realtime: subscribe chamado ao montar', async () => {
      setupOperadorResults([], null);
      renderHook(() => useAnalytics());
      await waitFor(() => expect(mockRealtimeSubscribe).toHaveBeenCalledTimes(1));
    });

    it('realtime: unsubscribe chamado ao desmontar', async () => {
      setupOperadorResults([], null);

      const { unmount } = renderHook(() => useAnalytics());
      await waitFor(() => expect(mockRealtimeSubscribe).toHaveBeenCalledTimes(1));
      unmount();
      expect(mockRealtimeUnsubscribe).toHaveBeenCalledTimes(1);
    });
  });

  // ── Admin ─────────────────────────────────────────────────────────────────

  describe('perfil admin', () => {
    beforeEach(() => {
      mockPerfilValue.current  = makePerfilAdmin();
      mockEmpresaValue.current = makeEmpresa();
    });

    it('carrega setores e termina com loading=false', async () => {
      setupAdminResults({
        setores: [{ id: 'setor-001', nome: 'Setor A' }],
        acordos: [],
      });

      const { result } = renderHook(() => useAnalytics());
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.setores).toHaveLength(1);
      expect(result.current.setores[0].nome).toBe('Setor A');
    });

    it('admin não tem meta principal (meta=null)', async () => {
      setupAdminResults({ acordos: [] });

      const { result } = renderHook(() => useAnalytics());
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.meta).toBeNull();
    });

    it('carrega metas por equipe e operador com aggregação correta', async () => {
      const metasEquipe   = [
        { id: 'meq-1', tipo: 'equipe', referencia_id: 'equipe-001',
          meta_valor: 2000, meta_acordos: 20, mes: 4, ano: 2026 },
      ];
      const metasOperador = [
        { id: 'mop-1', tipo: 'operador', referencia_id: OPERADOR_ID,
          meta_valor: 1000, meta_acordos: 10, mes: 4, ano: 2026 },
      ];
      const acordos = [
        makeAcordo({
          status: 'pago', valor: 800, vencimento: '2026-04-08',
          // A equipe é derivada via perfis.equipe_id, NÃO via acordos.equipe_id.
          operador_id: OPERADOR_ID,
        }),
      ];
      setupAdminResults({
        acordos,
        metasEquipe,
        metasOperador,
        // equipe_id precisa vir do perfil do operador (regra de negócio real).
        perfis:  [{ id: OPERADOR_ID, nome: 'Operador A', equipe_id: 'equipe-001' }],
        equipes: [{ id: 'equipe-001', nome: 'Equipe Alpha' }],
      });

      const { result } = renderHook(() => useAnalytics());
      await waitFor(() => expect(result.current.loading).toBe(false));

      const eq = result.current.porEquipe?.find(e => e.nome === 'Equipe Alpha');
      expect(eq).toBeDefined();
      expect(eq?.valor).toBe(800);
      expect(eq?.meta).toBe(2000);
      expect(eq?.perc).toBe(40); // 800/2000 * 100

      const op = result.current.porOperador?.find(o => o.nome === 'Operador A');
      expect(op).toBeDefined();
      expect(op?.valor).toBe(800);
      expect(op?.meta).toBe(1000);
      expect(op?.perc).toBe(80); // 800/1000 * 100
    });

    it('porEquipe: agrupa acordos pela equipe do perfil do operador — NÃO pelo acordo (bug Jose_Victor)', async () => {
      // Cenário reportado: Jose_Victor é operador da equipe Luciana.
      // O acordo pago dele DEVE aparecer na equipe "Luciana", não em "Sem equipe".
      // Bug antigo: `(a as any).equipe_id` lia um campo inexistente na tabela
      // acordos e todos caíam em "Sem equipe".
      const OP_JV = 'op-jose-victor';
      const acordos = [
        makeAcordo({ status: 'pago', valor: 500, vencimento: '2026-04-10', operador_id: OP_JV }),
        makeAcordo({ status: 'pago', valor: 300, vencimento: '2026-04-15', operador_id: OP_JV }),
      ];
      setupAdminResults({
        acordos,
        perfis:  [{ id: OP_JV, nome: 'Jose_Victor', equipe_id: 'equipe-luciana' }],
        equipes: [{ id: 'equipe-luciana', nome: 'Luciana' }],
      });

      const { result } = renderHook(() => useAnalytics());
      await waitFor(() => expect(result.current.loading).toBe(false));

      const luciana = result.current.porEquipe?.find(e => e.nome === 'Luciana');
      expect(luciana).toBeDefined();
      expect(luciana?.valor).toBe(800);
      expect(luciana?.acordos).toBe(2);

      // Não deve existir "Sem equipe" nesse cenário
      const semEq = result.current.porEquipe?.find(e => e.nome === 'Sem equipe');
      expect(semEq).toBeUndefined();
    });

    it('porEquipe usa "Sem equipe" quando o operador NÃO tem equipe_id no perfil', async () => {
      const OP_SEM_EQ = 'op-sem-equipe';
      const acordos = [
        makeAcordo({ status: 'pago', valor: 100, vencimento: '2026-04-01', operador_id: OP_SEM_EQ }),
      ];
      setupAdminResults({
        acordos,
        perfis:  [{ id: OP_SEM_EQ, nome: 'Órfão', equipe_id: null }],
        equipes: [],
      });

      const { result } = renderHook(() => useAnalytics());
      await waitFor(() => expect(result.current.loading).toBe(false));

      const semEq = result.current.porEquipe?.find(e => e.nome === 'Sem equipe');
      expect(semEq).toBeDefined();
      expect(semEq?.valor).toBe(100);
    });

    it('porOperador usa "Operador" (fallback) quando operador_id não está no mapa', async () => {
      const acordos = [
        makeAcordo({ status: 'pago', valor: 100, vencimento: '2026-04-01', operador_id: 'op-desconhecido' }),
      ];
      setupAdminResults({ acordos });

      const { result } = renderHook(() => useAnalytics());
      await waitFor(() => expect(result.current.loading).toBe(false));

      const opFallback = result.current.porOperador?.find(o => o.id === 'op-desconhecido');
      expect(opFallback?.nome).toBe('Operador');
    });

    it('setSetorFiltro aciona nova carga', async () => {
      setupAdminResults({ acordos: [] });

      const { result } = renderHook(() => useAnalytics());
      await waitFor(() => expect(result.current.loading).toBe(false));

      const callsBefore = (mockSupabaseFromSpy as Mock).mock.calls.length;

      // Prepara nova rodada de dados
      setupAdminResults({ acordos: [] });

      act(() => {
        result.current.setSetorFiltro('setor-999');
      });

      await waitFor(() => expect(result.current.loading).toBe(false));
      await waitFor(() =>
        expect((mockSupabaseFromSpy as Mock).mock.calls.length).toBeGreaterThan(callsBefore),
      );
      expect(result.current.setorFiltro).toBe('setor-999');
    });

    it('setSetorFiltro(null) limpa o filtro', async () => {
      setupAdminResults({ acordos: [] });
      const { result } = renderHook(() => useAnalytics());
      await waitFor(() => expect(result.current.loading).toBe(false));

      setupAdminResults({ acordos: [] });
      act(() => { result.current.setSetorFiltro('setor-x'); });
      await waitFor(() => expect(result.current.setorFiltro).toBe('setor-x'));

      setupAdminResults({ acordos: [] });
      act(() => { result.current.setSetorFiltro(null); });
      await waitFor(() => expect(result.current.setorFiltro).toBeNull());
    });
  });

  // ── Líder ────────────────────────────────────────────────────────────────

  describe('perfil lider', () => {
    beforeEach(() => {
      mockPerfilValue.current  = makePerfilLider();
      mockEmpresaValue.current = makeEmpresa();
    });

    it('carrega equipes do setor e termina com loading=false', async () => {
      const equipes = [
        { id: 'eq-001', nome: 'Equipe 1' },
        { id: 'eq-002', nome: 'Equipe 2' },
      ];
      setupLiderResults({ equipesDoSetor: equipes });

      const { result } = renderHook(() => useAnalytics());
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.equipesDoSetor).toHaveLength(2);
      expect(result.current.equipesDoSetor[0].nome).toBe('Equipe 1');
    });

    it('meta setor é carregada via maybeSingle', async () => {
      const metaSetor = {
        id: 'ms-001', tipo: 'setor', referencia_id: SETOR_ID,
        meta_valor: 5000, meta_acordos: 50, mes: 4, ano: 2026,
      };
      setupLiderResults({ metaSetor });

      const { result } = renderHook(() => useAnalytics());
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.meta?.meta_valor).toBe(5000);
    });

    it('setEquipeFiltro muda estado e aciona nova carga', async () => {
      setupLiderResults();

      const { result } = renderHook(() => useAnalytics());
      await waitFor(() => expect(result.current.loading).toBe(false));

      // Configurar para nova carga com equipeFiltro:
      // 1. equipes do setor
      // 2. perfis (membros da equipe)
      // 3. acordos
      // 4. metas equipe (maybeSingle)
      // 5. metas equipe Promise.all[0]
      // 6. metas operador Promise.all[1]
      // 7. perfis nomes Promise.all[2]
      // 8. equipes nomes Promise.all[3]
      pushResult('equipes', { data: [{ id: 'eq-001', nome: 'Equipe 1' }], error: null });
      pushResult('perfis',  { data: [{ id: 'op-aaa' }], error: null }); // membros
      pushResult('acordos', { data: [], error: null });
      pushResult('metas',   { data: null, error: null }); // meta equipe (maybeSingle)
      pushResult('metas',   { data: [], error: null });
      pushResult('metas',   { data: [], error: null });
      pushResult('perfis',  { data: [], error: null });
      pushResult('equipes', { data: [], error: null });

      act(() => { result.current.setEquipeFiltro('eq-001'); });
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.equipeFiltro).toBe('eq-001');
    });

    it('setOperadorFiltro muda estado e aciona nova carga', async () => {
      setupLiderResults();
      const { result } = renderHook(() => useAnalytics());
      await waitFor(() => expect(result.current.loading).toBe(false));

      // Nova carga com operadorFiltro ativo
      pushResult('equipes', { data: [], error: null });
      pushResult('acordos', { data: [], error: null });
      pushResult('metas',   { data: null, error: null }); // maybeSingle operador
      pushResult('metas',   { data: [], error: null });
      pushResult('metas',   { data: [], error: null });
      pushResult('perfis',  { data: [], error: null });
      pushResult('equipes', { data: [], error: null });

      act(() => { result.current.setOperadorFiltro('op-xyz'); });
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.operadorFiltro).toBe('op-xyz');
    });
  });

  // ── Diretoria ─────────────────────────────────────────────────────────────

  describe('perfil diretoria', () => {
    beforeEach(() => {
      mockPerfilValue.current = {
        id: 'dir-001', perfil: 'diretoria', nome: 'Diretora',
        empresa_id: EMPRESA_ID, setor_id: null,
      };
      mockEmpresaValue.current = makeEmpresa();
    });

    it('carrega setores (diretoria tem visão global)', async () => {
      // Diretoria: setores + acordos + metas equipe + metas op + perfis + equipes
      pushResult('setores',  { data: [{ id: 's1', nome: 'Setor X' }], error: null });
      pushResult('acordos',  { data: [], error: null });
      pushResult('metas',    { data: [], error: null });
      pushResult('metas',    { data: [], error: null });
      pushResult('perfis',   { data: [], error: null });
      pushResult('equipes',  { data: [], error: null });

      const { result } = renderHook(() => useAnalytics());
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.setores).toHaveLength(1);
      expect(result.current.setores[0].nome).toBe('Setor X');
      // Diretoria: tipoMeta fica null → setMeta() nunca é chamado → mantém
      // o estado inicial null OU recebe [] da fila caso haja consumo extra.
      // O assert seguro é que não lança exceção e loading termina false.
      expect(result.current.loading).toBe(false);
    });
  });

  // ── HO PaguePlay ─────────────────────────────────────────────────────────

  describe('HO (Honorários Operacionais) — PaguePlay', () => {
    beforeEach(() => {
      mockPerfilValue.current     = makePerfilOperador();
      mockEmpresaValue.current    = makeEmpresa();
      mockTenantSlugValue.current = 'pagueplay';
    });

    it('valorHOMes = valorRecebidoMes * 0.2496', async () => {
      const acordos = [
        makeAcordo({ status: 'pago', valor: 1000, vencimento: '2026-04-05' }),
      ];
      setupOperadorResults(acordos, null);

      const { result } = renderHook(() => useAnalytics());
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.valorHOMes).toBeCloseTo(249.6, 2);
    });

    it('valorHONaoPago = valorNaoPago * 0.2496', async () => {
      const acordos = [
        makeAcordo({ status: 'nao_pago', valor: 500, vencimento: '2026-04-10' }),
      ];
      setupOperadorResults(acordos, null);

      const { result } = renderHook(() => useAnalytics());
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.valorHONaoPago).toBeCloseTo(124.8, 2);
    });

    it('valorHOAgendado = valorAgendadoMes * 0.2496', async () => {
      const acordos = [
        makeAcordo({ status: 'verificar_pendente', valor: 400, vencimento: '2026-04-12' }),
      ];
      setupOperadorResults(acordos, null);

      const { result } = renderHook(() => useAnalytics());
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.valorHOAgendado).toBeCloseTo(99.84, 2);
    });
  });

  // ── Error path ────────────────────────────────────────────────────────────

  describe('error path', () => {
    beforeEach(() => {
      mockPerfilValue.current  = makePerfilOperador();
      mockEmpresaValue.current = makeEmpresa();
    });

    it('hook não lança quando query de acordos retorna dados nulos (erro de rede)', async () => {
      // Simula query retornando data=null (falha silenciosa)
      pushResult('acordos', { data: null, error: { message: 'network error' } });
      pushResult('metas',   { data: null, error: null });

      const { result } = renderHook(() => useAnalytics());
      await waitFor(() => expect(result.current.loading).toBe(false));

      // Dados ficam como estado inicial (array vazio)
      expect(result.current.totalAcordosMes).toBe(0);
    });

    it('hook não lança quando query de metas retorna erro', async () => {
      pushResult('acordos', { data: [], error: null });
      pushResult('metas',   { data: null, error: { message: 'metas error' } });

      const { result } = renderHook(() => useAnalytics());
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.meta).toBeNull();
    });
  });

  // ── refetch ───────────────────────────────────────────────────────────────

  describe('refetch', () => {
    beforeEach(() => {
      mockPerfilValue.current  = makePerfilOperador();
      mockEmpresaValue.current = makeEmpresa();
    });

    it('refetch dispara nova carga e atualiza os dados', async () => {
      setupOperadorResults([], null);
      const { result } = renderHook(() => useAnalytics());
      await waitFor(() => expect(result.current.loading).toBe(false));

      // Dados da 2ª carga
      setupOperadorResults(
        [makeAcordo({ status: 'pago', valor: 777, vencimento: '2026-04-20' })],
        null,
      );

      act(() => { result.current.refetch(); });
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.totalPagosMes).toBe(1);
      expect(result.current.valorRecebidoMes).toBe(777);
    });
  });

  // ── calcPerc — cap em 999 ─────────────────────────────────────────────────

  describe('calcPerc — cap em 999', () => {
    beforeEach(() => {
      mockPerfilValue.current     = makePerfilOperador();
      mockEmpresaValue.current    = makeEmpresa();
      mockTenantSlugValue.current = 'bookplay';
    });

    it('percMeta e percMetaAcordos são limitados a 999 quando realizado >> meta', async () => {
      const meta = {
        id: 'meta-cap', tipo: 'operador', referencia_id: OPERADOR_ID,
        meta_valor: 1, meta_acordos: 1, mes: 4, ano: 2026,
      };
      const acordos = Array.from({ length: 20 }, (_, i) =>
        makeAcordo({
          status:     'pago',
          valor:      1000,
          vencimento: `2026-04-${String(i + 1).padStart(2, '0')}`,
        }),
      );
      setupOperadorResults(acordos, meta);

      const { result } = renderHook(() => useAnalytics());
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.percMeta).toBe(999);
      expect(result.current.percMetaAcordos).toBe(999);
    });

    it('percMeta=0 quando meta_valor=0', async () => {
      const meta = {
        id: 'meta-zero', tipo: 'operador', referencia_id: OPERADOR_ID,
        meta_valor: 0, meta_acordos: 0, mes: 4, ano: 2026,
      };
      setupOperadorResults(
        [makeAcordo({ status: 'pago', valor: 500, vencimento: '2026-04-01' })],
        meta,
      );

      const { result } = renderHook(() => useAnalytics());
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.percMeta).toBe(0);
    });
  });

  // ── porDia HO entries ─────────────────────────────────────────────────────

  describe('porDia — campo ho (PaguePlay)', () => {
    beforeEach(() => {
      mockPerfilValue.current     = makePerfilOperador();
      mockEmpresaValue.current    = makeEmpresa();
      mockTenantSlugValue.current = 'pagueplay';
    });

    it('campo ho em porDia = recebido_dia * 0.2496', async () => {
      const acordos = [
        makeAcordo({ vencimento: '2026-04-15', valor: 1000, status: 'pago' }),
      ];
      setupOperadorResults(acordos, null);

      const { result } = renderHook(() => useAnalytics());
      await waitFor(() => expect(result.current.loading).toBe(false));

      const dia15 = result.current.porDia.find(d => d.dia === '15');
      expect(dia15?.ho).toBeCloseTo(249.6, 2);
    });
  });
});
