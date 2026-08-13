/**
 * valorDoFantasma.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * `buscarValorDoFantasma` — o número que a confirmação de "tirar da equipe"
 * mostra antes do clique.
 *
 * É o único ponto da feature em que um erro é invisível: o líder confirma um
 * valor errado, o card muda, e não há como saber que a conta estava torta. Daí
 * os testes serem sobre a PERGUNTA feita ao banco, não só sobre a soma.
 *
 * O recorte é sempre: empresa de ORIGEM + aquele operador + aquele mês. Errar a
 * empresa mostraria o recebimento que a pessoa tem na empresa NOVA, que não é o
 * que sai da equipe; errar o mês somaria meses que o fantasma não alcança.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const filtros: Array<[op: string, coluna: string, valor: unknown]> = [];
let resposta: { data: unknown; error: unknown } = { data: [], error: null };

function construtor() {
  const alvo: Record<string, unknown> = {};
  alvo.select = () => alvo;
  for (const m of ['eq', 'gte', 'lte']) {
    alvo[m] = (coluna: string, valor: unknown) => { filtros.push([m, coluna, valor]); return alvo; };
  }
  alvo.then = (aceitar: (r: unknown) => unknown) => Promise.resolve(resposta).then(aceitar);
  return alvo;
}

vi.mock('@/lib/supabase', () => ({ supabase: { from: () => construtor() } }));
vi.mock('@/lib/supabaseSemTipo', () => ({
  tabelaSemTipo: () => construtor(),
  rpcSemTipo: () => Promise.resolve({ error: null }),
}));

const { buscarValorDoFantasma } = await import('./analitico.service');

const EMPRESA = 'emp-pagueplay';
const THAYRA  = 'p-thayra';

beforeEach(() => {
  filtros.length = 0;
  resposta = { data: [], error: null };
});

describe('buscarValorDoFantasma', () => {
  it('soma as linhas do operador no mês', async () => {
    resposta = {
      data: [{ valor_recebido: 1000.5 }, { valor_recebido: 2000.25 }, { valor_recebido: 3 }],
      error: null,
    };

    const r = await buscarValorDoFantasma(EMPRESA, '2026-08', THAYRA);

    expect(r.total).toBeCloseTo(3003.75, 2);
    expect(r.linhas).toBe(3);
  });

  it('recorta pela empresa de ORIGEM, pelo operador e pelo mês', async () => {
    await buscarValorDoFantasma(EMPRESA, '2026-08', THAYRA);

    expect(filtros).toContainEqual(['eq', 'empresa_id', EMPRESA]);
    expect(filtros).toContainEqual(['eq', 'operador_id', THAYRA]);
    expect(filtros).toContainEqual(['gte', 'data_pagamento', '2026-08-01']);
    expect(filtros).toContainEqual(['lte', 'data_pagamento', '2026-08-31']);
  });

  it('fevereiro em ano comum fecha no dia 28', async () => {
    await buscarValorDoFantasma(EMPRESA, '2026-02', THAYRA);
    expect(filtros).toContainEqual(['lte', 'data_pagamento', '2026-02-28']);
  });

  it('sem recebimento nenhum devolve zero, não quebra a confirmação', async () => {
    const r = await buscarValorDoFantasma(EMPRESA, '2026-08', THAYRA);
    expect(r).toEqual({ total: 0, linhas: 0 });
  });

  it('erro de leitura vira zero — a confirmação abre mesmo assim', async () => {
    // Travar o botão por causa de uma falha de rede seria pior: o líder ficaria
    // sem conseguir tirar um fantasma que ele já decidiu tirar.
    resposta = { data: null, error: { message: 'timeout' } };
    const r = await buscarValorDoFantasma(EMPRESA, '2026-08', THAYRA);
    expect(r).toEqual({ total: 0, linhas: 0 });
  });

  it('valor nulo no banco não vira NaN na tela', async () => {
    resposta = { data: [{ valor_recebido: null }, { valor_recebido: 10 }], error: null };
    const r = await buscarValorDoFantasma(EMPRESA, '2026-08', THAYRA);
    expect(r.total).toBe(10);
    expect(r.linhas).toBe(2);
  });
});
