/**
 * As pendências do 58 — linha que o 59 ainda não confirmou.
 *
 * ## O que se trava aqui
 *
 * **`aguardando` não pode pedir ação.** Ela é o estado normal de qualquer linha
 * recém-importada do 58: o 59 nem rodou desde então. Se ela subir para «pedir
 * ação», toda importação do 58 passa a gerar um alerta que não é de ninguém — e
 * alerta que não é de ninguém treina a pessoa a fechar sem ler.
 *
 * **A escalada conta promoções, não horas.** É o que separa «o 59 está
 * atrasado» de «o 59 rodou e não trouxe», que têm donos diferentes.
 *
 * **Os números vêm como texto.** PostgREST devolve `numeric` e `bigint` como
 * string.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({
  porRpc: {} as Record<string, { data: unknown; error: { message: string } | null }>,
  args: {} as Record<string, unknown>,
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: (nome: string, args: unknown) => {
      mock.args[nome] = args;
      const r = mock.porRpc[nome] ?? { data: null, error: null };
      return { then: (ok: (v: unknown) => unknown) => ok(r) };
    },
  },
}));

import {
  buscarPendencias,
  buscarResumoPendencias,
  ORDEM_SEVERIDADE,
  pedeAcao,
  ROTULO_SEVERIDADE,
  totalPorSeveridade,
  type ResumoPendencia,
  type Severidade,
} from './pendencias.service';

/*
 * O caso real de setembro/2026: o 58 do Receptivo foi importado depois do
 * último lote do 59, então as 18 pendências do mês são todas `aguardando` —
 * nenhuma delas é cobrança de ninguém.
 */
const LINHA = {
  id: 'lin-1',
  setor_id: 'setor-receptivo',
  setor_nome: 'Receptivo',
  operador_usuario: 'ANDRESSA_AIRES',
  operador_nome: 'Andressa Aires',
  codigo: '12898434',
  data_pagamento: '2026-09-13',
  forma_pagamento: 'PIX',
  valor_recebido: '230.00',
  importado_em: '2026-09-13T21:40:00Z',
  promocoes_desde: '0',
  severidade: 'aguardando' as const,
  no_59_em_outro_setor: false,
};

const resumo = (over: Partial<ResumoPendencia> = {}): ResumoPendencia => ({
  setorId: 's1', setorNome: 'S1', severidade: 'pendente', linhas: 1, valor: 100,
  ...over,
});

beforeEach(() => { mock.porRpc = {}; mock.args = {}; });

describe('buscarPendencias', () => {
  it('converte os números e preserva a identidade da linha', async () => {
    mock.porRpc = { fn_analitico_pendencias: { data: [LINHA], error: null } };

    const [p] = await buscarPendencias('emp-1', '2026-09');

    expect(p.nr).toBe('12898434');
    expect(p.operadorNome).toBe('Andressa Aires');
    expect(typeof p.valor).toBe('number');
    expect(p.valor).toBeCloseTo(230, 2);
    expect(p.promocoesDesde).toBe(0);
    expect(p.severidade).toBe('aguardando');
    expect(p.no59EmOutroSetor).toBe(false);
  });

  /* «0» como texto é verdadeiro em JavaScript. Sem conversão, uma linha que o
     59 nunca teve chance de ver seria contada como se ele tivesse perdido a
     oportunidade. */
  it('zero promoções que chega como texto vira zero de verdade', async () => {
    mock.porRpc = {
      fn_analitico_pendencias: { data: [{ ...LINHA, promocoes_desde: '0' }], error: null },
    };
    const [p] = await buscarPendencias('emp-1', '2026-09');
    expect(p.promocoesDesde).toBe(0);
    expect(p.promocoesDesde > 0).toBe(false);
  });

  it('repassa os filtros para o banco, e null quando não há setor', async () => {
    mock.porRpc = { fn_analitico_pendencias: { data: [], error: null } };

    await buscarPendencias('emp-1', '2026-09');
    expect(mock.args.fn_analitico_pendencias).toMatchObject({
      p_setor_id: null, p_limite: 300,
    });

    await buscarPendencias('emp-1', '2026-09', { setorId: 'setor-1', limite: 20 });
    expect(mock.args.fn_analitico_pendencias).toMatchObject({
      p_setor_id: 'setor-1', p_limite: 20,
    });
  });

  it('lista vazia não vira erro — é o estado de «nada pendente»', async () => {
    mock.porRpc = { fn_analitico_pendencias: { data: null, error: null } };
    await expect(buscarPendencias('emp-1', '2026-09')).resolves.toEqual([]);
  });

  it('erro do banco vira exceção com a mensagem do banco', async () => {
    mock.porRpc = {
      fn_analitico_pendencias: { data: null, error: { message: 'Sem acesso a esta empresa.' } },
    };
    await expect(buscarPendencias('emp-1', '2026-09'))
      .rejects.toThrow('Sem acesso a esta empresa.');
  });
});

describe('buscarResumoPendencias', () => {
  it('converte contagem e valor, que também vêm como texto', async () => {
    mock.porRpc = {
      fn_analitico_pendencias_resumo: {
        data: [{
          setor_id: 'setor-receptivo', setor_nome: 'Receptivo',
          severidade: 'aguardando', linhas: '18', valor: '3766.68',
        }],
        error: null,
      },
    };
    const [r] = await buscarResumoPendencias('emp-1', '2026-09');
    expect(r.linhas).toBe(18);
    expect(r.valor).toBeCloseTo(3766.68, 2);
  });
});

describe('pedeAcao', () => {
  /*
   * O ponto da escalada. `aguardando` é o estado normal de toda linha
   * recém-importada; se ela pedir ação, importar o 58 vira gerar alerta.
   */
  it('só `critico` pede alguém agora', () => {
    const pedem = ORDEM_SEVERIDADE.filter(pedeAcao);
    expect(pedem).toEqual(['critico']);
  });

  it('aguardando não é cobrança de ninguém', () => {
    expect(pedeAcao('aguardando')).toBe(false);
  });

  it('a ordem vai do mais grave ao menos', () => {
    expect(ORDEM_SEVERIDADE).toEqual(['critico', 'pendente', 'aguardando']);
  });

  it('toda severidade tem rótulo e explicação', () => {
    for (const s of ORDEM_SEVERIDADE) {
      expect(ROTULO_SEVERIDADE[s].curto.length).toBeGreaterThan(0);
      expect(ROTULO_SEVERIDADE[s].porque.length).toBeGreaterThan(20);
    }
  });
});

describe('totalPorSeveridade', () => {
  it('soma os setores dentro de cada severidade e respeita a ordem', () => {
    const t = totalPorSeveridade([
      resumo({ setorId: 's1', severidade: 'aguardando', linhas: 15, valor: 3766.68 }),
      resumo({ setorId: 's2', severidade: 'aguardando', linhas: 3, valor: 249 }),
      resumo({ setorId: 's3', severidade: 'critico', linhas: 1, valor: 800 }),
    ]);

    expect(t.map(x => x.severidade)).toEqual(['critico', 'aguardando']);
    expect(t[1].linhas).toBe(18);
    expect(t[1].valor).toBeCloseTo(4015.68, 2);
  });

  it('severidade ausente não aparece com zero', () => {
    const t = totalPorSeveridade([resumo({ severidade: 'pendente' })]);
    expect(t).toHaveLength(1);
    expect(t[0].severidade).toBe<Severidade>('pendente');
  });
});
