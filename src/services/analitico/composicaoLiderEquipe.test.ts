/**
 * composicaoLiderEquipe.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * `buscarEquipesComOperadores` e o líder — a LIGAÇÃO, não a regra pura.
 *
 * `equipes/equipeDoLider.test.ts` cobre `equipesDaPessoa` isolada. Estes
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
import { espelhoEquipeMembros } from '@/test/equipeMembros';

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
  for (const m of ['eq', 'is', 'in', 'neq', 'not']) {
    alvo[m] = (coluna: string, valor: unknown) => {
      filtros.push({ tabela, coluna, valor });
      return alvo;
    };
  }
  alvo.then = (aceitar: (r: unknown) => unknown) =>
    Promise.resolve(responder(tabela)).then(aceitar);
  return alvo;
}

/**
 * `equipe_membros` responde como o banco montaria a partir das três tabelas
 * antigas do cenário (gatilhos da fase 5), salvo resposta explícita.
 */
function responder(tabela: string) {
  const explicita = respostas.get(tabela);
  if (explicita || tabela !== 'equipe_membros') return explicita ?? { data: [], error: null };
  return {
    data: espelhoEquipeMembros({
      perfis:  respostas.get('perfis')?.data,
      lideres: respostas.get('equipe_lideres')?.data,
      clones:  respostas.get('equipe_operadores_clones')?.data,
    }),
    error: null,
  };
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

  it('consulta equipe_membros filtrando pela empresa', async () => {
    montarBanco([{ equipe_id: EQ_MATHEUS, lider_id: MATHEUS }]);

    await buscarEquipesComOperadores(BOOKPLAY, null);

    expect(filtros).toContainEqual({
      tabela: 'equipe_membros', coluna: 'empresa_id', valor: BOOKPLAY,
    });
  });

  it('equipe_membros ausente (fase 5 não aplicada): monta das três tabelas antigas', async () => {
    montarBanco([{ equipe_id: EQ_OUTRA, lider_id: RENATA }]);
    respostas.set('equipe_membros', { data: null, error: { message: 'relation does not exist' } });

    const c = await buscarEquipesComOperadores(BOOKPLAY, null);

    expect(c.operadorEquipeMap[RENATA].equipe_id).toBe(EQ_MATHEUS);
    expect(c.equipesExtrasPorOperador[RENATA]).toEqual([EQ_OUTRA]);
    expect(filtros).toContainEqual({
      tabela: 'equipe_lideres', coluna: 'empresa_id', valor: BOOKPLAY,
    });
  });

  it('quem lidera DUAS conta nas duas (regra de 29/09/2026)', async () => {
    // «Se tem 2 equipes, soma em todas que faz parte, não só em uma.» O setor
    // e o geral não duplicam: `setoresDoOperador` é um conjunto.
    montarBanco([
      { equipe_id: EQ_MATHEUS, lider_id: MATHEUS },
      { equipe_id: EQ_OUTRA,   lider_id: MATHEUS },
    ]);

    const c = await buscarEquipesComOperadores(BOOKPLAY, null);

    expect(c.operadorEquipeMap[MATHEUS]).toEqual({
      equipe_id:   EQ_MATHEUS,
      equipe_nome: 'Matheus',
      setor_id:    RECEPTIVO,
    });
    expect(c.equipesExtrasPorOperador[MATHEUS]).toEqual([EQ_OUTRA]);
    expect(c.equipes.map(e => e.id).sort()).toEqual([EQ_MATHEUS, EQ_OUTRA].sort());
  });

  it('membro que também lidera outra: fica na dele e soma na que lidera', async () => {
    // Renata é membro de EQ_MATHEUS e lidera EQ_OUTRA — está nas duas.
    montarBanco([{ equipe_id: EQ_OUTRA, lider_id: RENATA }]);

    const c = await buscarEquipesComOperadores(BOOKPLAY, null);

    expect(c.operadorEquipeMap[RENATA].equipe_id).toBe(EQ_MATHEUS);
    expect(c.equipesExtrasPorOperador[RENATA]).toEqual([EQ_OUTRA]);
  });

  it('líder de várias soma nas clonadas também, sem repetir', async () => {
    montarBanco([
      { equipe_id: EQ_MATHEUS, lider_id: MATHEUS },
      { equipe_id: EQ_OUTRA,   lider_id: MATHEUS },
    ]);
    respostas.set('equipe_operadores_clones', {
      data: [{ equipe_id: EQ_OUTRA, operador_id: MATHEUS, conta_recebimento: true }],
      error: null,
    });

    const c = await buscarEquipesComOperadores(BOOKPLAY, null);

    expect(c.operadorEquipeMap[MATHEUS].equipe_id).toBe(EQ_MATHEUS);
    expect(c.equipesExtrasPorOperador[MATHEUS]).toEqual([EQ_OUTRA]);
  });

  it('quem é SÓ clone segue sem equipe própria e no setor do perfil', async () => {
    // A regra do clone de sempre: conta na equipe que o tomou emprestado sem
    // sair do setor de origem.
    montarBanco([]);
    respostas.set('equipe_operadores_clones', {
      data: [{ equipe_id: EQ_OUTRA, operador_id: MATHEUS, conta_recebimento: true }],
      error: null,
    });

    const c = await buscarEquipesComOperadores(BOOKPLAY, null);

    expect(c.operadorEquipeMap[MATHEUS]).toEqual({
      equipe_id: null, equipe_nome: 'Sem equipe', setor_id: RECEPTIVO,
    });
    expect(c.equipesExtrasPorOperador[MATHEUS]).toEqual([EQ_OUTRA]);
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

/*
 * A troca de liderança — BookPlay, Play 4, 02/09/2026.
 *
 * Maria Oliveira (cargo `lider`) passou a liderar "Maria - Capitã" e continuou
 * com `perfis.equipe_id` = "Digital Bruno", a equipe que hoje é do Brunno. Os
 * R$ 7.916,99 dela em agosto contavam no card do outro. A tela de Equipes só
 * escreve `equipe_lideres` e esconde líderes das listas de membros, então esse
 * `equipe_id` é resíduo invisível — e era ele que mandava no dinheiro.
 */
describe('buscarEquipesComOperadores — troca de liderança leva o recebimento junto', () => {
  const MARIA   = 'p-maria-oliveira';
  const EQ_ANTIGA = EQ_OUTRA;   // "Digital Bruno"
  const EQ_NOVA   = EQ_MATHEUS; // "Maria - Capitã"

  function montarTroca(perfil: string) {
    respostas.set('perfis', {
      data: [{
        id: MARIA, perfil, equipe_id: EQ_ANTIGA, setor_id: RECEPTIVO,
        situacao: 'ativo',
        equipes: { id: EQ_ANTIGA, nome: 'Outra', setor_id: RECEPTIVO },
      }],
      error: null,
    });
    respostas.set('equipes', {
      data: [
        { id: EQ_NOVA,   nome: 'Matheus', setor_id: RECEPTIVO },
        { id: EQ_ANTIGA, nome: 'Outra',   setor_id: RECEPTIVO },
      ],
      error: null,
    });
    respostas.set('equipe_operadores_clones', { data: [], error: null });
    respostas.set('equipe_lideres', { data: [{ equipe_id: EQ_NOVA, lider_id: MARIA }], error: null });
    respostas.set('perfis_transferencias', { data: [], error: null });
  }

  it('cargo lider: o recebimento vai para a equipe que ele LIDERA hoje', async () => {
    montarTroca('lider');

    const c = await buscarEquipesComOperadores(BOOKPLAY, null);

    // Nome e setor saem da equipe resolvida, não do embed do cadastro — usar o
    // embed gravaria "Outra" no card da equipe certa.
    expect(c.operadorEquipeMap[MARIA]).toEqual({
      equipe_id:   EQ_NOVA,
      equipe_nome: 'Matheus',
      setor_id:    RECEPTIVO,
    });
  });

  it('cargo lider: o resíduo não soma em lugar nenhum', async () => {
    // «A equipe do cadastro não existe.» O dinheiro dela não pode voltar para
    // o card do Brunno por outro caminho.
    montarTroca('lider');

    const c = await buscarEquipesComOperadores(BOOKPLAY, null);

    expect(c.equipesExtrasPorOperador[MARIA]).toBeUndefined();
  });

  it('cargo lider que não lidera nada não tem equipe, mesmo com resíduo', async () => {
    // Caso Tamires Valentin: nenhuma liderança, resíduo numa equipe.
    montarTroca('lider');
    respostas.set('equipe_lideres', { data: [], error: null });

    const c = await buscarEquipesComOperadores(BOOKPLAY, null);

    expect(c.operadorEquipeMap[MARIA]).toEqual({
      equipe_id: null, equipe_nome: 'Sem equipe', setor_id: RECEPTIVO,
    });
  });

  it('membro que lidera outra equipe conta nas duas', async () => {
    // Para quem não é `lider`, o `equipe_id` é a equipe de membro de verdade:
    // o dinheiro fica nela E soma na que lidera.
    montarTroca('operador');

    const c = await buscarEquipesComOperadores(BOOKPLAY, null);

    expect(c.operadorEquipeMap[MARIA].equipe_id).toBe(EQ_ANTIGA);
    expect(c.equipesExtrasPorOperador[MARIA]).toEqual([EQ_NOVA]);
  });
});
