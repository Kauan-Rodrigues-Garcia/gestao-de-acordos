/**
 * O cadastro pergunta ANTES de deixar o banco recusar.
 *
 * O índice único e a trigger do limite seguem sendo a verdade — são eles que
 * aguentam duas pessoas cadastrando o mesmo número no mesmo instante. O que
 * estes testes travam é o caminho NORMAL não depender deles: recusa do banco é
 * exceção, e exceção vira linha de ERROR no log do Postgres. Nove dessas em
 * 24 h descreviam o sistema fazendo exatamente o que devia, e apareciam no
 * painel como se fossem defeito.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({
  /** O que a consulta de conferência devolve. */
  existentes: [] as { celular_id: string; numero: string }[],
  erroNaConferencia: null as { message: string } | null,
  /** Quantas vezes o insert foi tentado. */
  inserts: 0,
  ultimoInsert: null as Record<string, unknown> | null,
}));

vi.mock('@/lib/supabase', () => {
  const consulta = {
    select: () => consulta,
    eq: () => consulta,
    or: () => Promise.resolve({
      data: mock.erroNaConferencia ? null : mock.existentes,
      error: mock.erroNaConferencia,
    }),
    insert: (linha: Record<string, unknown>) => {
      mock.inserts += 1;
      mock.ultimoInsert = linha;
      return {
        select: () => ({
          single: () => Promise.resolve({ data: { id: 'novo', ...linha }, error: null }),
        }),
      };
    },
  };
  // `rpc` existe porque o modulo faz `supabase.rpc.bind(supabase)` no topo:
  // sem ele o import do arquivo estoura antes de qualquer teste rodar.
  return { supabase: { from: () => consulta, rpc: () => Promise.resolve({ error: null }) } };
});

import { criarNumero } from '../numeros.service';

const BASE = {
  empresaId: 'emp-1',
  celularId: 'cel-1',
  setorId: 'setor-1',
  numero: '(11) 98888-7777',
};

describe('criarNumero: as recusas conhecidas não chegam ao banco', () => {
  beforeEach(() => {
    mock.existentes = [];
    mock.erroNaConferencia = null;
    mock.inserts = 0;
    mock.ultimoInsert = null;
  });

  it('celular cheio: recusa aqui, e o insert nem sai', async () => {
    mock.existentes = Array.from({ length: 6 }, (_, i) => ({
      celular_id: 'cel-1', numero: `1198888000${i}`,
    }));

    const r = await criarNumero(BASE);

    expect(r.ok).toBe(false);
    expect(r.ok === false && r.erro).toContain('6 números');
    expect(mock.inserts).toBe(0);
  });

  it('número repetido na empresa: recusa aqui, e o insert nem sai', async () => {
    mock.existentes = [{ celular_id: 'outro-cel', numero: '11988887777' }];

    const r = await criarNumero(BASE);

    expect(r.ok).toBe(false);
    expect(r.ok === false && r.erro).toContain('já possui cadastro');
    expect(mock.inserts).toBe(0);
  });

  /*
   * Seis números em OUTROS celulares não enchem este. O filtro da conferência
   * tem de contar por celular, não por empresa — sem isso, a empresa inteira
   * pararia de cadastrar depois do sexto chip.
   */
  it('seis números espalhados por outros celulares não bloqueiam este', async () => {
    mock.existentes = Array.from({ length: 6 }, (_, i) => ({
      celular_id: `outro-${i}`, numero: `1197777000${i}`,
    }));

    const r = await criarNumero(BASE);

    expect(r.ok).toBe(true);
    expect(mock.inserts).toBe(1);
  });

  it('cadastro limpo passa, e grava o número normalizado', async () => {
    const r = await criarNumero(BASE);

    expect(r.ok).toBe(true);
    expect(mock.inserts).toBe(1);
    expect(mock.ultimoInsert?.numero).toBe('11988887777');
  });

  /*
   * Falha de rede na conferência NÃO pode virar impedimento: o banco continua
   * sendo quem decide. Recusar aqui inventaria um bloqueio que não existe.
   */
  it('conferência que falha deixa o banco decidir', async () => {
    mock.erroNaConferencia = { message: 'Failed to fetch' };

    const r = await criarNumero(BASE);

    expect(r.ok).toBe(true);
    expect(mock.inserts).toBe(1);
  });

  it('número mal formado para antes de tudo, sem ida ao banco', async () => {
    const r = await criarNumero({ ...BASE, numero: '123' });

    expect(r.ok).toBe(false);
    expect(mock.inserts).toBe(0);
  });
});
