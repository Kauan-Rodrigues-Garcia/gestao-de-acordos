/**
 * escopoFontes.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Quem conta em qual setor e em qual equipe.
 *
 * A regra dos CLONES é a parte frágil do sistema, e já quebrou de três jeitos
 * diferentes:
 *
 *   • um operador emprestado (clone) precisa contar no setor dono da equipe
 *     que o tomou emprestado SEM sair do setor de origem;
 *   • clone com a caixinha "conta no recebimento" desligada aparece na equipe
 *     (foto, tag do líder) mas NÃO entra em nenhuma soma;
 *   • equipe formada só por clones não tem nenhum perfil apontando para ela —
 *     e por isso sumia da lista, ficando sem card e sem setor.
 *
 * Este arquivo trava as três. `escopoAnalitico.test.ts` cuida do outro lado da
 * regra (o que fazer com o conjunto depois de montado); aqui é como o conjunto
 * nasce a partir do banco.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

type Resposta = { data: unknown; error: { message: string } | null };

const { respostas } = vi.hoisted(() => ({
  respostas: new Map<string, Resposta[]>(),
}));

function construtor(tabela: string) {
  const alvo: unknown = new Proxy({}, {
    get(_, prop) {
      if (prop === 'then') {
        return (aceitar: (r: Resposta) => void) => {
          const fila = respostas.get(tabela) ?? [];
          aceitar(fila.shift() ?? { data: [], error: null });
        };
      }
      return () => alvo;
    },
  });
  return alvo;
}

vi.mock('@/lib/supabase', () => ({
  supabase: { from: (tabela: string) => construtor(tabela) },
}));

const {
  mapaSetorDaEquipe, setoresDoOperador, buscarEquipesComOperadores,
  buscarFontesDeEscopo, operadoresDoSetor, operadoresDaEquipe,
} = await import('./analitico.service');

function responder(tabela: string, ...rs: Resposta[]) {
  respostas.set(tabela, rs);
}

beforeEach(() => respostas.clear());

// ── Peças puras ─────────────────────────────────────────────────────────────

describe('mapaSetorDaEquipe', () => {
  it('mapeia equipe para o setor dono e ignora equipe sem setor', () => {
    const m = mapaSetorDaEquipe([
      { id: 'eq-1', nome: 'Play 4', setor_id: 'setor-A' },
      { id: 'eq-2', nome: 'Solta',  setor_id: null },
    ]);
    expect(m.get('eq-1')).toBe('setor-A');
    expect(m.has('eq-2')).toBe(false);
  });
});

describe('setoresDoOperador — o empréstimo não tira ninguém de casa', () => {
  const mapa = { 'op-1': { equipe_id: 'eq-1', equipe_nome: 'Play 4', setor_id: 'setor-A' } };
  const setorDaEquipe = new Map([['eq-9', 'setor-B'], ['eq-8', 'setor-C']]);

  it('sem empréstimo, conta só no setor de origem', () => {
    expect([...setoresDoOperador('op-1', mapa, {}, setorDaEquipe)]).toEqual(['setor-A']);
  });

  it('clonado em outro setor, conta nos dois', () => {
    const s = setoresDoOperador('op-1', mapa, { 'op-1': ['eq-9'] }, setorDaEquipe);
    expect([...s].sort()).toEqual(['setor-A', 'setor-B']);
  });

  it('clonado em duas equipes de setores diferentes, conta nos três', () => {
    const s = setoresDoOperador('op-1', mapa, { 'op-1': ['eq-9', 'eq-8'] }, setorDaEquipe);
    expect([...s].sort()).toEqual(['setor-A', 'setor-B', 'setor-C']);
  });

  it('equipe emprestada sem setor dono não inventa setor', () => {
    const s = setoresDoOperador('op-1', mapa, { 'op-1': ['eq-sem-setor'] }, setorDaEquipe);
    expect([...s]).toEqual(['setor-A']);
  });

  it('operador desconhecido não conta em lugar nenhum', () => {
    expect(setoresDoOperador('fantasma', mapa, {}, setorDaEquipe).size).toBe(0);
  });
});

// ── Montagem a partir do banco ──────────────────────────────────────────────

describe('buscarEquipesComOperadores', () => {
  it('o setor do operador é o da EQUIPE; sem equipe, o do próprio perfil', () => {
    responder('perfis', { data: [
      { id: 'op-1', equipe_id: 'eq-1', setor_id: 'setor-Z',
        equipes: { id: 'eq-1', nome: 'Play 4', setor_id: 'setor-A' } },
      { id: 'op-2', equipe_id: null, setor_id: 'setor-B', equipes: null },
    ], error: null });
    responder('equipes', { data: [{ id: 'eq-1', nome: 'Play 4', setor_id: 'setor-A' }], error: null });
    responder('equipe_operadores_clones', { data: [], error: null });

    return buscarEquipesComOperadores('emp-1').then(r => {
      expect(r.operadorEquipeMap['op-1'].setor_id).toBe('setor-A');
      expect(r.operadorEquipeMap['op-1'].equipe_nome).toBe('Play 4');
      expect(r.operadorEquipeMap['op-2'].setor_id).toBe('setor-B');
      expect(r.operadorEquipeMap['op-2'].equipe_nome).toBe('Sem equipe');
    });
  });

  it('equipe só de clones continua na lista — era o caso que sumia do painel', async () => {
    responder('perfis', { data: [
      { id: 'op-1', equipe_id: 'eq-1', setor_id: null,
        equipes: { id: 'eq-1', nome: 'Play 4', setor_id: 'setor-A' } },
    ], error: null });
    responder('equipes', { data: [
      { id: 'eq-1', nome: 'Play 4',         setor_id: 'setor-A' },
      { id: 'eq-2', nome: 'Digital Amauri', setor_id: 'setor-B' },
      { id: 'eq-3', nome: 'Vazia',          setor_id: 'setor-B' },
    ], error: null });
    responder('equipe_operadores_clones', {
      data: [{ equipe_id: 'eq-2', operador_id: 'op-1', conta_recebimento: true }], error: null,
    });

    const r = await buscarEquipesComOperadores('emp-1');
    expect(r.equipes.map(e => e.id).sort()).toEqual(['eq-1', 'eq-2']);
    // Equipe sem membro e sem clone fica de fora, senão apareceria zerada.
    expect(r.equipes.find(e => e.id === 'eq-3')).toBeUndefined();
  });

  it('clone com "conta no recebimento" desligado aparece na equipe mas não soma', async () => {
    responder('perfis', { data: [], error: null });
    responder('equipes', { data: [{ id: 'eq-2', nome: 'Play 5', setor_id: 'setor-B' }], error: null });
    responder('equipe_operadores_clones', {
      data: [{ equipe_id: 'eq-2', operador_id: 'op-1', conta_recebimento: false }], error: null,
    });

    const r = await buscarEquipesComOperadores('emp-1');
    expect(r.equipes.map(e => e.id)).toEqual(['eq-2']);
    expect(r.equipesExtrasPorOperador['op-1']).toBeUndefined();
  });

  it('coluna conta_recebimento ausente no banco: o clone conta (comportamento antigo)', async () => {
    responder('perfis', { data: [], error: null });
    responder('equipes', { data: [{ id: 'eq-2', nome: 'Play 5', setor_id: 'setor-B' }], error: null });
    // 1ª tentativa (com a coluna) volta null; a 2ª, sem ela, traz as linhas.
    responder('equipe_operadores_clones',
      { data: null, error: { message: 'column conta_recebimento does not exist' } },
      { data: [{ equipe_id: 'eq-2', operador_id: 'op-1' }], error: null });

    const r = await buscarEquipesComOperadores('emp-1');
    expect(r.equipesExtrasPorOperador['op-1']).toEqual(['eq-2']);
  });

  it('tabela de clones inexistente não derruba a busca', async () => {
    responder('perfis', { data: [
      { id: 'op-1', equipe_id: 'eq-1', setor_id: null,
        equipes: { id: 'eq-1', nome: 'Play 4', setor_id: 'setor-A' } },
    ], error: null });
    responder('equipes', { data: [{ id: 'eq-1', nome: 'Play 4', setor_id: 'setor-A' }], error: null });
    responder('equipe_operadores_clones',
      { data: null, error: { message: 'relation does not exist' } },
      { data: null, error: { message: 'relation does not exist' } });

    const r = await buscarEquipesComOperadores('emp-1');
    expect(r.equipesExtrasPorOperador).toEqual({});
    expect(r.equipes).toHaveLength(1);
  });

  it('lista de equipes sai ordenada por nome', async () => {
    responder('perfis', { data: [
      { id: 'op-1', equipe_id: 'eq-z', setor_id: null, equipes: { id: 'eq-z', nome: 'Zulu', setor_id: 'setor-A' } },
      { id: 'op-2', equipe_id: 'eq-a', setor_id: null, equipes: { id: 'eq-a', nome: 'Alfa', setor_id: 'setor-A' } },
    ], error: null });
    responder('equipes', { data: [
      { id: 'eq-z', nome: 'Zulu', setor_id: 'setor-A' },
      { id: 'eq-a', nome: 'Alfa', setor_id: 'setor-A' },
    ], error: null });
    responder('equipe_operadores_clones', { data: [], error: null });

    const r = await buscarEquipesComOperadores('emp-1');
    expect(r.equipes.map(e => e.nome)).toEqual(['Alfa', 'Zulu']);
  });
});

// ── Fontes de escopo ────────────────────────────────────────────────────────

describe('buscarFontesDeEscopo', () => {
  function cenarioBase() {
    responder('perfis', { data: [
      { id: 'op-1', equipe_id: 'eq-1', setor_id: null,
        equipes: { id: 'eq-1', nome: 'Play 4', setor_id: 'setor-A' } },
      { id: 'op-2', equipe_id: 'eq-2', setor_id: null,
        equipes: { id: 'eq-2', nome: 'Play 5', setor_id: 'setor-B' } },
    ], error: null });
    responder('equipes', { data: [
      { id: 'eq-1', nome: 'Play 4', setor_id: 'setor-A' },
      { id: 'eq-2', nome: 'Play 5', setor_id: 'setor-B' },
    ], error: null });
    responder('equipe_operadores_clones', {
      data: [{ equipe_id: 'eq-2', operador_id: 'op-1', conta_recebimento: true }], error: null,
    });
  }

  it('marca os setores alternativos', async () => {
    cenarioBase();
    responder('setores', { data: [
      { id: 'setor-A', alternativo: false },
      { id: 'setor-B', alternativo: true },
    ], error: null });

    const f = await buscarFontesDeEscopo('emp-1');
    expect([...f.setoresAlternativos]).toEqual(['setor-B']);
    expect(f.setorDaEquipe.get('eq-2')).toBe('setor-B');
  });

  it('coluna `alternativo` ausente: nenhum setor é alternativo, e nada quebra', async () => {
    cenarioBase();
    responder('setores', { data: null, error: { message: 'column alternativo does not exist' } });

    const f = await buscarFontesDeEscopo('emp-1');
    expect(f.setoresAlternativos.size).toBe(0);
    expect(Object.keys(f.operadorEquipeMap)).toHaveLength(2);
  });

  it('operadoresDoSetor: o emprestado conta nos dois setores', async () => {
    cenarioBase();
    responder('setores', { data: [], error: null });

    const f = await buscarFontesDeEscopo('emp-1');
    expect([...operadoresDoSetor('setor-A', f)]).toEqual(['op-1']);
    // op-1 é clone que conta no Play 5, então entra no setor-B junto com op-2.
    expect([...operadoresDoSetor('setor-B', f)].sort()).toEqual(['op-1', 'op-2']);
  });

  it('operadoresDaEquipe: membros próprios mais os clonados', async () => {
    cenarioBase();
    responder('setores', { data: [], error: null });

    const f = await buscarFontesDeEscopo('emp-1');
    expect([...operadoresDaEquipe('eq-1', f)]).toEqual(['op-1']);
    expect([...operadoresDaEquipe('eq-2', f)].sort()).toEqual(['op-1', 'op-2']);
    expect(operadoresDaEquipe('eq-inexistente', f).size).toBe(0);
  });

  it('setor sem ninguém devolve conjunto vazio, não a empresa toda', async () => {
    cenarioBase();
    responder('setores', { data: [], error: null });

    const f = await buscarFontesDeEscopo('emp-1');
    expect(operadoresDoSetor('setor-Z', f).size).toBe(0);
  });
});
