/**
 * pix_automatico.pago.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * A regra que mudou em 11/08/2026: quem tranca um NR no Pix automático é o
 * PAGAMENTO, não mais o registro histórico.
 *
 *   bloqueia  →  existe acordo VIVO com status 'aprovado' E pago = true
 *   libera    →  qualquer outra coisa, inclusive acordo aprovado ainda a pagar
 *
 * O outro lado da mesma regra: linha paga não pode ser excluída. Sem isso o
 * bloqueio seria um portão que qualquer um abre apagando a linha.
 *
 * Estes testes fixam o lado do CLIENTE. A palavra final é do banco
 * (`fn_pix_nr_bloqueia_duplicado` v3 e `trg_pix_a_impede_pago`, migration
 * 20260811a) — o que se protege aqui é a tela dizer a MESMA coisa que ele, e
 * não gravar na lixeira uma cópia que o delete seguinte vai recusar.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

type MockResult<T = unknown> = { data: T; error: { message: string } | null };

interface BuilderCall {
  table: string;
  operation: 'select' | 'insert' | 'update' | 'delete' | null;
  payload?: unknown;
  filters: Array<[string, string, unknown]>;
}

const calls: BuilderCall[] = [];

/**
 * Fila de respostas, uma por chamada, na ordem em que o service as faz.
 * `excluirAcordoPix` encadeia leitura → lixeira → delete: uma resposta única
 * para tudo não conseguiria distinguir "leu a linha" de "gravou na lixeira".
 */
let fila: MockResult[] = [];
function proxima(): MockResult {
  return fila.shift() ?? { data: null, error: null };
}

