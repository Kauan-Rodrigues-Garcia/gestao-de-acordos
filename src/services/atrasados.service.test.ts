/**
 * atrasados.service — as três travas de 16/10/2026: não desfazer pagamento,
 * não notificar em dobro, e não mandar centenas de ids num pedido só.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const banco = vi.hoisted(() => ({
  /** As linhas que a leitura devolve. */
  atrasados: [] as Record<string, unknown>[],
  /** Ids que AINDA estão pendentes no banco no momento do update. */
  aindaPendentes: new Set<string>(),
  updates: [] as { ids: string[]; filtros: [string, unknown][] }[],
  avisos: [] as unknown[][],
}));

vi.mock('@/lib/index', () => ({
  formatCurrency: (v: number) => `R$ ${v}`,
  formatDate: (v: string) => v,
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (tabela: string) => {
      if (tabela === 'notificacoes') {
        return { insert: (linhas: unknown[]) => { banco.avisos.push(linhas); return Promise.resolve({ error: null }); } };
      }
      let ids: string[] = [];
      const filtros: [string, unknown][] = [];
      let ehUpdate = false;
      const cadeia: Record<string, unknown> = {
        select: () => {
          if (ehUpdate) {
            banco.updates.push({ ids, filtros });
            const mudados = ids.filter(id => banco.aindaPendentes.has(id));
            for (const id of mudados) banco.aindaPendentes.delete(id);
            return Promise.resolve({ data: mudados.map(id => ({ id })), error: null });
          }
          return cadeia;
        },
        update: () => { ehUpdate = true; return cadeia; },
        in: (_c: string, v: string[]) => { ids = v; return cadeia; },
        eq: (c: string, v: unknown) => { filtros.push([c, v]); return cadeia; },
        lt: () => cadeia,
        order: () => cadeia,
        range: (de: number, ate: number) =>
          Promise.resolve({ data: banco.atrasados.slice(de, ate + 1), error: null }),
      };
      return cadeia;
    },
  },
}));

import { converterAtrasados, BLOCO_ATRASADOS } from './atrasados.service';

function atrasado(i: number) {
  return {
    id: `a${i}`, operador_id: `op${i % 3}`, instituicao: null, nr_cliente: `${i}`,
    nome_cliente: 'Cliente', valor: 100, vencimento: '2026-10-01', empresa_id: 'emp',
  };
}

beforeEach(() => {
  banco.atrasados = [];
  banco.aindaPendentes = new Set();
  banco.updates = [];
  banco.avisos = [];
});

describe('converterAtrasados', () => {
  it('a gravação só vale para quem AINDA está pendente — pago no meio do caminho não volta', async () => {
    banco.atrasados = [atrasado(1), atrasado(2)];
    // O a2 foi marcado como pago entre a leitura e a gravação.
    banco.aindaPendentes = new Set(['a1']);

    const n = await converterAtrasados({ empresaId: 'emp', operadorId: null, hoje: '2026-10-16' });

    expect(n).toBe(1);
    expect(banco.updates[0].filtros).toContainEqual(['status', 'verificar_pendente']);
    // Só o a1 é avisado.
    expect(banco.avisos.flat()).toHaveLength(1);
    expect(banco.avisos[0][0]).toMatchObject({ acordo_id: 'a1' });
  });

  it('dois navegadores juntos: o segundo não muda nada e não avisa ninguém', async () => {
    banco.atrasados = [atrasado(1), atrasado(2)];
    banco.aindaPendentes = new Set(['a1', 'a2']);

    const primeiro = await converterAtrasados({ empresaId: 'emp', operadorId: null, hoje: '2026-10-16' });
    const segundo  = await converterAtrasados({ empresaId: 'emp', operadorId: null, hoje: '2026-10-16' });

    expect(primeiro).toBe(2);
    expect(segundo).toBe(0);
    expect(banco.avisos.flat()).toHaveLength(2);
  });

  it('em blocos: centenas de atrasados não vão numa URL só, e os avisos vão juntos', async () => {
    banco.atrasados = Array.from({ length: 1_250 }, (_, i) => atrasado(i));
    banco.aindaPendentes = new Set(banco.atrasados.map(a => a.id as string));

    const n = await converterAtrasados({ empresaId: 'emp', operadorId: null, hoje: '2026-10-16' });

    expect(n).toBe(1_250);
    expect(banco.updates).toHaveLength(Math.ceil(1_250 / BLOCO_ATRASADOS));
    expect(Math.max(...banco.updates.map(u => u.ids.length))).toBeLessThanOrEqual(BLOCO_ATRASADOS);
    // Um insert por bloco, e não um por acordo.
    expect(banco.avisos).toHaveLength(banco.updates.length);
  });

  it('nada atrasado: nenhuma gravação', async () => {
    expect(await converterAtrasados({ empresaId: 'emp', operadorId: 'op1', hoje: '2026-10-16' })).toBe(0);
    expect(banco.updates).toHaveLength(0);
  });
});
