/**
 * pix_nr_duplicidade.test.ts — de quem é o NR, e quem assina a exceção.
 *
 * A regra que estes testes fixam (09/09/2026):
 *
 *   • acordo tabulado na aba Acordos e depois registrado no Pix pela MESMA
 *     pessoa não é duplicidade — é o mesmo acordo acompanhado nos dois lugares,
 *     e é assim que ela recebe a premiação;
 *   • a mesma pessoa registrando o mesmo NR duas vezes DENTRO do Pix é engano,
 *     e não vai para a fila do líder;
 *   • pessoas diferentes, principalmente de setores diferentes, é o caso do
 *     pedido — e a autorização é dos DOIS líderes.
 *
 * A palavra final é do banco (`fn_pix_nr_bloqueia_duplicado` v6 e
 * `fn_pix_nr_pedido_decidir`, migration 20260909110000). O que se protege aqui
 * é a tela dizer a MESMA coisa que ele: se discordarem, ou ela promete o que o
 * banco recusa, ou esconde o botão de quem podia clicar.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

type MockResult<T = unknown> = { data: T; error: { message: string } | null };

interface BuilderCall {
  table: string;
  filters: Array<[string, string, unknown]>;
}

const calls: BuilderCall[] = [];
let fila: MockResult[] = [];

function createBuilder(table: string) {
  const call: BuilderCall = { table, filters: [] };
  calls.push(call);

  const builder = {
    select: vi.fn(() => builder),
    eq:  vi.fn((c: string, v: unknown) => { call.filters.push(['eq', c, v]); return builder; }),
    neq: vi.fn((c: string, v: unknown) => { call.filters.push(['neq', c, v]); return builder; }),
    in:  vi.fn((c: string, v: unknown) => { call.filters.push(['in', c, v]); return builder; }),
    gte: vi.fn((c: string, v: unknown) => { call.filters.push(['gte', c, v]); return builder; }),
    lte: vi.fn((c: string, v: unknown) => { call.filters.push(['lte', c, v]); return builder; }),
    order: vi.fn(() => builder),
    range: vi.fn(() => builder),
    then: (resolve: (v: MockResult) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(fila.shift() ?? { data: [], error: null }).then(resolve, reject),
  };
  return builder;
}

vi.mock('@/lib/supabase', () => ({
  supabase: { from: vi.fn((t: string) => createBuilder(t)), rpc: vi.fn() },
}));

import {
  ladosDoPedidoNr, setorDoLadoNr, podeAssinarLadoNr, estadoDoPedidoNr,
  fetchDonosDeNrPix, fetchAcordosRecorrentesSemPix,
  type PixNrPedido, type PixNrAprovacao,
} from './pix_automatico.service';

beforeEach(() => { calls.length = 0; fila = []; });

/** Um pedido com o mínimo que as funções puras leem. */
function pedido(over: Partial<PixNrPedido> = {}): PixNrPedido {
  return {
    id: 'ped-1', empresa_id: 'emp-1',
    operador_id: 'nicole', operador_nome: 'Nicole', setor_id: 'play3',
    nr_cliente: '23323', valor: 1000, extra: false,
    conflito_acordo_id: 'ac-1', conflito_operador: 'Ana',
    conflito_operador_id: 'ana', conflito_setor_id: 'receptivo',
    conflito_valor: 1000, conflito_status: 'aprovado',
    conflito_em: '2026-09-01T12:00:00Z',
    motivo: null, status: 'pendente',
    decidido_por: null, decidido_por_nome: null, decidido_em: null,
    decisao_motivo: null, acordo_id: null, criado_por: 'nicole',
    criado_em: '2026-09-02T12:00:00Z',
    ...over,
  };
}

function assinatura(over: Partial<PixNrAprovacao> = {}): PixNrAprovacao {
  return {
    id: 'ap-1', pedido_id: 'ped-1', lado: 'solicitante', setor_id: 'play3',
    aprovador_id: 'lider-play3', aprovador_nome: 'Bryan', aprovado: true,
    motivo: null, criado_em: '2026-09-02T13:00:00Z',
    ...over,
  };
}

// ── Quantas assinaturas o caso pede ─────────────────────────────────────────

