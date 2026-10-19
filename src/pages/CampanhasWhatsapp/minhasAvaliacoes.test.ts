/**
 * `minhasAvaliacoes` — só o voto de quem está na sessão.
 *
 * O defeito de 19/10/2026: a leitura filtrava só por `lote_id` e confiava na
 * policy para devolver as linhas da pessoa. Com as policies do autor e do
 * setor, o líder recebia o voto de todo mundo, e o último a chegar virava o
 * dele na tela.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const chamadas: Array<[string, ...unknown[]]> = [];
let linhas: unknown[] = [];
let sessao: { user: { id: string } } | null = { user: { id: 'uid-sessao' } };

function consulta() {
  const q = {
    select: (...a: unknown[]) => { chamadas.push(['select', ...a]); return q; },
    eq:     (...a: unknown[]) => { chamadas.push(['eq', ...a]); return q; },
    in:     (...a: unknown[]) => { chamadas.push(['in', ...a]); return Promise.resolve({ data: linhas, error: null }); },
  };
  return q;
}

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: sessao } }) },
    from: (tabela: string) => { chamadas.push(['from', tabela]); return consulta(); },
  },
}));

import { minhasAvaliacoes } from './campanhasWhatsapp.service';

beforeEach(() => {
  chamadas.length = 0;
  linhas = [];
  sessao = { user: { id: 'uid-sessao' } };
});

describe('minhasAvaliacoes', () => {
  it('filtra pelo usuário da sessão, além dos lotes', async () => {
    linhas = [{ lote_id: 'l1', bom: true, observacao: 'ok' }];
    const r = await minhasAvaliacoes(['l1', 'l1', 'l2']);

    expect(chamadas).toContainEqual(['eq', 'operador_id', 'uid-sessao']);
    expect(chamadas).toContainEqual(['in', 'lote_id', ['l1', 'l2']]);
    expect(r.votos.get('l1')).toBe(true);
    expect(r.observacoes.get('l1')).toBe('ok');
  });

  it('sem sessão não consulta nada', async () => {
    sessao = null;
    const r = await minhasAvaliacoes(['l1']);
    expect(chamadas).toEqual([]);
    expect(r.votos.size).toBe(0);
  });

  it('sem lote não consulta nada', async () => {
    await minhasAvaliacoes([]);
    expect(chamadas).toEqual([]);
  });
});
