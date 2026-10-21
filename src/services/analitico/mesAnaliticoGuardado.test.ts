/**
 * mesAnaliticoGuardado.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * A leitura do mês do analítico fica guardada por um minuto (21/10/2026), e o
 * número velho não aparece porque ela some antes: o sinal `analitico` derruba
 * a guardada ao chegar, e quem grava derruba ao terminar. Ver «Guardada por um
 * minuto» em `analitico.service.ts`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { leituras, ouvintes } = vi.hoisted(() => ({
  /** Quantas vezes o mês foi lido do banco (consultas paginadas da tabela). */
  leituras: { n: 0 },
  ouvintes: [] as { topico: string; onSinal?: (p: Record<string, unknown>) => void }[],
}));

function createBuilder(table: string) {
  const builder = {
    select: vi.fn(() => builder),
    delete: vi.fn(() => builder),
    eq:     vi.fn(() => builder),
    in:     vi.fn(() => builder),
    is:     vi.fn(() => builder),
    gte:    vi.fn(() => builder),
    lte:    vi.fn(() => builder),
    order:  vi.fn(() => builder),
    range:  vi.fn(() => {
      if (table === 'analitico_recebimentos') leituras.n++;
      return builder;
    }),
    then: (resolve: (v: { data: unknown[]; error: null }) => unknown) =>
      Promise.resolve({ data: [], error: null }).then(resolve),
  };
  return builder;
}

vi.mock('@/lib/supabase', () => ({
  supabase: { from: vi.fn((t: string) => createBuilder(t)) },
}));

vi.mock('@/lib/realtime', () => ({
  assinarTabela: vi.fn((cfg: { topico: string }, h: { onSinal?: (p: Record<string, unknown>) => void }) => {
    ouvintes.push({ topico: cfg.topico, onSinal: h.onSinal });
    return () => {};
  }),
}));

import { buscarTotalPorSetor, buscarRecebidoPorDia, esquecerMesAnalitico, removerLinhaAnalitico } from './analitico.service';
import { assinarSinal } from '@/lib/sinais';

const EMPRESA = 'emp-1';
const MES     = '2026-10';

beforeEach(() => {
  leituras.n = 0;
  ouvintes.length = 0;
});

describe('mês do analítico guardado', () => {
  it('duas telas seguidas leem o mês uma vez só', async () => {
    await buscarTotalPorSetor(EMPRESA, MES);
    await buscarRecebidoPorDia(EMPRESA, MES);
    expect(leituras.n).toBe(1);
  });

  it('meses e empresas diferentes não se misturam', async () => {
    await buscarTotalPorSetor(EMPRESA, MES);
    await buscarTotalPorSetor(EMPRESA, '2026-09');
    await buscarTotalPorSetor('emp-2', MES);
    expect(leituras.n).toBe(3);
  });

  it('quem grava descarta a guardada', async () => {
    await buscarTotalPorSetor(EMPRESA, MES);
    await removerLinhaAnalitico('linha-1');
    await buscarTotalPorSetor(EMPRESA, MES);
    expect(leituras.n).toBe(2);
  });

  it('esquecerMesAnalitico descarta todas as empresas', async () => {
    await buscarTotalPorSetor(EMPRESA, MES);
    await buscarTotalPorSetor('emp-2', MES);
    esquecerMesAnalitico();
    await buscarTotalPorSetor(EMPRESA, MES);
    await buscarTotalPorSetor('emp-2', MES);
    expect(leituras.n).toBe(4);
  });

  it('o sinal da empresa derruba a guardada na hora, antes do portão', async () => {
    const cancelar = assinarSinal('analitico', EMPRESA, { onMudou: () => {} });
    await buscarTotalPorSetor(EMPRESA, MES);
    await buscarTotalPorSetor('emp-2', MES);

    ouvintes.find(o => o.topico === `analitico:${EMPRESA}`)!
      .onSinal!({ tabela: 'analitico_recebimentos', operacao: 'INSERT' });

    await buscarTotalPorSetor(EMPRESA, MES);
    // A outra empresa continua guardada.
    await buscarTotalPorSetor('emp-2', MES);
    expect(leituras.n).toBe(3);
    cancelar();
  });
});