describe('ladosDoPedidoNr', () => {
  it('setores diferentes: os DOIS líderes assinam', () => {
    // O caso da operação: NR 23323 é do Receptivo, a Nicole é do Play 3.
    expect(ladosDoPedidoNr(pedido())).toEqual(['solicitante', 'conflito']);
  });

  it('mesmo setor: um líder só — não há segundo a ouvir', () => {
    expect(ladosDoPedidoNr(pedido({ conflito_setor_id: 'play3' }))).toEqual(['solicitante']);
  });

  it('registro antigo sem setor carimbado: um lado só', () => {
    expect(ladosDoPedidoNr(pedido({ conflito_setor_id: null }))).toEqual(['solicitante']);
  });

  it('quem pede sem setor: um lado só', () => {
    expect(ladosDoPedidoNr(pedido({ setor_id: null }))).toEqual(['solicitante']);
  });

  it('o setor de cada lado', () => {
    expect(setorDoLadoNr(pedido(), 'solicitante')).toBe('play3');
    expect(setorDoLadoNr(pedido(), 'conflito')).toBe('receptivo');
  });
});

// ── Quem pode assinar cada lado ─────────────────────────────────────────────

describe('podeAssinarLadoNr', () => {
  const base = { podeAprovarPix: true, vejoTodosOsSetores: false, meuSetorId: 'play3' };

  it('assino pelo MEU setor', () => {
    expect(podeAssinarLadoNr({ ...base, setorDoLado: 'play3' })).toBe(true);
  });

  it('não assino pelo setor do outro', () => {
    expect(podeAssinarLadoNr({ ...base, setorDoLado: 'receptivo' })).toBe(false);
  });

  it('quem enxerga todos os setores assina por qualquer um', () => {
    expect(podeAssinarLadoNr({
      ...base, vejoTodosOsSetores: true, setorDoLado: 'receptivo',
    })).toBe(true);
  });

  it('lado sem setor fica com quem aprova Pix — senão o pedido trava para sempre', () => {
    expect(podeAssinarLadoNr({ ...base, setorDoLado: null })).toBe(true);
  });

  it('sem a permissão de aprovar Pix, nenhum lado', () => {
    expect(podeAssinarLadoNr({
      ...base, podeAprovarPix: false, setorDoLado: 'play3',
    })).toBe(false);
  });
});

// ── O que a tela mostra enquanto falta assinatura ───────────────────────────

describe('estadoDoPedidoNr', () => {
  const lider3 = { podeAprovarPix: true, vejoTodosOsSetores: false, meuSetorId: 'play3' };

  it('sem ninguém: faltam os dois, e eu só posso o meu', () => {
    const e = estadoDoPedidoNr(pedido(), [], lider3);
    expect(e.faltam).toEqual(['solicitante', 'conflito']);
    expect(e.meusLados).toEqual(['solicitante']);
  });

  it('meu lado assinado: nada mais a fazer por mim, e o pedido segue pendente', () => {
    const e = estadoDoPedidoNr(pedido(), [assinatura()], lider3);
    expect(e.assinado.solicitante?.aprovador_nome).toBe('Bryan');
    expect(e.faltam).toEqual(['conflito']);
    expect(e.meusLados).toEqual([]);
  });

  it('a diretoria assina os dois lados, um clique cada', () => {
    const e = estadoDoPedidoNr(pedido(), [], {
      podeAprovarPix: true, vejoTodosOsSetores: true, meuSetorId: null,
    });
    expect(e.meusLados).toEqual(['solicitante', 'conflito']);
  });

  it('assinatura de OUTRO pedido não conta neste', () => {
    const e = estadoDoPedidoNr(pedido(), [assinatura({ pedido_id: 'ped-99' })], lider3);
    expect(e.faltam).toEqual(['solicitante', 'conflito']);
  });

  it('um lado só: assinado é o pedido inteiro resolvido', () => {
    const e = estadoDoPedidoNr(
      pedido({ conflito_setor_id: 'play3' }), [assinatura()], lider3,
    );
    expect(e.faltam).toEqual([]);
  });
});

// ── De quem é o NR ──────────────────────────────────────────────────────────

