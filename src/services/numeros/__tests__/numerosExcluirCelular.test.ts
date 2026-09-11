/**
 * Excluir um aparelho — escrito em 11/09/2026, quando a operação descobriu que
 * um celular cadastrado não saía mais da lista: não havia botão, nem função.
 *
 * O que estes testes travam é a ORDEM e a honestidade da resposta. Os números
 * saem antes do aparelho (a chave estrangeira é `RESTRICT`); a recusa nos
 * números para tudo; e uma exclusão que a RLS ignorou em silêncio não pode
 * voltar como «excluído».
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({
  chamadas: [] as string[],
  numeros: { error: null } as { error: unknown },
  celular: { data: [{ id: 'c1' }], error: null } as { data: unknown[] | null; error: unknown },
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: vi.fn(),
    from: (tabela: string) => ({
      delete: () => ({
        eq: (coluna: string, valor: string) => {
          mock.chamadas.push(`${tabela}.${coluna}=${valor}`);
          if (tabela === 'numeros_whatsapp') return Promise.resolve(mock.numeros);
          return { select: () => Promise.resolve(mock.celular) };
        },
      }),
    }),
  },
}));

import { excluirCelular } from '../numeros.service';
import { podeExcluirCelular, type EstadoNumero } from '../numerosRegras';

const noNucleo: EstadoNumero = { situacao: 'ativo', posse: 'nucleo', operadorId: null };

describe('podeExcluirCelular', () => {
  it('aparelho vazio sai sempre', () => {
    expect(podeExcluirCelular([])).toBe(true);
  });

  it('sai com os números quando todos ainda estão no Núcleo e sem dono', () => {
    expect(podeExcluirCelular([
      noNucleo,
      { ...noNucleo, situacao: 'em_aquecimento' },
      { ...noNucleo, situacao: 'banido' },
    ])).toBe(true);
  });

  it('um número com um setor segura o aparelho inteiro', () => {
    expect(podeExcluirCelular([noNucleo, { ...noNucleo, posse: 'setor' }])).toBe(false);
  });

  it('um número com operador também segura', () => {
    expect(podeExcluirCelular([
      { ...noNucleo, posse: 'setor', operadorId: 'op-1' },
    ])).toBe(false);
  });
});

describe('excluirCelular', () => {
  beforeEach(() => {
    mock.chamadas = [];
    mock.numeros = { error: null };
    mock.celular = { data: [{ id: 'c1' }], error: null };
  });

  it('apaga os números primeiro, e depois o aparelho', async () => {
    expect(await excluirCelular('c1')).toEqual({ ok: true });
    expect(mock.chamadas).toEqual([
      'numeros_whatsapp.celular_id=c1',
      'numeros_celulares.id=c1',
    ]);
  });

  it('a recusa nos números para tudo — o aparelho nem é tocado', async () => {
    mock.numeros = {
      error: {
        code: '22023',
        message: 'Este numero ja circulou por um setor e tem historico.',
      },
    };
    const r = await excluirCelular('c1');
    expect(r.ok).toBe(false);
    expect(r.erro).toContain('circulou');
    expect(mock.chamadas).toEqual(['numeros_whatsapp.celular_id=c1']);
  });

  it('número que sobrou no aparelho vira frase, e não código de erro', async () => {
    mock.celular = {
      data: null,
      error: { code: '23503', message: 'violates foreign key constraint' },
    };
    const r = await excluirCelular('c1');
    expect(r.ok).toBe(false);
    expect(r.erro).toContain('ainda tem números');
  });

  it('a RLS que não apaga nada não volta como «excluído»', async () => {
    mock.celular = { data: [], error: null };
    const r = await excluirCelular('c1');
    expect(r.ok).toBe(false);
    expect(r.erro).toContain('não foi excluído');
  });
});
