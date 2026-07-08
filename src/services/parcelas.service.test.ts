/**
 * parcelas.service.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Cobre adicionarParcelaAoGrupo:
 *  • cenário do incidente BookPlay: acordo 1x Pix pago (entrada) recebe o
 *    boleto do restante como parcela 2 do mesmo grupo;
 *  • acordo antigo sem acordo_grupo_id → grupo é criado antes do insert;
 *  • grupo no meio de um plano maior (3 de 12) → total não muda;
 *  • espelho no acordo do operador vinculado (par Direto↔Extra);
 *  • validações de entrada e status pago → data_pagamento = vencimento.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Acordo } from '@/lib/supabase';

type R = { data: unknown; error: { message: string; code?: string } | null };

const routes: {
  updateAcordo: R;
  insertAcordo: R;
  selectGrupo: R;
  selectVinculo: R;
} = {
  updateAcordo:  { data: null, error: null },
  insertAcordo:  { data: null, error: null },
  selectGrupo:   { data: [], error: null },
  selectVinculo: { data: [], error: null },
};

interface SupabaseCall { table: string; op: string; payload?: unknown; filters: Array<[string, unknown]>; }
const supabaseCalls: SupabaseCall[] = [];

vi.mock('@/lib/supabase', () => {
  const makeBuilder = (table: string) => {
    const state: { op?: string; payload?: unknown; filters: Array<[string, unknown]> } = { filters: [] };
    const terminal = async (): Promise<R> => {
      supabaseCalls.push({ table, op: state.op ?? 'select', payload: state.payload, filters: [...state.filters] });
      if (state.op === 'update') return routes.updateAcordo;
      if (state.op === 'insert') return routes.insertAcordo;
      // Selects: diferencia grupo (acordo_grupo_id) de par vinculado (operador_id).
      if (state.filters.some(([c]) => c === 'operador_id')) return routes.selectVinculo;
      return routes.selectGrupo;
    };
    const builder: Record<string, unknown> = {
      insert: vi.fn((payload: unknown) => { state.op = 'insert'; state.payload = payload; return builder; }),
      update: vi.fn((payload: unknown) => { state.op = 'update'; state.payload = payload; return builder; }),
      select: vi.fn(() => { state.op = state.op ?? 'select'; return builder; }),
      eq:     vi.fn((c: string, v: unknown) => { state.filters.push([c, v]); return builder; }),
      neq:    vi.fn((c: string, v: unknown) => { state.filters.push([`neq:${c}`, v]); return builder; }),
      order:  vi.fn(() => builder),
      limit:  vi.fn(() => builder),
      single:      vi.fn(() => terminal()),
      maybeSingle: vi.fn(() => terminal()),
      then: (resolve: (v: R) => unknown) => terminal().then(resolve),
    };
    return builder;
  };
  return { supabase: { from: vi.fn((t: string) => makeBuilder(t)) } };
});

import { adicionarParcelaAoGrupo } from './parcelas.service';

function makeAcordo(overrides: Partial<Acordo> = {}): Acordo {
  return {
    id: 'a-entrada',
    nome_cliente: 'Cliente Entrada',
    nr_cliente: '777',
    instituicao: null,
    vencimento: '2026-07-08',
    valor: 400,
    tipo: 'pix',
    parcelas: 1,
    whatsapp: null,
    observacoes: null,
    estado_uf: null,
    status: 'pago',
    operador_id: 'op-1',
    setor_id: null,
    empresa_id: 'emp-1',
    numero_parcela: 1,
    acordo_grupo_id: 'grp-1',
    tipo_vinculo: 'direto',
    vinculo_operador_id: null,
    vinculo_operador_nome: null,
    ...overrides,
  } as unknown as Acordo;
}

const inputBoleto = {
  vencimento: '2026-07-20',
  valor:      600,
  tipo:       'boleto',
  status:     'verificar_pendente',
};

beforeEach(() => {
  supabaseCalls.length = 0;
  routes.updateAcordo  = { data: null, error: null };
  routes.insertAcordo  = { data: { id: 'parc-2', numero_parcela: 2, parcelas: 2, acordo_grupo_id: 'grp-1' } as Acordo, error: null };
  routes.selectGrupo   = { data: [{ id: 'a-entrada', numero_parcela: 1, parcelas: 1 }], error: null };
  routes.selectVinculo = { data: [], error: null };
});

describe('adicionarParcelaAoGrupo — cenário entrada Pix + boleto', () => {
  it('insere parcela 2/2 no mesmo grupo com a forma nova e atualiza o total', async () => {
    const r = await adicionarParcelaAoGrupo(makeAcordo(), inputBoleto, { isPaguePlay: false });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.novoTotal).toBe(2);
    expect(r.novaParcela.id).toBe('parc-2');

    const insert = supabaseCalls.find(c => c.op === 'insert');
    expect(insert?.payload).toMatchObject({
      nr_cliente:      '777',
      acordo_grupo_id: 'grp-1',
      numero_parcela:  2,
      parcelas:        2,
      vencimento:      '2026-07-20',
      valor:           600,
      tipo:            'boleto',
      status:          'verificar_pendente',
      operador_id:     'op-1',
      empresa_id:      'emp-1',
      // fora do rateio PP
      valor_total:       null,
      usou_quarenta_pct: false,
    });

    // Linhas antigas do grupo recebem parcelas=2 (excluindo a recém-criada).
    const updTotal = supabaseCalls.find(c => c.op === 'update');
    expect(updTotal?.payload).toMatchObject({ parcelas: 2 });
    expect(updTotal?.filters).toContainEqual(['acordo_grupo_id', 'grp-1']);
    expect(updTotal?.filters).toContainEqual(['neq:id', 'parc-2']);
  });

  it('status pago → data_pagamento acompanha o vencimento (recebimento por vencimento)', async () => {
    const r = await adicionarParcelaAoGrupo(
      makeAcordo(),
      { ...inputBoleto, status: 'pago' },
      { isPaguePlay: false },
    );
    expect(r.ok).toBe(true);

    const insert = supabaseCalls.find(c => c.op === 'insert');
    expect(insert?.payload).toMatchObject({ status: 'pago', data_pagamento: '2026-07-20' });
  });
});

describe('adicionarParcelaAoGrupo — acordo sem grupo', () => {
  it('cria acordo_grupo_id no acordo base antes de inserir a parcela', async () => {
    const base = makeAcordo({ acordo_grupo_id: null });
    const r = await adicionarParcelaAoGrupo(base, inputBoleto, { isPaguePlay: false });
    expect(r.ok).toBe(true);

    // 1ª chamada: update agrupando o acordo base.
    const updGrupo = supabaseCalls.find(c => c.op === 'update' &&
      typeof (c.payload as Record<string, unknown>)?.acordo_grupo_id === 'string');
    expect(updGrupo).toBeTruthy();
    expect(updGrupo?.payload).toMatchObject({ numero_parcela: 1 });

    // O insert usa o mesmo grupo gerado.
    const insert = supabaseCalls.find(c => c.op === 'insert');
    expect((insert?.payload as Record<string, unknown>).acordo_grupo_id)
      .toBe((updGrupo?.payload as Record<string, unknown>).acordo_grupo_id);
  });
});

describe('adicionarParcelaAoGrupo — plano maior em andamento', () => {
  it('3 de 12 parcelas: nova vira 4 e o total 12 permanece (sem update de total)', async () => {
    routes.selectGrupo = {
      data: [
        { id: 'p1', numero_parcela: 1, parcelas: 12 },
        { id: 'p2', numero_parcela: 2, parcelas: 12 },
        { id: 'p3', numero_parcela: 3, parcelas: 12 },
      ],
      error: null,
    };
    routes.insertAcordo = { data: { id: 'p4', numero_parcela: 4, parcelas: 12 } as Acordo, error: null };

    const r = await adicionarParcelaAoGrupo(
      makeAcordo({ parcelas: 12, numero_parcela: 1 }),
      inputBoleto,
      { isPaguePlay: false },
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.novoTotal).toBe(12);

    const insert = supabaseCalls.find(c => c.op === 'insert');
    expect(insert?.payload).toMatchObject({ numero_parcela: 4, parcelas: 12 });

    // Total não mudou → nenhum update de parcelas.
    const updTotal = supabaseCalls.find(c => c.op === 'update');
    expect(updTotal).toBeUndefined();
  });
});

describe('adicionarParcelaAoGrupo — espelho no vínculo Direto↔Extra', () => {
  it('base com vinculo_operador_id: insere parcela também no grupo do par', async () => {
    routes.selectVinculo = {
      data: [{
        ...makeAcordo({
          id: 'a-par', operador_id: 'op-2', acordo_grupo_id: 'grp-2',
          tipo_vinculo: 'extra', vinculo_operador_id: 'op-1', vinculo_operador_nome: 'Op Um',
        }),
      }],
      error: null,
    };

    const base = makeAcordo({ vinculo_operador_id: 'op-2', vinculo_operador_nome: 'Op Dois' });
    const r = await adicionarParcelaAoGrupo(base, inputBoleto, { isPaguePlay: false });
    expect(r.ok).toBe(true);

    const inserts = supabaseCalls.filter(c => c.op === 'insert');
    expect(inserts.length).toBe(2);

    // Espelho pertence ao grupo e ao operador do par.
    const espelho = inserts.find(c =>
      (c.payload as Record<string, unknown>).operador_id === 'op-2');
    expect(espelho?.payload).toMatchObject({
      acordo_grupo_id: 'grp-2',
      vencimento:      '2026-07-20',
      valor:           600,
      tipo:            'boleto',
    });
  });

  it('sem vinculo_operador_id: não consulta o par', async () => {
    await adicionarParcelaAoGrupo(makeAcordo(), inputBoleto, { isPaguePlay: false });
    const selectPar = supabaseCalls.find(c => c.filters.some(([col]) => col === 'operador_id'));
    expect(selectPar).toBeUndefined();
  });
});

describe('adicionarParcelaAoGrupo — validações', () => {
  it('valor inválido → erro sem tocar no banco', async () => {
    const r = await adicionarParcelaAoGrupo(makeAcordo(), { ...inputBoleto, valor: 0 }, { isPaguePlay: false });
    expect(r.ok).toBe(false);
    expect(supabaseCalls.length).toBe(0);
  });

  it('vencimento vazio → erro sem tocar no banco', async () => {
    const r = await adicionarParcelaAoGrupo(makeAcordo(), { ...inputBoleto, vencimento: '' }, { isPaguePlay: false });
    expect(r.ok).toBe(false);
    expect(supabaseCalls.length).toBe(0);
  });

  it('erro no insert → repassa a mensagem', async () => {
    routes.insertAcordo = { data: null, error: { message: 'RLS denied' } };
    const r = await adicionarParcelaAoGrupo(makeAcordo(), inputBoleto, { isPaguePlay: false });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erro).toMatch(/RLS denied/);
  });
});
