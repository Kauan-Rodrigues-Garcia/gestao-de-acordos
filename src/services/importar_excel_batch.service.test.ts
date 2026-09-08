import { describe, it, expect, vi, beforeEach } from 'vitest';

// SUT
import { processarImportacaoEmLote, type ProcessarBatchParams } from './importar_excel_batch.service';
import { criarNotificacao } from './notificacoes.service';
import { enviarParaLixeira } from './lixeira.service';
import { registrarLog } from './logs.service';

// ── Mock do Supabase (estilo builder thenable) ──────────────────────────
/** O que o `insert`/`update` recebe: uma linha, ou um lote delas. */
type PayloadMock = Record<string, unknown> | Record<string, unknown>[];

/** Uma resposta que o builder devolve no lugar da do Supabase. */
interface ResultadoMock { data: unknown; error: { message: string; code?: string } | null }

/** O registro de uma chamada, para as asserções lerem depois. */
interface ChamadaMock {
  table:      string;
  operation:  'select' | 'insert' | 'update' | 'delete' | null;
  selectArg?: string;
  payload?:   PayloadMock;
  filters:    [string, string, unknown][];
}

/** O encadeamento do supabase-js, no pedaço que este teste usa. */
interface BuilderMock {
  select:      (arg?: string) => BuilderMock;
  insert:      (p: PayloadMock) => BuilderMock;
  update:      (p: PayloadMock) => BuilderMock;
  delete:      () => BuilderMock;
  eq:          (col: string, val: unknown) => BuilderMock;
  maybeSingle: () => BuilderMock;
  then:        (ok: (v: ResultadoMock) => unknown, erro?: (e: unknown) => unknown) => Promise<unknown>;
}

/**
 * Lê o payload como objeto único.
 *
 * `PayloadMock` é união (linha ou lote) porque o serviço manda os dois casos.
 * As asserções que olham UM campo sabem qual delas estão vendo; esta função é
 * onde esse conhecimento fica escrito, em vez de espalhar asserção de tipo.
 */
const comoObjeto = (p: PayloadMock | undefined): Record<string, unknown> =>
  (p ?? {}) as Record<string, unknown>;

const calls: ChamadaMock[] = [];
let defaultResult: ResultadoMock = { data: null, error: null };
const resultsByTable: Record<string, ResultadoMock[]> = {};

function nextResultFor(table: string) {
  const queue = resultsByTable[table];
  if (queue && queue.length > 0) return queue.shift()!;
  return defaultResult;
}