describe('fetchDonosDeNrPix', () => {
  it('só olha a tabela do PIX — a aba Acordos nunca entrou nesta conta', async () => {
    /*
     * O teste-guarda da regra: tabular na aba Acordos e registrar aqui é o
     * mesmo acordo da mesma pessoa nos dois lugares, e é assim que ela recebe a
     * premiação. Se algum dia esta consulta passar a ler `acordos`, o registro
     * legítimo viraria duplicidade.
     */
    fila = [{ data: [], error: null }];
    await fetchDonosDeNrPix('emp-1');

    expect(calls.map(c => c.table)).toEqual(['pix_automatico_acordos']);
  });

  it('devolve o dono de cada NR, normalizado', async () => {
    fila = [{ data: [
      { id: 'a-1', nr_cliente: ' 23323 ', operador_id: 'ana', operador_nome: 'Ana',
        setor_id: 'receptivo', criado_em: '2026-09-01T12:00:00Z' },
    ], error: null }];

    const donos = await fetchDonosDeNrPix('emp-1');
    expect(donos.get('23323')?.operadorId).toBe('ana');
  });

  it('empatado o NR, fica o registro MAIS ANTIGO — o mesmo que o banco escolhe', async () => {
    // `fn_pix_nr_pedir` ordena por `criado_em` e pega o primeiro. Se a tela
    // apontasse o outro, o cartão do pedido mostraria um conflito e o banco
    // guardaria outro.
    fila = [{ data: [
      { id: 'a-2', nr_cliente: '23323', operador_id: 'nicole', operador_nome: 'Nicole',
        setor_id: 'play3', criado_em: '2026-09-05T12:00:00Z' },
      { id: 'a-1', nr_cliente: '23323', operador_id: 'ana', operador_nome: 'Ana',
        setor_id: 'receptivo', criado_em: '2026-09-01T12:00:00Z' },
    ], error: null }];

    const donos = await fetchDonosDeNrPix('emp-1');
    expect(donos.get('23323')?.operadorId).toBe('ana');
  });
});

// ── O acordo que ficou só na aba Acordos ────────────────────────────────────

describe('fetchAcordosRecorrentesSemPix', () => {
  const ACORDO = {
    id: 'ac-1', nr_cliente: '5555', valor: 1200, vencimento: '2026-09-12',
    tipo: 'pix_automatico', operador_id: 'ana', operador_nome: 'Ana',
    setor_id: 'receptivo', status: 'pendente',
  };

  it('lista o acordo recorrente que não tem registro no Pix', async () => {
    fila = [{ data: [ACORDO], error: null }];
    const r = await fetchAcordosRecorrentesSemPix({
      empresaId: 'emp-1', mes: '2026-09', operadorId: 'ana',
      nrsDoOperador: new Set<string>(),
    });

    expect(r).toHaveLength(1);
    expect(r[0].nr_cliente).toBe('5555');
    // `status` é filtro de consulta, não informação da tela.
    expect(r[0]).not.toHaveProperty('status');
  });

  it('o NR já registrado pela pessoa some da lista', async () => {
    fila = [{ data: [ACORDO], error: null }];
    const r = await fetchAcordosRecorrentesSemPix({
      empresaId: 'emp-1', mes: '2026-09', operadorId: 'ana',
      nrsDoOperador: new Set(['5555']),
    });
    expect(r).toEqual([]);
  });

  it('recorta por forma recorrente, mês do vencimento e dono', async () => {
    fila = [{ data: [], error: null }];
    await fetchAcordosRecorrentesSemPix({
      empresaId: 'emp-1', mes: '2026-09', operadorId: 'ana',
      nrsDoOperador: new Set<string>(),
    });

    const c = calls[0];
    expect(c.table).toBe('acordos');
    expect(c.filters).toContainEqual(['in', 'tipo', ['pix_automatico', 'cartao_recorrente']]);
    expect(c.filters).toContainEqual(['gte', 'vencimento', '2026-09-01']);
    expect(c.filters).toContainEqual(['lte', 'vencimento', '2026-09-30']);
    expect(c.filters).toContainEqual(['eq', 'operador_id', 'ana']);
    // Acordo não pago não rende comissão de Pix — cobrar o registro dele seria
    // mandar a pessoa lançar o que não vai ser pago.
    expect(c.filters).toContainEqual(['neq', 'status', 'nao_pago']);
  });
});
