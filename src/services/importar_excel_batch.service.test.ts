import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock do Supabase (estilo builder thenable) ──────────────────────────
const calls: any[] = [];
let defaultResult: any = { data: null, error: null };
const resultsByTable: Record<string, any[]> = {};

function nextResultFor(table: string) {
  const queue = resultsByTable[table];
  if (queue && queue.length > 0) return queue.shift()!;
  return defaultResult;
}

function createBuilder(table: string) {
  const call: any = { table, operation: null, filters: [] };
  calls.push(call);
  const builder: any = {
    select: vi.fn((arg?: any) => { call.operation = 'select'; call.selectArg = arg; return builder; }),
    insert: vi.fn((p: any) => { call.operation = 'insert'; call.payload = p; return builder; }),
    update: vi.fn((p: any) => { call.operation = 'update'; call.payload = p; return builder; }),
    delete: vi.fn(() => { call.operation = 'delete'; return builder; }),
    eq:     vi.fn((col: string, val: any) => { call.filters.push(['eq', col, val]); return builder; }),
    maybeSingle: vi.fn(() => builder),
    then: (resolve: any, reject: any) => {
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

// SUT
import { processarImportacaoEmLote } from './importar_excel_batch.service';
import { criarNotificacao } from './notificacoes.service';
import { enviarParaLixeira } from './lixeira.service';

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

    const params: any = {
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

    const params: any = {
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
    expect(callInsert.payload.tipo_vinculo).toBe('extra');
    expect(callInsert.payload.vinculo_operador_id).toBe('op-old');

    // Update do acordo original
    const callUpdate = calls.find(c => c.operation === 'update' && c.table === 'acordos');
    expect(callUpdate.filters).toContainEqual(['eq', 'id', 'old-a']);
    expect(callUpdate.payload.vinculo_operador_id).toBe(opAtual.id);

    expect(criarNotificacao).toHaveBeenCalled();
  });

  it('direto cruzado (Caso B): rebaixa antigo + delete nr + insert novo + notificação', async () => {
    resultsByTable['acordos'] = [
      { data: null, error: null }, // update (rebaixar)
      { data: null, error: null }, // insert novo
    ];
    resultsByTable['nr_registros'] = [{ data: null, error: null }];

    const params: any = {
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
    expect(callUpdate.payload.tipo_vinculo).toBe('extra');

    // Deletar NR
    const callDelete = calls.find(c => c.operation === 'delete' && c.table === 'nr_registros');
    expect(callDelete.filters).toContainEqual(['eq', 'acordo_id', 'old-a']);

    // Inserir novo DIRETO
    const callInsert = calls.find(c => c.operation === 'insert' && c.table === 'acordos');
    expect(callInsert.payload.tipo_vinculo).toBe('direto');

    expect(criarNotificacao).toHaveBeenCalled();
  });

  it('duplicado não autorizado: categoria "duplicado" sem autorização → fica em bloqueados', async () => {
    const params: any = {
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
    resultsByTable['logs_sistema'] = [{ data: null, error: null }];

    const params: any = {
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

    const callLog = calls.find(c => c.operation === 'insert' && c.table === 'logs_sistema');
    expect(callLog.payload.acao).toBe('transferencia_nr_import');

    expect(criarNotificacao).toHaveBeenCalled();
  });

  it('duplicado do próprio operador: pula e adiciona aos bloqueados', async () => {
    const params: any = {
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
