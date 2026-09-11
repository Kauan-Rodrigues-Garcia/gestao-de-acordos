import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Resposta = { data: unknown[]; error: { message: string } | null };

const mock = vi.hoisted(() => ({
  perfilId: 'eu' as string | null,
  empresaId: 'e1' as string | null,
  hoje: '2026-09-10',
  /** O que a consulta a `equipe_lideres` devolve. */
  lideres: { data: [], error: null } as { data: unknown[]; error: { message: string } | null },
  /** O que a consulta a `metas` devolve. */
  metas: { data: [], error: null } as { data: unknown[]; error: { message: string } | null },
  /** Se `true`, o construtor de `equipe_lideres` estoura antes de virar promessa. */
  estourar: false,
  eqLideres: null as [string, string] | null,
  eqMetas: [] as [string, unknown][],
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ perfil: mock.perfilId ? { id: mock.perfilId } : null }),
}));

vi.mock('@/hooks/useEmpresa', () => ({
  useEmpresa: () => ({ empresa: mock.empresaId ? { id: mock.empresaId } : null }),
}));

vi.mock('@/lib/index', () => ({ getTodayISO: () => mock.hoje }));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (tabela: string) => {
      if (tabela === 'equipe_lideres') {
        return {
          select: () => ({
            eq: (coluna: string, valor: string) => {
              mock.eqLideres = [coluna, valor];
              if (mock.estourar) return {};        // sem `.limit`, como um dublê incompleto
              return { limit: () => mock.lideres };
            },
          }),
        };
      }
      const cadeia = {
        eq: (coluna: string, valor: unknown) => { mock.eqMetas.push([coluna, valor]); return cadeia; },
        gte: (): Resposta => mock.metas,
      };
      return { select: () => cadeia };
    },
  },
}));

import { mesesDaMetaIndividual, useLideroEquipe } from '../useLideroEquipe';

async function resolvido() {
  const { result } = renderHook(() => useLideroEquipe());
  await waitFor(() => expect(result.current.carregando).toBe(false));
  return result.current;
}

describe('useLideroEquipe — liderança', () => {
  beforeEach(() => {
    mock.perfilId = 'eu';
    mock.empresaId = 'e1';
    mock.hoje = '2026-09-10';
    mock.lideres = { data: [], error: null };
    mock.metas = { data: [{ ano: 2026, mes: 9, meta_valor: 20000 }], error: null };
    mock.estourar = false;
    mock.eqLideres = null;
    mock.eqMetas = [];
  });

  it('sem vínculo em equipe_lideres, não lidero', async () => {
    const r = await resolvido();
    expect(r.lidero).toBe(false);
    // A pergunta é pelo vínculo explícito, não pela equipe do cadastro.
    expect(mock.eqLideres).toEqual(['lider_id', 'eu']);
  });

  it('com uma equipe liderada, lidero — basta uma', async () => {
    mock.lideres = { data: [{ equipe_id: 'e1' }], error: null };
    expect((await resolvido()).lidero).toBe(true);
  });

  /*
   * Falhar para `false` mantém o Dashboard abrindo onde abria antes. Trocar em
   * que altura a tela abre por causa de uma queda de rede seria pior que o
   * defeito que este hook veio corrigir.
   */
  it('erro do banco não vira exceção: cai em false e destrava a tela', async () => {
    mock.lideres = { data: [], error: { message: 'permission denied' } };
    expect((await resolvido()).lidero).toBe(false);
  });

  it('construtor de consulta que estoura também destrava a tela', async () => {
    mock.estourar = true;
    const r = await resolvido();
    expect(r.lidero).toBe(false);
    // A outra pergunta não cai junto.
    expect(r.temMetaIndividual).toBe(true);
  });

  it('sem sessão resolvida não trava em carregando', async () => {
    mock.perfilId = null;
    const r = await resolvido();
    expect(r.lidero).toBe(false);
    expect(r.temMetaIndividual).toBe(true);
    expect(mock.eqLideres).toBeNull();
  });
});

/*
 * A gerência não lidera equipe e nem sempre enxerga todos os setores — e mesmo
 * assim abria em «Minha visão». A pergunta que a separa de quem produz é a da
 * queixa: tenho meta individual?
 */
describe('useLideroEquipe — meta individual', () => {
  beforeEach(() => {
    mock.perfilId = 'eu';
    mock.empresaId = 'e1';
    mock.hoje = '2026-09-10';
    mock.lideres = { data: [], error: null };
    mock.metas = { data: [], error: null };
    mock.estourar = false;
    mock.eqMetas = [];
  });

  it('pergunta pela meta de OPERADOR da própria pessoa, na empresa', async () => {
    await resolvido();
    expect(mock.eqMetas).toEqual([
      ['empresa_id', 'e1'], ['tipo', 'operador'], ['referencia_id', 'eu'],
    ]);
  });

  it('meta no mês corrente: tenho meta individual', async () => {
    mock.metas = { data: [{ ano: 2026, mes: 9, meta_valor: 20000 }], error: null };
    expect((await resolvido()).temMetaIndividual).toBe(true);
  });

  it('meta só no mês anterior também vale — o começo do mês, antes do lançamento', async () => {
    mock.metas = { data: [{ ano: 2026, mes: 8, meta_valor: 15000 }], error: null };
    expect((await resolvido()).temMetaIndividual).toBe(true);
  });

  it('meta antiga não vale — o gerente promovido de operador', async () => {
    mock.metas = { data: [{ ano: 2026, mes: 6, meta_valor: 20000 }], error: null };
    expect((await resolvido()).temMetaIndividual).toBe(false);
  });

  it('sem linha, ou com meta zerada: sem meta individual', async () => {
    expect((await resolvido()).temMetaIndividual).toBe(false);
    mock.metas = { data: [{ ano: 2026, mes: 9, meta_valor: 0 }], error: null };
    expect((await resolvido()).temMetaIndividual).toBe(false);
  });

  it('valores vindos como texto do banco também contam', async () => {
    mock.metas = { data: [{ ano: '2026', mes: '9', meta_valor: '12000.50' }], error: null };
    expect((await resolvido()).temMetaIndividual).toBe(true);
  });

  it('janeiro olha dezembro do ano anterior', async () => {
    mock.hoje = '2027-01-05';
    mock.metas = { data: [{ ano: 2026, mes: 12, meta_valor: 1000 }], error: null };
    expect((await resolvido()).temMetaIndividual).toBe(true);
  });

  it('erro nas metas cai em true — abre no mais estreito, como antes', async () => {
    mock.metas = { data: [], error: { message: 'permission denied' } };
    expect((await resolvido()).temMetaIndividual).toBe(true);
  });

  it('sem empresa resolvida não pergunta e não trava', async () => {
    mock.empresaId = null;
    const r = await resolvido();
    expect(r.temMetaIndividual).toBe(true);
    expect(mock.eqMetas).toEqual([]);
  });
});

describe('mesesDaMetaIndividual', () => {
  it('o mês corrente e o anterior', () => {
    expect(mesesDaMetaIndividual('2026-09-10')).toEqual({
      atual: { ano: 2026, mes: 9 }, anterior: { ano: 2026, mes: 8 },
    });
  });

  it('a virada do ano', () => {
    expect(mesesDaMetaIndividual('2027-01-01')).toEqual({
      atual: { ano: 2027, mes: 1 }, anterior: { ano: 2026, mes: 12 },
    });
  });
});
