import { describe, expect, it, vi } from 'vitest';

// O cliente de verdade usa `this.rest` dentro do `rpc`: o falso também, para
// pegar o `rpc` solto do cliente («Cannot read properties of undefined (reading 'rest')»).
vi.mock('@/lib/supabase', () => {
  const cliente = {
    rest: { chamar: (nome: string) => ({ data: nome === 'fn_desafio_cobranca_atual' ? { id: 'd', total: '10.5', dias: ['2026-11-16'], por_dia: [] } : null, error: null }) },
    rpc(this: { rest: { chamar: (n: string) => unknown } }, nome: string) { return Promise.resolve(this.rest.chamar(nome)); },
  };
  return { supabase: cliente };
});

import { buscarDesafioCobranca } from './desafioCobranca.service';

describe('desafioCobranca.service', () => {
  it('chama o rpc preso ao cliente e devolve o placar com números', async () => {
    const p = await buscarDesafioCobranca();
    expect(p?.id).toBe('d');
    expect(p?.total).toBe(10.5);
  });
});
