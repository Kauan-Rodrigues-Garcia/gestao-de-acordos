/**
 * composicaoLiderEquipe.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * `buscarEquipesComOperadores` e o líder — a LIGAÇÃO, não a regra pura.
 *
 * `equipes/equipeDoLider.test.ts` cobre `equipeUnicaPorLider` isolada. Estes
 * testes cobrem o que aquele não alcança: a composição realmente CONSULTA
 * `equipe_lideres` e usa o resultado para dar equipe, nome e setor a quem tem
 * `perfis.equipe_id` nulo. Um fio solto aqui não quebra nenhum teste puro e o
 * recebimento do líder volta a sumir do card da equipe.
 *
 * Cenário reproduzido do banco (BookPlay, 18/08/2026): Matheus Costa é o líder
 * explícito da equipe "Matheus" (setor Receptivo) e tem `perfis.equipe_id`
 * NULO. Os R$ 1.316,17 recebidos por ele em agosto ficavam fora do card da
 * equipe — o setor não fechava com a soma das equipes dele.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const BOOKPLAY  = 'emp-bookplay';
const EQ_MATHEUS = 'eq-matheus';
const EQ_OUTRA   = 'eq-outra';
const RECEPTIVO  = 'setor-receptivo';
const MATHEUS    = 'p-matheus-costa';
const RENATA     = 'p-renata';

const respostas = new Map<string, { data: unknown; error: unknown }>();
const filtros: Array<{ tabela: string; coluna: string; valor: unknown }> = [];

function construtor(tabela: string) {
  const alvo: Record<string, unknown> = {};
  for (const m of ['select', 'order', 'limit']) alvo[m] = () => alvo;
  for (const m of ['eq', 'is', 'in', 'neq']) {
    alvo[m] = (coluna: string, valor: unknown) => {
      filtros.push({ tabela, coluna, valor });
      return alvo;
    };
  }
  alvo.then = (aceitar: (r: unknown) => unknown) =>
    Promise.resolve(respostas.get(tabela) ?? { data: [], error: null }).then(aceitar);
  return alvo;
}

vi.mock('@/lib/supabase', () => ({
  supabase: { from: (t: string) => construtor(t) },
}));

vi.mock('@/lib/supabaseSemTipo', () => ({
  tabelaSemTipo: () => {
    const alvo: Record<string, unknown> = {};
    for (const m of ['select', 'eq']) alvo[m] = () => alvo;
    // Sem retrato congelado: força o caminho ao vivo.
    alvo.then = (aceitar: (r: unknown) => unknown) =>
      Promise.resolve({ data: [], error: null }).then(aceitar);
    return alvo;
  },
  rpcSemTipo: () => Promise.resolve({ error: null }),
}));

const { buscarEquipesComOperadores } = await import('./analitico.service');

/** Líder sem equipe no cadastro + uma operadora com equipe, como no banco. */
function montarBanco(vinculosDoLider: Array<{ equipe_id: string; lider_id: string }>) {
  respostas.set('perfis', {
    data: [
      { id: MATHEUS, equipe_id: null, setor_id: RECEPTIVO, situacao: 'ativo', equipes: null },
      { id: RENATA, equipe_id: EQ_MATHEUS, setor_id: RECEPTIVO, situacao: 'ativo',
        equipes: { id: EQ_MATHEUS, nome: 'Matheus', setor_id: RECEPTIVO } },
    ],
    error: null,
  });
  respostas.set('equipes', {
    data: [
      { id: EQ_MATHEUS, nome: 'Matheus', setor_id: RECEPTIVO },
      { id: EQ_OUTRA,   nome: 'Outra',   setor_id: RECEPTIVO },
    ],
    error: null,
  });
  respostas.set('equipe_operadores_clones', { data: [], error: null });
  respostas.set('equipe_lideres', { data: vinculosDoLider, error: null });
  respostas.set('perfis_transferencias', { data: [], error: null });
}

beforeEach(() => {
  respostas.clear();
  filtros.length = 0;
});

describe('buscarEquipesComOperadores — líder conta na equipe que lidera', () => {
  it('dá a equipe do vínculo explícito a quem tem perfis.equipe_id nulo', async () => {
    montarBanco([{ equipe_id: EQ_MATHEUS, lider_id: MATHEUS }]);

    const c = await buscarEquipesComOperadores(BOOKPLAY, null);

    // Nome e setor vêm da tabela `equipes`: o embed `p.equipes` é nulo para ele.
    expect(c.operadorEquipeMap[MATHEUS]).toEqual({
      equipe_id:   EQ_MATHEUS,
      equipe_nome: 'Matheus',
      setor_id:    RECEPTIVO,
    });
  });

  it('consulta equipe_lideres filtrando pela empresa', async () => {
    montarBanco([{ equipe_id: EQ_MATHEUS, lider_id: MATHEUS }]);

    await buscarEquipesComOperadores(BOOKPLAY, null);

    expect(filtros).toContainEqual({
      tabela: 'equipe_lideres', coluna: 'empresa_id', valor: BOOKPLAY,
    });
  });

  it('não credita equipe a quem lidera DUAS — o dinheiro contaria em dobro', async () => {
    montarBanco([
      { equipe_id: EQ_MATHEUS, lider_id: MATHEUS },
      { equipe_id: EQ_OUTRA,   lider_id: MATHEUS },
    ]);

    const c = await buscarEquipesComOperadores(BOOKPLAY, null);

    expect(c.operadorEquipeMap[MATHEUS]).toEqual({
      equipe_id:   null,
      equipe_nome: 'Sem equipe',
      setor_id:    RECEPTIVO,   // continua contando no setor, como antes
    });
  });

  it('o cadastro manda: equipe_id preenchido não é trocado pelo vínculo', async () => {
    // Renata tem EQ_MATHEUS no cadastro; um vínculo de líder apontando para
    // outra equipe não pode movê-la.
    montarBanco([{ equipe_id: EQ_OUTRA, lider_id: RENATA }]);

    const c = await buscarEquipesComOperadores(BOOKPLAY, null);

    expect(c.operadorEquipeMap[RENATA].equipe_id).toBe(EQ_MATHEUS);
  });

  it('tabela ausente (migration pendente) mantém o comportamento antigo', async () => {
    montarBanco([]);
    respostas.set('equipe_lideres', { data: null, error: { message: 'relation does not exist' } });

    const c = await buscarEquipesComOperadores(BOOKPLAY, null);

    expect(c.operadorEquipeMap[MATHEUS].equipe_id).toBeNull();
  });

  it('a equipe do líder entra na lista de equipes com gente', async () => {
    // Sem isto, uma equipe cujo único integrante com recebimento é o líder
    // sumiria do painel — `comGente` é o filtro da lista.
    respostas.set('perfis', {
      data: [{ id: MATHEUS, equipe_id: null, setor_id: RECEPTIVO, situacao: 'ativo', equipes: null }],
      error: null,
    });
    respostas.set('equipes', {
      data: [{ id: EQ_MATHEUS, nome: 'Matheus', setor_id: RECEPTIVO }],
      error: null,
    });
    respostas.set('equipe_operadores_clones', { data: [], error: null });
    respostas.set('equipe_lideres', { data: [{ equipe_id: EQ_MATHEUS, lider_id: MATHEUS }], error: null });
    respostas.set('perfis_transferencias', { data: [], error: null });

    const c = await buscarEquipesComOperadores(BOOKPLAY, null);

    expect(c.equipes.map(e => e.id)).toEqual([EQ_MATHEUS]);
  });
});