function createBuilder(table: string) {
  const call: BuilderCall = { table, operation: null, filters: [] };
  calls.push(call);

  const builder = {
    select: vi.fn(() => builder),
    insert: vi.fn((p: unknown) => { call.operation = 'insert'; call.payload = p; return builder; }),
    update: vi.fn((p: unknown) => { call.operation = 'update'; call.payload = p; return builder; }),
    delete: vi.fn(() => { call.operation = 'delete'; return builder; }),
    eq:     vi.fn((c: string, v: unknown) => { call.filters.push(['eq', c, v]); return builder; }),
    neq:    vi.fn((c: string, v: unknown) => { call.filters.push(['neq', c, v]); return builder; }),
    in:     vi.fn((c: string, v: unknown) => { call.filters.push(['in', c, v]); return builder; }),
    maybeSingle: vi.fn(() => Promise.resolve(proxima())),
    then: (resolve: (v: MockResult) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(proxima()).then(resolve, reject),
  };
  // `select` sem operação anterior é leitura; com insert/update/delete antes é
  // só o "RETURNING". Marca depois de criar o objeto para não sobrescrever.
  builder.select = vi.fn(() => {
    if (call.operation === null) call.operation = 'select';
    return builder;
  });
  return builder;
}

vi.mock('@/lib/supabase', () => ({
  supabase: { from: vi.fn((t: string) => createBuilder(t)), rpc: vi.fn() },
}));

import {
  fetchNrsBloqueados, fetchNrsEmUso, excluirAcordoPix, reavaliarAcordoPix,
} from './pix_automatico.service';

const LINHA_PAGA = {
  id: 'ac-1', empresa_id: 'emp-1', operador_id: 'op-1', operador_nome: 'Ana',
  setor_id: 'set-1', nr_cliente: 'NR-100', valor: 300, status: 'aprovado',
  pct_comissao: 0.25, avaliado_por: null, avaliado_por_nome: null, avaliado_em: null,
  pago: true, pago_em: '2026-08-01T12:00:00Z', pago_por: 'lid-1', pago_por_nome: 'Bryan',
  criado_em: '2026-07-30T09:00:00Z', atualizado_em: '2026-08-01T12:00:00Z',
};
const LINHA_A_PAGAR = { ...LINHA_PAGA, id: 'ac-2', nr_cliente: 'NR-200', pago: false, pago_em: null, pago_por: null, pago_por_nome: null };

beforeEach(() => {
  calls.length = 0;
  fila = [];
});

// ── Quem tranca o NR ────────────────────────────────────────────────────────

describe('fetchNrsBloqueados', () => {
  it('lê a tabela de ACORDOS filtrando aprovado + pago', async () => {
    fila = [{ data: [{ nr_cliente: 'NR-100' }], error: null }];
    await fetchNrsBloqueados('emp-1');

    const c = calls[0];
    expect(c.table).toBe('pix_automatico_acordos');
    expect(c.filters).toContainEqual(['eq', 'status', 'aprovado']);
    expect(c.filters).toContainEqual(['eq', 'pago', true]);
  });

  it('NÃO consulta mais o registro histórico — foi ele que travou o time', async () => {
    fila = [{ data: [], error: null }];
    await fetchNrsBloqueados('emp-1');
    expect(calls.map(c => c.table)).not.toContain('pix_automatico_nr_registro');
  });

  it('normaliza o NR para casar com a comparação do banco', async () => {
    fila = [{ data: [{ nr_cliente: '  Nr-100  ' }], error: null }];
    const set = await fetchNrsBloqueados('emp-1');
    expect(set.has('nr-100')).toBe(true);
  });

  it('erro na consulta devolve conjunto vazio, não exceção', async () => {
    fila = [{ data: null, error: { message: 'timeout' } }];
    await expect(fetchNrsBloqueados('emp-1')).resolves.toEqual(new Set());
  });
});

describe('fetchNrsEmUso', () => {
  // Dedupe da IMPORTAÇÃO, mais apertado que o bloqueio do banco de propósito:
  // subir a mesma planilha duas vezes duplicaria as linhas em silêncio.
  it('pega tudo que não foi descartado', async () => {
    fila = [{ data: [{ nr_cliente: 'NR-1' }, { nr_cliente: 'NR-2' }], error: null }];
    const set = await fetchNrsEmUso('emp-1');

    expect(calls[0].filters).toContainEqual(['neq', 'status', 'desaprovado']);
    expect(set).toEqual(new Set(['nr-1', 'nr-2']));
  });
});

// ── Linha paga não se exclui ────────────────────────────────────────────────

describe('excluirAcordoPix', () => {
  it('recusa a linha paga ANTES de gravar na lixeira', async () => {
    fila = [{ data: LINHA_PAGA, error: null }];

    const r = await excluirAcordoPix('ac-1', { id: 'lid-1', nome: 'Bryan' });

    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/já foi paga/i);
    // Só a leitura aconteceu: nada de cópia na lixeira nem delete.
    expect(calls.map(c => c.table)).toEqual(['pix_automatico_acordos']);
    expect(calls.some(c => c.operation === 'insert')).toBe(false);
    expect(calls.some(c => c.operation === 'delete')).toBe(false);
  });

  it('aprovado ainda A PAGAR vai para a lixeira normalmente', async () => {
    fila = [
      { data: LINHA_A_PAGAR, error: null },   // leitura
      { data: null, error: null },            // insert na lixeira
      { data: null, error: null },            // delete
    ];

    const r = await excluirAcordoPix('ac-2', { id: 'lid-1', nome: 'Bryan' });

    expect(r.ok).toBe(true);
    expect(calls.map(c => c.table)).toEqual([
      'pix_automatico_acordos', 'lixeira_pix_automatico', 'pix_automatico_acordos',
    ]);
    // Quem apagou fica gravado — é a metade da auditoria que vive no cliente.
    const snapshot = calls[1].payload as { excluido_por: string; excluido_por_nome: string };
    expect(snapshot.excluido_por).toBe('lid-1');
    expect(snapshot.excluido_por_nome).toBe('Bryan');
  });

  it('linha que sumiu entre a lista e o clique dá mensagem de recarregar', async () => {
    fila = [{ data: null, error: null }];
    const r = await excluirAcordoPix('ac-9');
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/recarregue/i);
  });
});

// ── Pago não volta para pendente ────────────────────────────────────────────

describe('reavaliarAcordoPix', () => {
  it('filtra por pago = false — pendente com pagamento feito não pode existir', async () => {
    fila = [{ data: [{ id: 'ac-2' }], error: null }];
    await reavaliarAcordoPix('ac-2');
    expect(calls[0].filters).toContainEqual(['eq', 'pago', false]);
  });

  it('zero linhas afetadas vira "desfaça o pagamento", não sucesso silencioso', async () => {
    fila = [{ data: [], error: null }];
    const r = await reavaliarAcordoPix('ac-1');
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/desfaça o pagamento/i);
  });
});
