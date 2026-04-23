/**
 * acordos.service.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Cobertura das funções exportadas de `acordos.service.ts`:
 *
 *   Queries contra Supabase (mockado com builder thenable):
 *     - fetchAcordos (filtros, busca, range de datas, paginação, equipe sem/
 *       com membros, erro propagado)
 *     - verificarNrDuplicado (nr vazio, sem duplicata, com duplicata,
 *       acordoIdExcluir, campo `instituicao` para PaguePlay)
 *     - verificarNrsDuplicadosEmLote (lista vazia, trim + dedupe, resultados,
 *       campo `instituicao`, operador desconhecido)
 *
 *   Funções puras (sem mock de Supabase):
 *     - calcularMetricas         (lista → MetricasAcordos)
 *     - calcularMetricasMes      (lista → MetricasMes, "hoje" fixo)
 *     - calcularMetricasDashboard (lista → MetricasDashboard, "hoje" fixo)
 *
 * Padrão de mock idêntico ao de `lixeira.service.test.ts` e
 * `notificacoes.service.test.ts`, acrescentando:
 *   - fila `resultsByTable` para suportar fluxos com MAIS DE UMA query
 *     (ex.: fetchAcordos + equipe_id → lê `perfis` antes de `acordos_deduplicados`);
 *   - métodos adicionais (`in`, `or`, `range`, `gte`, `lte`, `neq`).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mock do Supabase (thenable + fila por tabela) ──────────────────────────

type MockResult<T = unknown> = { data: T; error: { message: string } | null; count?: number | null };

interface BuilderCall {
  table: string;
  operation: 'select' | 'insert' | 'update' | 'delete' | null;
  payload?: unknown;
  filters: Array<[string, string, unknown]>;
  in?: { col: string; values: unknown[] };
  or?: string;
  range?: [number, number];
  order?: { col: string; opts?: unknown };
  limit?: number;
  selectArg?: unknown;
  countOpt?: unknown;
}

const calls: BuilderCall[] = [];
let currentCall: BuilderCall | null = null;

// Resultado único (fallback) ou por tabela (FIFO).
let defaultResult: MockResult = { data: null, error: null, count: 0 };
const resultsByTable: Record<string, MockResult[]> = {};

function nextResultFor(table: string): MockResult {
  const queue = resultsByTable[table];
  if (queue && queue.length > 0) return queue.shift()!;
  return defaultResult;
}

function createBuilder(table: string) {
  // IMPORTANTE: cada builder captura SEU próprio `call` via closure.
  // Não dependemos de `currentCall` global — isso quebraria em fluxos onde
  // dois builders vivem ao mesmo tempo (ex.: fetchAcordos com equipe_id
  // cria o builder de `acordos_deduplicados`, depois cria+awaita `perfis`,
  // depois continua chamando .in() no builder de `acordos_deduplicados`).
  const call: BuilderCall = { table, operation: null, filters: [] };
  calls.push(call);
  currentCall = call;

  const builder = {
    select: vi.fn((arg?: unknown, opts?: unknown) => {
      call.operation = 'select';
      call.selectArg = arg;
      call.countOpt = opts;
      return builder;
    }),
    insert: vi.fn((p: unknown) => { call.operation = 'insert'; call.payload = p; return builder; }),
    update: vi.fn((p: unknown) => { call.operation = 'update'; call.payload = p; return builder; }),
    delete: vi.fn(() => { call.operation = 'delete'; return builder; }),
    eq:    vi.fn((col: string, val: unknown) => { call.filters.push(['eq',  col, val]); return builder; }),
    neq:   vi.fn((col: string, val: unknown) => { call.filters.push(['neq', col, val]); return builder; }),
    gte:   vi.fn((col: string, val: unknown) => { call.filters.push(['gte', col, val]); return builder; }),
    lte:   vi.fn((col: string, val: unknown) => { call.filters.push(['lte', col, val]); return builder; }),
    in:    vi.fn((col: string, values: unknown[]) => { call.in = { col, values }; return builder; }),
    or:    vi.fn((expr: string) => { call.or = expr; return builder; }),
    order: vi.fn((col: string, opts?: unknown) => { call.order = { col, opts }; return builder; }),
    limit: vi.fn((n: number) => { call.limit = n; return builder; }),
    range: vi.fn((from: number, to: number) => { call.range = [from, to]; return builder; }),
    // thenable — resolve com o próximo resultado da tabela atual
    then: (resolve: (v: MockResult) => unknown, reject?: (e: unknown) => unknown) => {
      try {
        return Promise.resolve(nextResultFor(table)).then(resolve, reject);
      } catch (e) {
        return reject ? reject(e) : Promise.reject(e);
      }
    },
  };
  return builder;
}

vi.mock('@/lib/supabase', () => ({
  supabase: { from: vi.fn((t: string) => createBuilder(t)) },
}));

// SUT depois do vi.mock.
import {
  fetchAcordos,
  verificarNrDuplicado,
  verificarNrsDuplicadosEmLote,
  calcularMetricas,
  calcularMetricasMes,
  calcularMetricasDashboard,
} from './acordos.service';

beforeEach(() => {
  calls.length = 0;
  currentCall = null;
  defaultResult = { data: null, error: null, count: 0 };
  for (const k of Object.keys(resultsByTable)) delete resultsByTable[k];
});

// ══════════════════════════════════════════════════════════════════════════
// fetchAcordos
// ══════════════════════════════════════════════════════════════════════════

describe('fetchAcordos', () => {
  it('lê da view acordos_deduplicados com order por vencimento asc e sem paginação por padrão', async () => {
    resultsByTable['acordos_deduplicados'] = [{
      data: [{ id: 'a1' }, { id: 'a2' }],
      error: null,
      count: 2,
    }];

    const r = await fetchAcordos();

    expect(r.data).toHaveLength(2);
    expect(r.count).toBe(2);

    const c = calls[0];
    expect(c.table).toBe('acordos_deduplicados');
    expect(c.operation).toBe('select');
    expect(c.countOpt).toEqual({ count: 'exact' });
    expect(c.order).toEqual({ col: 'vencimento', opts: { ascending: true } });
    // Sem paginação.
    expect(c.range).toBeUndefined();
  });

  it('aplica todos os filtros (status, tipo, operador_id, setor_id, empresa_id, vencimento, data_inicio, data_fim)', async () => {
    resultsByTable['acordos_deduplicados'] = [{ data: [], error: null, count: 0 }];

    await fetchAcordos({
      status:      'pago',
      tipo:        'direto',
      operador_id: 'op-1',
      setor_id:    'set-1',
      empresa_id:  'emp-1',
      vencimento:  '2026-04-22',
      data_inicio: '2026-04-01',
      data_fim:    '2026-04-30',
    });

    const c = calls[0];
    expect(c.filters).toEqual([
      ['eq',  'status',      'pago'],
      ['eq',  'tipo',        'direto'],
      ['eq',  'operador_id', 'op-1'],
      ['eq',  'setor_id',    'set-1'],
      ['eq',  'empresa_id',  'emp-1'],
      ['eq',  'vencimento',  '2026-04-22'],
      ['gte', 'vencimento',  '2026-04-01'],
      ['lte', 'vencimento',  '2026-04-30'],
    ]);
  });

  it('aplica filtro apenas_hoje usando a data de hoje (getTodayISO)', async () => {
    resultsByTable['acordos_deduplicados'] = [{ data: [], error: null, count: 0 }];

    await fetchAcordos({ apenas_hoje: true });

    const c = calls[0];
    const eqHoje = c.filters.find(f => f[1] === 'vencimento');
    expect(eqHoje?.[0]).toBe('eq');
    // Padrão ISO yyyy-mm-dd.
    expect(String(eqHoje?.[2])).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('aplica busca textual com .or() combinando nome_cliente, nr_cliente e whatsapp', async () => {
    resultsByTable['acordos_deduplicados'] = [{ data: [], error: null, count: 0 }];

    await fetchAcordos({ busca: 'maria' });

    const c = calls[0];
    expect(c.or).toBe(
      'nome_cliente.ilike.%maria%,nr_cliente.ilike.%maria%,whatsapp.ilike.%maria%'
    );
  });

  it('paginação server-side usa range(from,to) correto e conta acumulada', async () => {
    resultsByTable['acordos_deduplicados'] = [{
      data: new Array(20).fill(0).map((_, i) => ({ id: `a${i}` })),
      error: null,
      count: 123,
    }];

    const r = await fetchAcordos({ page: 3, perPage: 20 });

    // page 3, perPage 20 → from 40, to 59
    expect(calls[0].range).toEqual([40, 59]);
    expect(r.count).toBe(123);
    expect(r.data).toHaveLength(20);
  });

  it('equipe_id SEM membros retorna { data: [], count: 0 } e NÃO aguarda a query principal de acordos', async () => {
    // A ordem real no código é:
    //   1) supabase.from('acordos_deduplicados')  ← builder preparado (não awaitado ainda)
    //   2) supabase.from('perfis')                ← awaitado dentro de resolverOperadoresDaEquipe
    //   3) return antecipado se membros.length === 0 → a query de acordos NÃO é awaitada
    //
    // Então `calls[]` registra ambos builders (preparação), mas o resultado
    // final vem apenas de 'perfis'. Isso prova que não há round-trip para a view.
    resultsByTable['perfis'] = [{ data: [], error: null }];

    const r = await fetchAcordos({ equipe_id: 'eq-1', empresa_id: 'emp-1' });

    expect(r).toEqual({ data: [], count: 0 });

    // Ambos builders são criados, mas só `perfis` é awaitado (defaultResult não é consumido).
    expect(calls.map(c => c.table)).toEqual(['acordos_deduplicados', 'perfis']);
    expect(resultsByTable['perfis']).toHaveLength(0); // fila de perfis foi consumida

    // E o filtro da equipe foi aplicado corretamente na query de perfis.
    const perfisCall = calls[1];
    expect(perfisCall.filters).toEqual([
      ['eq', 'equipe_id',  'eq-1'],
      ['eq', 'empresa_id', 'emp-1'],
    ]);
  });

  it('equipe_id com perfis.data null (sem erro) cai no fallback [] e retorna vazio', async () => {
    // Cobre o ramo `?? []` em resolverOperadoresDaEquipe.
    resultsByTable['perfis'] = [{ data: null, error: null }];

    const r = await fetchAcordos({ equipe_id: 'eq-x' });

    expect(r).toEqual({ data: [], count: 0 });
  });

  it('equipe_id COM membros adiciona .in("operador_id", [ids]) na query principal', async () => {
    resultsByTable['perfis'] = [{
      data: [{ id: 'op-a' }, { id: 'op-b' }],
      error: null,
    }];
    resultsByTable['acordos_deduplicados'] = [{
      data: [{ id: 'acordo-1' }],
      error: null,
      count: 1,
    }];

    const r = await fetchAcordos({ equipe_id: 'eq-1' });

    expect(r.count).toBe(1);
    // Ordem real: builder de acordos_deduplicados é preparado ANTES da resolução da equipe.
    expect(calls.map(c => c.table)).toEqual(['acordos_deduplicados', 'perfis']);

    const acordosCall = calls[0];
    expect(acordosCall.in).toEqual({ col: 'operador_id', values: ['op-a', 'op-b'] });
  });

  it('propaga erro do Supabase via throw', async () => {
    resultsByTable['acordos_deduplicados'] = [{
      data: null,
      error: { message: 'internal server error' },
      count: null,
    }];

    await expect(fetchAcordos()).rejects.toEqual({ message: 'internal server error' });
  });

  it('retorna data:[] e count:0 quando Supabase devolve data:null SEM erro', async () => {
    resultsByTable['acordos_deduplicados'] = [{ data: null, error: null, count: null }];

    const r = await fetchAcordos();

    expect(r.data).toEqual([]);
    expect(r.count).toBe(0);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// verificarNrDuplicado
// ══════════════════════════════════════════════════════════════════════════

describe('verificarNrDuplicado', () => {
  it('nr vazio ou só espaços → { duplicado: false } SEM tocar banco', async () => {
    const r1 = await verificarNrDuplicado('', 'emp-1');
    const r2 = await verificarNrDuplicado('   ', 'emp-1');

    expect(r1).toEqual({ duplicado: false });
    expect(r2).toEqual({ duplicado: false });
    expect(calls).toHaveLength(0);
  });

  it('sem resultado → { duplicado: false } e filtros corretos (Bookplay/nr_cliente)', async () => {
    resultsByTable['acordos'] = [{ data: [], error: null }];

    const r = await verificarNrDuplicado('777', 'emp-1');

    expect(r).toEqual({ duplicado: false });
    const c = calls[0];
    expect(c.table).toBe('acordos');
    expect(c.filters).toEqual([
      ['eq',  'nr_cliente', '777'],
      ['eq',  'empresa_id', 'emp-1'],
      ['neq', 'status',     'nao_pago'],
    ]);
    expect(c.limit).toBe(1);
    expect(String(c.selectArg)).toContain('nr_cliente');
    expect(String(c.selectArg)).toContain('perfis(nome)');
  });

  it('com resultado → devolve dados do acordo existente (incluindo nome do operador via join)', async () => {
    resultsByTable['acordos'] = [{
      data: [{
        id:          'a-1',
        status:      'verificar_pendente',
        operador_id: 'op-1',
        nr_cliente:  '777',
        perfis:      { nome: 'João Operador' },
      }],
      error: null,
    }];

    const r = await verificarNrDuplicado('777', 'emp-1');

    expect(r).toEqual({
      duplicado:             true,
      statusExistente:       'verificar_pendente',
      acordoIdExistente:     'a-1',
      operadorIdExistente:   'op-1',
      operadorNomeExistente: 'João Operador',
    });
  });

  it('acordoIdExcluir adiciona .neq("id", <id>) — usado na edição', async () => {
    resultsByTable['acordos'] = [{ data: [], error: null }];

    await verificarNrDuplicado('777', 'emp-1', 'acordo-atual');

    const c = calls[0];
    expect(c.filters).toContainEqual(['neq', 'id', 'acordo-atual']);
  });

  it('campo "instituicao" (PaguePlay) altera a coluna do eq e do select', async () => {
    resultsByTable['acordos'] = [{
      data: [{
        id:          'a-2',
        status:      'pago',
        operador_id: 'op-2',
        instituicao: 'COREN-BA',
        perfis:      { nome: 'Maria' },
      }],
      error: null,
    }];

    const r = await verificarNrDuplicado('COREN-BA', 'emp-1', undefined, 'instituicao');

    expect(r.duplicado).toBe(true);
    expect(r.operadorNomeExistente).toBe('Maria');
    const c = calls[0];
    expect(c.filters).toContainEqual(['eq', 'instituicao', 'COREN-BA']);
    expect(String(c.selectArg)).toContain('instituicao');
    expect(String(c.selectArg)).not.toContain('nr_cliente');
  });

  it('operadorNomeExistente vira null quando join perfis não trouxe nome', async () => {
    resultsByTable['acordos'] = [{
      data: [{
        id: 'a-3', status: 'pago', operador_id: 'op-3', nr_cliente: '999', perfis: null,
      }],
      error: null,
    }];

    const r = await verificarNrDuplicado('999', 'emp-1');

    expect(r.duplicado).toBe(true);
    expect(r.operadorNomeExistente).toBeNull();
  });
});

// ══════════════════════════════════════════════════════════════════════════
// verificarNrsDuplicadosEmLote
// ══════════════════════════════════════════════════════════════════════════

describe('verificarNrsDuplicadosEmLote', () => {
  it('lista vazia (ou só whitespace) retorna Map vazio SEM tocar banco', async () => {
    const m1 = await verificarNrsDuplicadosEmLote([], 'emp-1');
    const m2 = await verificarNrsDuplicadosEmLote(['', '   '], 'emp-1');

    expect(m1.size).toBe(0);
    expect(m2.size).toBe(0);
    expect(calls).toHaveLength(0);
  });

  it('faz trim + dedupe antes de .in() e mapeia resultados pelo valor da coluna', async () => {
    resultsByTable['acordos'] = [{
      data: [
        { id: 'a-1', nr_cliente: '111', operador_id: 'op-1', perfis: { nome: 'Ana' } },
        { id: 'a-2', nr_cliente: '222', operador_id: 'op-2', perfis: { nome: 'Bruno' } },
      ],
      error: null,
    }];

    const r = await verificarNrsDuplicadosEmLote(
      [' 111 ', '111', '222', '', '   ', '333'],
      'emp-1'
    );

    // Deve ter 3 entradas únicas no .in() (111, 222, 333)
    const c = calls[0];
    expect(c.in?.col).toBe('nr_cliente');
    expect(new Set(c.in?.values)).toEqual(new Set(['111', '222', '333']));

    expect(r.size).toBe(2);
    expect(r.get('111')).toEqual({
      acordoId: 'a-1',
      operadorId: 'op-1',
      operadorNome: 'Ana',
      operadorSetorId: null,
      operadorEquipeId: null,
    });
    expect(r.get('222')).toEqual({
      acordoId: 'a-2',
      operadorId: 'op-2',
      operadorNome: 'Bruno',
      operadorSetorId: null,
      operadorEquipeId: null,
    });
  });

  it('campo "instituicao" muda coluna do select e do .in()', async () => {
    resultsByTable['acordos'] = [{
      data: [{ id: 'a-9', instituicao: 'COREN-SP', operador_id: 'op-9', perfis: { nome: 'Z' } }],
      error: null,
    }];

    await verificarNrsDuplicadosEmLote(['COREN-SP'], 'emp-1', 'instituicao');

    const c = calls[0];
    expect(c.in?.col).toBe('instituicao');
    expect(String(c.selectArg)).toContain('instituicao');
  });

  it('quando perfis.nome é null o mapa usa "Operador desconhecido"', async () => {
    resultsByTable['acordos'] = [{
      data: [{ id: 'a-1', nr_cliente: '111', operador_id: 'op-1', perfis: null }],
      error: null,
    }];

    const r = await verificarNrsDuplicadosEmLote(['111'], 'emp-1');

    expect(r.get('111')?.operadorNome).toBe('Operador desconhecido');
  });

  it('data null / erro → retorna Map vazio (não lança)', async () => {
    resultsByTable['acordos'] = [{ data: null, error: { message: 'x' } }];

    const r = await verificarNrsDuplicadosEmLote(['111'], 'emp-1');

    expect(r.size).toBe(0);
  });

  it('ignora itens cujo valor da coluna está vazio (guarda defensiva)', async () => {
    // Cobre o ramo `if (val)` na iteração do mapeamento.
    resultsByTable['acordos'] = [{
      data: [
        { id: 'a-1', nr_cliente: '',   operador_id: 'op-1', perfis: { nome: 'A' } },
        { id: 'a-2', nr_cliente: null, operador_id: 'op-2', perfis: { nome: 'B' } },
        { id: 'a-3', nr_cliente: '77', operador_id: 'op-3', perfis: { nome: 'C' } },
      ],
      error: null,
    }];

    const r = await verificarNrsDuplicadosEmLote(['77'], 'emp-1');

    // Só o item com valor não-vazio entra no Map.
    expect(r.size).toBe(1);
    expect(r.get('77')?.operadorNome).toBe('C');
  });
});

// ══════════════════════════════════════════════════════════════════════════
// Funções puras (sem Supabase) — usam data do sistema: fixamos "hoje"
// ══════════════════════════════════════════════════════════════════════════

describe('calcularMetricas (pura)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Fixamos meio-dia de 2026-04-22 em UTC para ficar robusto a timezone.
    vi.setSystemTime(new Date('2026-04-22T12:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('conta status e soma valores com segurança (string BR + number)', () => {
    const r = calcularMetricas([
      { id: '1', status: 'pago',                vencimento: '2026-04-10', valor: '100,50' } as any,
      { id: '2', status: 'pago',                vencimento: '2026-04-20', valor: 200      } as any,
      { id: '3', status: 'verificar_pendente',  vencimento: '2026-04-22', valor: '50'     } as any,
      { id: '4', status: 'nao_pago',            vencimento: '2026-04-01', valor: '9999'   } as any,
      // Vencido (vencimento < hoje e status aberto)
      { id: '5', status: 'verificar_pendente',  vencimento: '2026-04-01', valor: 25       } as any,
    ]);

    expect(r.total).toBe(5);
    expect(r.pagos).toBe(2);
    expect(r.pendentes).toBe(2); // 2 verificar_pendente (um deles também é vencido)
    expect(r.cancelados).toBe(1);
    expect(r.vencidos).toBe(1);
    expect(r.em_acompanhamento).toBe(0);

    // Valores: pagos = 100,50 + 200 = 300,50 ; total = 300,50 + 50 + 9999 + 25 = 10374,50
    expect(r.valorPago).toBeCloseTo(300.5, 2);
    expect(r.valorPendente).toBeCloseTo(75, 2);       // 50 + 25
    expect(r.valorVencido).toBeCloseTo(25, 2);
    expect(r.valorTotal).toBeCloseTo(10374.5, 2);
  });

  it('lista vazia → todos zeros', () => {
    const r = calcularMetricas([]);
    expect(r).toEqual({
      total: 0, pagos: 0, pendentes: 0, vencidos: 0,
      em_acompanhamento: 0, cancelados: 0,
      valorTotal: 0, valorPago: 0, valorPendente: 0, valorVencido: 0,
    });
  });
});

describe('calcularMetricasMes (pura)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-22T12:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('filtra só o mês corrente e calcula pagos/abertos/vencidos', () => {
    const r = calcularMetricasMes([
      { id: '1', status: 'pago',               vencimento: '2026-04-05', valor: 100 } as any,
      { id: '2', status: 'verificar_pendente', vencimento: '2026-04-30', valor: 50  } as any,
      { id: '3', status: 'verificar_pendente', vencimento: '2026-04-01', valor: 25  } as any, // vencido
      { id: '4', status: 'pago',               vencimento: '2026-03-15', valor: 999 } as any, // fora do mês
      { id: '5', status: 'nao_pago',           vencimento: '2026-04-20', valor: 77  } as any, // no mês, cancelado
    ]);

    expect(r.inicioMes).toBe('2026-04-01');
    expect(r.fimMes).toBe('2026-04-30');
    expect(r.acordosNoMes).toHaveLength(4);   // 1,2,3,5
    expect(r.pagosNoMes).toBe(1);             // id 1
    expect(r.pendentesNoMes).toBe(2);         // id 2 e 3 (nao_pago é excluído de abertos)
    expect(r.vencidosNoMes).toBe(1);          // id 3

    expect(r.valorPrevisto).toBeCloseTo(100 + 50 + 25 + 77, 2); // todos no mês
    expect(r.valorRecebido).toBeCloseTo(100, 2);
    expect(r.valorAReceber).toBeCloseTo(50 + 25, 2);
  });
});

describe('calcularMetricasDashboard (pura)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-22T12:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('separa "hoje" de "todos" e soma valores com sumSafe', () => {
    const hojeArr = [
      { status: 'pago',               valor: '100', vencimento: '2026-04-22' },
      { status: 'verificar_pendente', valor: '50',  vencimento: '2026-04-22' },
    ];
    const outrosArr = [
      { status: 'verificar_pendente', valor: '30',  vencimento: '2026-04-10' }, // vencido
      { status: 'pago',               valor: '1000',vencimento: '2026-03-01' }, // passado, não vencido
      { status: 'nao_pago',           valor: '77',  vencimento: '2026-04-01' }, // cancelado
    ];

    const r = calcularMetricasDashboard([...hojeArr, ...outrosArr]);

    expect(r.total_geral).toBe(5);
    expect(r.acordos_hoje).toBe(2);
    expect(r.pagos_hoje).toBe(1);
    expect(r.pendentes_hoje).toBe(1);
    expect(r.vencidos).toBe(1);             // só o verificar_pendente vencido
    expect(r.em_acompanhamento).toBe(0);
    expect(r.valor_previsto_hoje).toBeCloseTo(150, 2);
    expect(r.valor_recebido_hoje).toBeCloseTo(100, 2);
  });
});
