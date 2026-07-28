/**
 * desligamento.service.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Cobre as duas frentes da regra "acordo de desligado perde o vínculo":
 *
 *   1. situacaoDoOperador / operadorEstaDesligado — com atenção ao caso de
 *      FALHA de leitura, que precisa devolver 'ativo'. Se devolvesse
 *      'desligado' por engano, qualquer erro de rede viraria uma porta pra
 *      transferir acordo alheio sem autorização de líder.
 *
 *   2. transferirAcordoDeDesligado — manda pra lixeira, exclui, loga e
 *      notifica; e aborta sem excluir quando o acordo não é encontrado.
 *
 * Tudo com mock do Supabase — nunca toca o banco real.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const notificarMock = vi.fn();
const lixeiraMock   = vi.fn();

vi.mock('@/services/notificacoes.service', () => ({
  criarNotificacao: (...a: unknown[]) => notificarMock(...a),
}));
vi.mock('@/services/lixeira.service', () => ({
  enviarParaLixeira: (...a: unknown[]) => lixeiraMock(...a),
}));
vi.mock('@/services/nr_registros.service', () => ({
  transferirNr: vi.fn(async () => ({ ok: true })),
}));

// ── Supabase encadeável ────────────────────────────────────────────────────
type Resultado = { data: unknown; error: { message: string } | null };

let perfilResult:  Resultado;
let acordoResult:  Resultado;
let deleteError:   { message: string } | null;

const deleteCalls: Array<{ table: string; filtros: Array<[string, unknown]> }> = [];
const insertCalls: Array<{ table: string; payload: Record<string, unknown> }> = [];

function builder(table: string) {
  const filtros: Array<[string, unknown]> = [];
  const self: Record<string, unknown> = {};
  const encadeia = (k: string) => {
    self[k] = (...args: unknown[]) => {
      if (args.length >= 2) filtros.push([String(args[0]), args[1]]);
      return self;
    };
  };
  ['select', 'eq', 'neq', 'not', 'limit', 'order'].forEach(encadeia);

  self.maybeSingle = async () => (table === 'perfis' ? perfilResult : acordoResult);
  self.delete = () => {
    const d: Record<string, unknown> = {};
    d.eq = (col: string, val: unknown) => {
      deleteCalls.push({ table, filtros: [[col, val]] });
      return Promise.resolve({ error: deleteError });
    };
    return d;
  };
  self.insert = (payload: Record<string, unknown>) => {
    insertCalls.push({ table, payload });
    return Promise.resolve({ error: null });
  };
  self.update = () => {
    const u: Record<string, unknown> = {};
    ['eq', 'not'].forEach(k => { u[k] = () => u; });
    (u as { then: unknown }).then = (res: (v: unknown) => unknown) =>
      Promise.resolve({ error: null, count: 0 }).then(res);
    return u;
  };
  return self;
}

vi.mock('@/lib/supabase', () => ({
  supabase: { from: (t: string) => builder(t) },
}));

import {
  situacaoDoOperador, operadorEstaDesligado, transferirAcordoDeDesligado,
  AUTOR_AUTOMATICO,
} from './desligamento.service';

beforeEach(() => {
  vi.clearAllMocks();
  deleteCalls.length = 0;
  insertCalls.length = 0;
  perfilResult = { data: null, error: null };
  acordoResult = { data: null, error: null };
  deleteError  = null;
});

describe('situacaoDoOperador', () => {
  it('devolve a situação gravada no perfil', async () => {
    perfilResult = { data: { situacao: 'desligado' }, error: null };
    await expect(situacaoDoOperador('op-1')).resolves.toBe('desligado');
    await expect(operadorEstaDesligado('op-1')).resolves.toBe(true);
  });

  it('trata perfil sem situacao como ativo', async () => {
    perfilResult = { data: {}, error: null };
    await expect(situacaoDoOperador('op-1')).resolves.toBe('ativo');
  });

  // Este é o teste que protege a regra de negócio: erro de leitura NÃO pode
  // abrir caminho pra transferência automática.
  it('devolve ativo quando a leitura falha (fail-closed)', async () => {
    perfilResult = { data: null, error: { message: 'timeout' } };
    await expect(situacaoDoOperador('op-1')).resolves.toBe('ativo');
    await expect(operadorEstaDesligado('op-1')).resolves.toBe(false);
  });

  it('devolve ativo para id vazio, sem consultar', async () => {
    await expect(situacaoDoOperador('')).resolves.toBe('ativo');
  });
});

describe('transferirAcordoDeDesligado', () => {
  const params = {
    acordoAnteriorId: 'ac-1',
    empresaId:        'emp-1',
    operadorAntId:    'op-velho',
    operadorAntNome:  'Fulano',
    novoOperadorId:   'op-novo',
    novoOperadorNome: 'Beltrano',
    labelNr:          'NR',
    valorNr:          '12345',
  };

  it('envia para a lixeira, exclui, loga e notifica', async () => {
    acordoResult = {
      data: { id: 'ac-1', nome_cliente: 'Cliente X', valor: 250, operador_id: 'op-velho' },
      error: null,
    };

    const r = await transferirAcordoDeDesligado(params);

    expect(r.ok).toBe(true);
    expect(r.nomeClienteAnterior).toBe('Cliente X');

    // lixeira registra que não houve líder no meio
    expect(lixeiraMock).toHaveBeenCalledTimes(1);
    const argLixeira = lixeiraMock.mock.calls[0][0] as Record<string, unknown>;
    expect(argLixeira.motivo).toBe('transferencia_nr');
    expect(argLixeira.autorizadoPorNome).toBe(AUTOR_AUTOMATICO);
    expect(argLixeira.autorizadoPorId).toBeUndefined();
    expect(argLixeira.transferidoParaId).toBe('op-novo');

    expect(deleteCalls).toEqual([{ table: 'acordos', filtros: [['id', 'ac-1']] }]);

    const log = insertCalls.find(c => c.table === 'logs_sistema');
    expect(log?.payload.acao).toBe('transferencia_nr_desligado');
    expect((log?.payload.detalhes as Record<string, unknown>).sem_autorizacao_lider).toBe(true);

    expect(notificarMock).toHaveBeenCalledTimes(1);
    expect((notificarMock.mock.calls[0][0] as { usuario_id: string }).usuario_id).toBe('op-velho');
  });

  it('aborta sem excluir quando o acordo não existe', async () => {
    acordoResult = { data: null, error: null };
    const r = await transferirAcordoDeDesligado(params);
    expect(r.ok).toBe(false);
    expect(deleteCalls).toHaveLength(0);
    expect(lixeiraMock).not.toHaveBeenCalled();
  });

  it('propaga erro do delete sem dar sucesso', async () => {
    acordoResult = { data: { id: 'ac-1', nome_cliente: 'C', valor: 1 }, error: null };
    deleteError  = { message: 'RLS negou' };
    const r = await transferirAcordoDeDesligado(params);
    expect(r.ok).toBe(false);
    expect(r.erro).toBe('RLS negou');
  });
});
