/**
 * A porta única da próxima parcela: servidor primeiro, insert antigo só
 * enquanto a migration 20260929010000 não estiver no banco.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Acordo } from '@/lib/supabase';

const rpc = vi.fn();
const maybeSingle = vi.fn();
const single = vi.fn();
const insert = vi.fn();

vi.mock('@/lib/supabaseSemTipo', () => ({ rpcSemTipo: (...a: unknown[]) => rpc(...a) }));
vi.mock('@/lib/supabase', () => {
  const cadeia = {
    select: () => cadeia, eq: () => cadeia,
    maybeSingle: () => maybeSingle(), single: () => single(),
  };
  return {
    supabase: {
      from: () => ({
        select: () => cadeia,
        insert: (p: unknown) => { insert(p); return { select: () => ({ single: () => single() }) }; },
      }),
    },
  };
});

import {
  agendarProximaParcela, ehFuncaoAusente, mensagemDoServidor,
} from './agendarProximaParcela';

const BASE = {
  id: 'a1', operador_id: 'dono', empresa_id: 'e1', acordo_grupo_id: 'G1',
  numero_parcela: 1, parcelas: 3, tipo: 'boleto', estado_uf: 'SP', valor_total: 300,
  valor_entrada: null, nome_cliente: 'X', nr_cliente: '1',
} as unknown as Acordo;

beforeEach(() => { rpc.mockReset(); maybeSingle.mockReset(); single.mockReset(); insert.mockReset(); });

describe('pelo servidor', () => {
  it('chama o RPC com o acordo, a data e o valor', async () => {
    rpc.mockResolvedValue({ data: { id: 'n1', numero_parcela: 2, parcelas: 3, ja_existia: false }, error: null });
    maybeSingle.mockResolvedValue({ data: { id: 'n1', operador_id: 'dono' } });
    const r = await agendarProximaParcela(BASE, { vencimento: '2026-10-10', valor: 100 });
    expect(rpc).toHaveBeenCalledWith('fn_acordo_agendar_proxima_parcela', {
      p_acordo_id: 'a1', p_vencimento: '2026-10-10', p_valor: 100, p_valor_par: null,
    });
    expect(r).toEqual(expect.objectContaining({ ok: true, jaExistia: false, numero: 2, total: 3 }));
    expect(insert).not.toHaveBeenCalled();
  });

  it('parcela já existente volta como «já foi», não como erro', async () => {
    rpc.mockResolvedValue({ data: { id: 'n1', numero_parcela: 2, parcelas: 3, ja_existia: true }, error: null });
    maybeSingle.mockResolvedValue({ data: { id: 'n1' } });
    const r = await agendarProximaParcela(BASE, { vencimento: '2026-10-10', valor: 100 });
    expect(r).toEqual(expect.objectContaining({ ok: true, jaExistia: true }));
  });

  it('recusa do servidor vira frase, sem o prefixo técnico', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'NAO_AUTORIZADO: este acordo não está no seu alcance' } });
    const r = await agendarProximaParcela(BASE, { vencimento: '2026-10-10', valor: 100 });
    expect(r).toEqual({ ok: false, erro: 'Este acordo não está no seu alcance' });
    expect(insert).not.toHaveBeenCalled();
  });
});

describe('antes da migration: o insert antigo, com a identidade inteira', () => {
  beforeEach(() => {
    rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } });
  });

  it('leva estado_uf e valor_total, que duas telas esqueciam', async () => {
    maybeSingle.mockResolvedValue({ data: null });
    single.mockResolvedValue({ data: { id: 'n1' }, error: null });
    await agendarProximaParcela(BASE, { vencimento: '2026-10-10', valor: 100 });
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      operador_id: 'dono', estado_uf: 'SP', valor_total: 300,
      numero_parcela: 2, acordo_grupo_id: 'G1', status: 'verificar_pendente',
    }));
  });

  it('não insere se a parcela já existe', async () => {
    maybeSingle.mockResolvedValue({ data: { id: 'ja' } });
    const r = await agendarProximaParcela(BASE, { vencimento: '2026-10-10', valor: 100 });
    expect(insert).not.toHaveBeenCalled();
    expect(r).toEqual(expect.objectContaining({ ok: true, jaExistia: true }));
  });

  it('RLS no insert vira frase legível', async () => {
    maybeSingle.mockResolvedValue({ data: null });
    single.mockResolvedValue({ data: null, error: { code: '42501', message: 'new row violates row-level security policy for table "acordos"' } });
    const r = await agendarProximaParcela(BASE, { vencimento: '2026-10-10', valor: 100 });
    expect(r).toEqual({ ok: false, erro: 'O banco não deixou criar a parcela para o dono deste acordo.' });
  });
});

describe('ajudantes', () => {
  it('reconhece função ausente pelos códigos do PostgREST e do Postgres', () => {
    expect(ehFuncaoAusente({ code: 'PGRST202' })).toBe(true);
    expect(ehFuncaoAusente({ code: '42883' })).toBe(true);
    expect(ehFuncaoAusente({ code: '42501', message: 'NAO_AUTORIZADO' })).toBe(false);
    expect(ehFuncaoAusente(null)).toBe(false);
  });

  it('mensagemDoServidor tira só prefixo em MAIÚSCULAS', () => {
    expect(mensagemDoServidor('ULTIMA_PARCELA: esta já é a última parcela')).toBe('Esta já é a última parcela');
    expect(mensagemDoServidor('erro qualquer')).toBe('erro qualquer');
  });
});