function createBuilder(table: string) {
  const call: ChamadaMock = { table, operation: null, filters: [] };
  calls.push(call);
  const builder: BuilderMock = {
    select: vi.fn((arg?: string) => { call.operation = 'select'; call.selectArg = arg; return builder; }),
    insert: vi.fn((p: PayloadMock) => { call.operation = 'insert'; call.payload = p; return builder; }),
    update: vi.fn((p: PayloadMock) => { call.operation = 'update'; call.payload = p; return builder; }),
    delete: vi.fn(() => { call.operation = 'delete'; return builder; }),
    eq:     vi.fn((col: string, val: unknown) => { call.filters.push(['eq', col, val]); return builder; }),
    maybeSingle: vi.fn(() => builder),
    then: (resolve: (v: ResultadoMock) => unknown, reject?: (e: unknown) => unknown) => {
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

// Mocks de serviços auxiliares
vi.mock('@/services/notificacoes.service', () => ({
  criarNotificacao: vi.fn().mockResolvedValue(undefined)
}));
vi.mock('@/services/lixeira.service', () => ({
  enviarParaLixeira: vi.fn().mockResolvedValue({ ok: true })
}));
// Trilha de auditoria (Logs 2.0, migration 20260812a). O serviço não escreve
// mais na tabela `logs_sistema`: chama `registrarLog`, que fala com a RPC.
vi.mock('@/services/logs.service', () => ({
  registrarLog: vi.fn().mockResolvedValue('log-id')
}));

describe('processarImportacaoEmLote', () => {
  const opAtual = { id: 'op-1', nome: 'Operador 1' };
  const empresaId = 'emp-1';

  beforeEach(() => {
    calls.length = 0;
    defaultResult = { data: null, error: null };
    for (const k of Object.keys(resultsByTable)) delete resultsByTable[k];
    vi.clearAllMocks();
  });

  it('apenas novos: classificação com apenas "novo" → chama insert uma vez', async () => {
    resultsByTable['acordos'] = [{ data: [{ id: 'a1' }], error: null }];

    const params: ProcessarBatchParams = {
      payloads: [{ linhaOriginal: 1, nr: 'NR1', registro: { nr_cliente: 'NR1' }, nomeCliente: 'C1' }],
      classificacao: [{ linhaOriginal: 1, nr: 'NR1', categoria: 'novo' }],
      linhasAutorizadas: new Set(),
      operadorAtual: opAtual,
      empresaId,
      labelNr: 'NR',
      isPaguePlay: false
    };

    const res = await processarImportacaoEmLote(params);

    expect(res.inseridos).toBe(1);
    expect(calls[0].table).toBe('acordos');
    // .insert(lote).select('id') faz a última operação ser 'select'
    expect(calls[0].operation).toBe('select');
    expect(calls[0].payload).toEqual([{ nr_cliente: 'NR1' }]);
  });

  it('extra (Caso A): insere como extra + update no original + notificação', async () => {
    resultsByTable['acordos'] = [
      { data: null, error: null }, // insert novo
      { data: null, error: null }, // update antigo
    ];

    const params: ProcessarBatchParams = {
      payloads: [{ linhaOriginal: 1, nr: 'NR1', registro: { nr_cliente: 'NR1' }, nomeCliente: 'C1' }],
      classificacao: [{ 
        linhaOriginal: 1, nr: 'NR1', categoria: 'extra', 
        donoAtual: { acordoId: 'old-a', operadorId: 'op-old', operadorNome: 'Antigo' } 
      }],
      linhasAutorizadas: new Set(),
      operadorAtual: opAtual,
      empresaId,
      labelNr: 'NR',
      isPaguePlay: false
    };

    const res = await processarImportacaoEmLote(params);

    expect(res.inseridos).toBe(1);
    
    // Insert do novo acordo como EXTRA
    const callInsert = calls.find(c => c.operation === 'insert' && c.table === 'acordos');
    expect(comoObjeto(callInsert?.payload).tipo_vinculo).toBe('extra');
    expect(comoObjeto(callInsert?.payload).vinculo_operador_id).toBe('op-old');

    // Update do acordo original
    const callUpdate = calls.find(c => c.operation === 'update' && c.table === 'acordos');
    expect(callUpdate?.filters).toContainEqual(['eq', 'id', 'old-a']);
    expect(comoObjeto(callUpdate?.payload).vinculo_operador_id).toBe(opAtual.id);

    expect(criarNotificacao).toHaveBeenCalled();
  });

  it('extra órfão (aba EXTRA sem dono): insere como extra com vínculo nulo, sem update/notificação', async () => {
    resultsByTable['acordos'] = [
      { data: null, error: null }, // insert novo (extra órfão)
    ];

    const params: ProcessarBatchParams = {
      payloads: [{ linhaOriginal: 1000001, nr: 'NR1', registro: { nr_cliente: 'NR1' }, nomeCliente: 'C1' }],
      classificacao: [{ linhaOriginal: 1000001, nr: 'NR1', categoria: 'extra' }], // sem donoAtual
      linhasAutorizadas: new Set(),
      operadorAtual: opAtual,
      empresaId,
      labelNr: 'NR',
      isPaguePlay: false
    };

    const res = await processarImportacaoEmLote(params);

    expect(res.inseridos).toBe(1);

    const callInsert = calls.find(c => c.operation === 'insert' && c.table === 'acordos');
    expect(comoObjeto(callInsert?.payload).tipo_vinculo).toBe('extra');
    expect(comoObjeto(callInsert?.payload).vinculo_operador_id).toBeNull();
    expect(comoObjeto(callInsert?.payload).vinculo_operador_nome).toBeNull();

    // Não deve haver update (nada a vincular) nem notificação.
    expect(calls.find(c => c.operation === 'update')).toBeUndefined();
    expect(criarNotificacao).not.toHaveBeenCalled();
  });

  it('direto cruzado (Caso B): rebaixa antigo + delete nr + insert novo + notificação', async () => {
    resultsByTable['acordos'] = [
      { data: null, error: null }, // update (rebaixar)
      { data: null, error: null }, // insert novo
    ];
    resultsByTable['nr_registros'] = [{ data: null, error: null }];

    const params: ProcessarBatchParams = {
      payloads: [{ linhaOriginal: 1, nr: 'NR1', registro: { nr_cliente: 'NR1' }, nomeCliente: 'C1' }],
      classificacao: [{ 
        linhaOriginal: 1, nr: 'NR1', categoria: 'direto', 
        donoAtual: { acordoId: 'old-a', operadorId: 'op-old', operadorNome: 'Antigo' } 
      }],
      linhasAutorizadas: new Set(),
      operadorAtual: opAtual,
      empresaId,
      labelNr: 'NR',
      isPaguePlay: false
    };

    const res = await processarImportacaoEmLote(params);

    expect(res.inseridos).toBe(1);

    // Rebaixar antigo
    const callUpdate = calls.find(c => c.operation === 'update' && c.table === 'acordos');
    expect(comoObjeto(callUpdate?.payload).tipo_vinculo).toBe('extra');

    // Deletar NR
    const callDelete = calls.find(c => c.operation === 'delete' && c.table === 'nr_registros');
    expect(callDelete.filters).toContainEqual(['eq', 'acordo_id', 'old-a']);

    // Inserir novo DIRETO
    const callInsert = calls.find(c => c.operation === 'insert' && c.table === 'acordos');
    expect(comoObjeto(callInsert?.payload).tipo_vinculo).toBe('direto');

    expect(criarNotificacao).toHaveBeenCalled();
  });

  it('duplicado não autorizado: categoria "duplicado" sem autorização → fica em bloqueados', async () => {
    const params: ProcessarBatchParams = {
      payloads: [{ linhaOriginal: 1, nr: 'NR1', registro: { nr_cliente: 'NR1' }, nomeCliente: 'C1' }],
      classificacao: [{ 
        linhaOriginal: 1, nr: 'NR1', categoria: 'duplicado', 
        donoAtual: { acordoId: 'old-a', operadorId: 'op-old', operadorNome: 'Antigo' } 
      }],
      linhasAutorizadas: new Set(),
      operadorAtual: opAtual,
      empresaId,
      labelNr: 'NR',
      isPaguePlay: false
    };

    const res = await processarImportacaoEmLote(params);

    expect(res.inseridos).toBe(0);
    expect(res.bloqueados).toHaveLength(1);
    expect(res.bloqueados[0].motivo).toMatch(/autorização/i);
    expect(calls).toHaveLength(0);
  });

  it('duplicado autorizado (Caso C): transferência completa', async () => {
    resultsByTable['acordos'] = [
      { data: { id: 'old-a', nome_cliente: 'C1' }, error: null }, // maybeSingle
      { data: null, error: null }, // delete
      { data: null, error: null }, // insert novo
    ];

    const params: ProcessarBatchParams = {
      payloads: [{ linhaOriginal: 1, nr: 'NR1', registro: { nr_cliente: 'NR1' }, nomeCliente: 'C1' }],
      classificacao: [{ 
        linhaOriginal: 1, nr: 'NR1', categoria: 'duplicado', 
        donoAtual: { acordoId: 'old-a', operadorId: 'op-old', operadorNome: 'Antigo' } 
      }],
      linhasAutorizadas: new Set([1]),
      autorizador: { uid: 'lider-1', nome: 'Lider', perfil: 'lider' },
      operadorAtual: opAtual,
      empresaId,
      labelNr: 'NR',
      isPaguePlay: false
    };

    const res = await processarImportacaoEmLote(params);

    expect(res.inseridos).toBe(1);
    expect(enviarParaLixeira).toHaveBeenCalled();
    
    const callDelete = calls.find(c => c.operation === 'delete' && c.table === 'acordos');
    expect(callDelete.filters).toContainEqual(['eq', 'id', 'old-a']);

    // Auditoria: a transferência de titularidade e o resumo da importação.
    // As duas coisas são eventos distintos e as duas precisam existir — o
    // primeiro explica de quem para quem o NR passou e quem autorizou; o segundo
    // explica quantas linhas do arquivo entraram.
    const logs = vi.mocked(registrarLog).mock.calls.map(c => c[0]);

    const logTransferencia = logs.find(l => l.acao === 'acordo_transferido');
    expect(logTransferencia).toBeDefined();
    expect(logTransferencia!.categoria).toBe('importacao');
    expect(logTransferencia!.registroId).toBe('old-a');
    expect(logTransferencia!.detalhes).toMatchObject({
      nr: 'NR1',
      aprovado_por: 'Lider',
      operador_anterior: 'op-old',
      operador_novo: 'op-1',
    });

    const logResumo = logs.find(l => l.acao === 'importacao_concluida');
    expect(logResumo).toBeDefined();
    expect(logResumo!.detalhes).toMatchObject({ linhas_no_arquivo: 1, inseridos: 1 });

    expect(criarNotificacao).toHaveBeenCalled();
  });

  it('duplicado do próprio operador: pula e adiciona aos bloqueados', async () => {
    const params: ProcessarBatchParams = {
      payloads: [{ linhaOriginal: 1, nr: 'NR1', registro: { nr_cliente: 'NR1' }, nomeCliente: 'C1' }],
      classificacao: [{ 
        linhaOriginal: 1, nr: 'NR1', categoria: 'duplicado', 
        donoAtual: { acordoId: 'old-a', operadorId: opAtual.id, operadorNome: opAtual.nome } 
      }],
      linhasAutorizadas: new Set(),
      operadorAtual: opAtual,
      empresaId,
      labelNr: 'NR',
      isPaguePlay: false
    };

    const res = await processarImportacaoEmLote(params);

    expect(res.inseridos).toBe(0);
    expect(res.bloqueados).toHaveLength(1);
    expect(res.bloqueados[0].motivo).toMatch(/já pertence ao operador atual/i);
    expect(calls).toHaveLength(0);
  });
});
