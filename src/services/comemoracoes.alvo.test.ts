/**
 * comemoracoes.alvo.test.ts — o que o INSERT leva para o banco.
 *
 * A regra em si mora em `escopo.ts` e `clones.ts`, que já têm teste. O que se
 * perde aqui é a LIGAÇÃO: a opção marcada na tela que não chega ao payload
 * falha em silêncio — o líder marca "exibir apenas para a equipe", vê o toast
 * de sucesso, e o setor inteiro recebe a comemoração mesmo assim.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

interface Chamada { tabela: string; payload: unknown }

const mocks = vi.hoisted(() => ({
  chamadas: [] as Chamada[],
  /** Erro devolvido no próximo insert de homenageados, se houver. */
  erroHomenageados: null as { code?: string; message?: string } | null,
}));

vi.mock('@/lib/supabase', () => {
  const construtor = (tabela: string) => ({
    insert(payload: unknown) {
      mocks.chamadas.push({ tabela, payload });
      const erro = tabela === 'comemoracao_homenageados' ? mocks.erroHomenageados : null;
      // Um erro só: o segundo insert (a repetição sem a coluna) tem que passar.
      if (erro) mocks.erroHomenageados = null;
      const resultado = { data: { id: 'c-1' }, error: erro };
      return {
        select: () => ({ single: () => Promise.resolve(resultado) }),
        then: (r: (v: unknown) => unknown) => Promise.resolve(resultado).then(r),
      };
    },
    delete: () => ({ eq: () => Promise.resolve({ error: null }) }),
  });
  return { supabase: { from: construtor } };
});

vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn() } }));

import { criarComemoracao } from './comemoracoes.service';

const BASE = {
  empresaId: 'emp', criadoPor: 'eu',
  titulo: 'META BATIDA!', mensagem: null,
  efeito: 'confete' as const, som: 'fanfarra' as const,
  duracaoS: 20,
};

function payloadDa(tabela: string): Record<string, unknown> | undefined {
  const c = mocks.chamadas.find((x) => x.tabela === tabela);
  return c?.payload as Record<string, unknown> | undefined;
}

beforeEach(() => {
  mocks.chamadas = [];
  mocks.erroHomenageados = null;
});

describe('exibir apenas para a equipe', () => {
  it('marcado, vai como somente_equipe', async () => {
    await criarComemoracao({
      ...BASE, operadorIds: ['ana'], somenteEquipe: true,
    });
    expect(payloadDa('comemoracoes')?.somente_equipe).toBe(true);
  });

  it('desmarcado, a coluna nem é enviada — banco não migrado segue criando', async () => {
    await criarComemoracao({ ...BASE, operadorIds: ['ana'], somenteEquipe: false });
    expect(payloadDa('comemoracoes')).not.toHaveProperty('somente_equipe');
  });

  it('meta de setor ignora a opção: é da empresa inteira', async () => {
    await criarComemoracao({
      ...BASE, operadorIds: [], alvoTipo: 'setor', setorId: 's-a', somenteEquipe: true,
    });
    expect(payloadDa('comemoracoes')).not.toHaveProperty('somente_equipe');
  });

  it('alvo equipe leva a opção junto', async () => {
    await criarComemoracao({
      ...BASE, operadorIds: [], alvoTipo: 'equipe', equipeId: 'eq-1', somenteEquipe: true,
    });
    const p = payloadDa('comemoracoes');
    expect(p?.alvo_tipo).toBe('equipe');
    expect(p?.somente_equipe).toBe(true);
  });
});

describe('setor escolhido por homenageado', () => {
  it('a resposta da pergunta viaja em setores_escolhidos', async () => {
    await criarComemoracao({
      ...BASE,
      operadorIds: ['ana', 'bruno'],
      setoresPorOperador: { ana: ['s-b'], bruno: ['s-a'] },
    });
    expect(payloadDa('comemoracao_homenageados')).toEqual([
      { comemoracao_id: 'c-1', operador_id: 'ana',   setores_escolhidos: ['s-b'] },
      { comemoracao_id: 'c-1', operador_id: 'bruno', setores_escolhidos: ['s-a'] },
    ]);
  });

  it('sem resposta, vai lista vazia e o banco cai no setor do perfil', async () => {
    await criarComemoracao({ ...BASE, operadorIds: ['ana'] });
    expect(payloadDa('comemoracao_homenageados')).toEqual([
      { comemoracao_id: 'c-1', operador_id: 'ana', setores_escolhidos: [] },
    ]);
  });

  it('banco sem a coluna: repete o insert sem ela em vez de apagar a festa', async () => {
    // Antes da 20260810a a coluna não existe. Recusar aqui apagaria a
    // comemoração recém-criada e o líder veria "não foi possível" sem motivo.
    mocks.erroHomenageados = { code: '42703', message: 'column "setores_escolhidos" does not exist' };

    const r = await criarComemoracao({
      ...BASE, operadorIds: ['ana'], setoresPorOperador: { ana: ['s-b'] },
    });

    expect(r.ok).toBe(true);
    const tentativas = mocks.chamadas.filter((c) => c.tabela === 'comemoracao_homenageados');
    expect(tentativas).toHaveLength(2);
    expect(tentativas[1].payload).toEqual([{ comemoracao_id: 'c-1', operador_id: 'ana' }]);
    // E NÃO apagou a comemoração.
    expect(mocks.chamadas.some((c) => c.tabela === 'comemoracoes' && c.payload === undefined)).toBe(false);
  });

  it('erro de verdade nos homenageados continua desfazendo a comemoração', async () => {
    mocks.erroHomenageados = { code: '23503', message: 'violates foreign key constraint' };

    const r = await criarComemoracao({ ...BASE, operadorIds: ['fantasma'] });

    expect(r.ok).toBe(false);
    // Uma tentativa só: não é caso de repetir sem a coluna.
    expect(mocks.chamadas.filter((c) => c.tabela === 'comemoracao_homenageados')).toHaveLength(1);
  });
});

describe('mensagem de migration ausente aponta a certa', () => {
  it('coluna nova do alvo por equipe manda para a 20260810a', async () => {
    // O INSERT da comemoração falha por coluna ausente: sem esta distinção, a
    // pessoa aplicaria a 20260801a e o erro continuaria.
    const { supabase } = await import('@/lib/supabase');
    const original = supabase.from;
    (supabase as { from: unknown }).from = () => ({
      insert: () => ({
        select: () => ({
          single: () => Promise.resolve({
            data: null,
            error: { code: '42703', message: 'column "somente_equipe" does not exist' },
          }),
        }),
      }),
    });

    const r = await criarComemoracao({ ...BASE, operadorIds: ['ana'], somenteEquipe: true });
    expect(r.erro).toMatch(/20260810a/);

    (supabase as { from: unknown }).from = original;
  });
});
