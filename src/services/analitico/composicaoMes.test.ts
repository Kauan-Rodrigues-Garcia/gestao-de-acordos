/**
 * composicaoMes.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * O mês passado não pode mudar quando eu mexo nas equipes hoje.
 *
 * Os VALORES do analítico sempre foram históricos. O AGRUPAMENTO não era: as
 * abas Quartis, Desempenho por Equipe e Ranking montavam os grupos lendo
 * `perfis` e `equipe_operadores_clones` de HOJE. Resultado: mover alguém de
 * equipe reescrevia julho, e colocar alguém de férias hoje o apagava do ranking
 * de um mês que ele trabalhou inteiro.
 *
 * A regra da diretoria: o retrato de um mês fechado é fato consumado, e só a
 * reimportação do relatório daquele mês pode mexer nele.
 *
 * Vale para as duas empresas — é a mesma função para BookPlay e PaguePlay.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

type Resposta = { data: unknown; error: { message: string } | null };

const { respostas, tabelasLidas } = vi.hoisted(() => ({
  respostas: new Map<string, Resposta>(),
  tabelasLidas: [] as string[],
}));

function construtor(tabela: string) {
  const alvo: unknown = new Proxy({}, {
    get(_, prop) {
      if (prop === 'then') {
        return (aceitar: (r: Resposta) => void) =>
          aceitar(respostas.get(tabela) ?? { data: [], error: null });
      }
      return () => alvo;
    },
  });
  return alvo;
}

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (t: string) => { tabelasLidas.push(t); return construtor(t); },
    rpc: () => Promise.resolve({ error: null }),
  },
}));

// `ehMesAtual` decide qual caminho é tomado. Fixado para o teste não depender
// da data em que roda.
vi.mock('@/lib/mesReferencia', async (original) => ({
  ...(await original<typeof import('@/lib/mesReferencia')>()),
  ehMesAtual: (mes: string) => mes === '2026-08',
}));

const { buscarEquipesComOperadores } = await import('./analitico.service');
const { buscarSituacaoOperadores } = await import('@/services/situacaoUsuario.service');

/** HOJE: Maria foi movida do Play 4 para o Play 5 e entrou de férias. */
function estadoDeHoje() {
  respostas.set('perfis', { data: [
    { id: 'maria', equipe_id: 'eq-play5', setor_id: null, situacao: 'ferias',
      equipes: { id: 'eq-play5', nome: 'Play 5', setor_id: 'setor-B' } },
  ], error: null });
  respostas.set('equipes', { data: [
    { id: 'eq-play4', nome: 'Play 4', setor_id: 'setor-A' },
    { id: 'eq-play5', nome: 'Play 5', setor_id: 'setor-B' },
  ], error: null });
  respostas.set('equipe_operadores_clones', { data: [], error: null });
}

/** JULHO: Maria estava no Play 4, ativa, e era clone no Digital. */
function retratoDeJulho() {
  respostas.set('composicao_mes', { data: [
    { operador_id: 'maria', equipe_id: 'eq-play4', equipe_nome: 'Play 4',
      setor_id: 'setor-A', situacao: 'ativo', equipes_clone: ['eq-digital'] },
  ], error: null });
  respostas.set('composicao_mes_equipe', { data: [
    { equipe_id: 'eq-play4',   nome: 'Play 4',  setor_id: 'setor-A' },
    { equipe_id: 'eq-digital', nome: 'Digital', setor_id: 'setor-B' },
    { equipe_id: 'eq-vazia',   nome: 'Vazia',   setor_id: 'setor-A' },
  ], error: null });
}

beforeEach(() => {
  respostas.clear();
  tabelasLidas.length = 0;
});

describe('buscarEquipesComOperadores — mês fechado usa o retrato', () => {
  it('julho mostra a equipe de JULHO, não a de hoje', () => {
    estadoDeHoje();
    retratoDeJulho();
    return buscarEquipesComOperadores('emp-1', '2026-07').then(r => {
      expect(r.doRetrato).toBe(true);
      expect(r.operadorEquipeMap['maria'].equipe_id).toBe('eq-play4');
      expect(r.operadorEquipeMap['maria'].equipe_nome).toBe('Play 4');
      expect(r.operadorEquipeMap['maria'].setor_id).toBe('setor-A');
      // Nem chega a olhar o estado de hoje.
      expect(tabelasLidas).not.toContain('perfis');
    });
  });

  it('os clones de julho vêm do retrato', async () => {
    estadoDeHoje();
    retratoDeJulho();
    const r = await buscarEquipesComOperadores('emp-1', '2026-07');
    expect(r.equipesExtrasPorOperador['maria']).toEqual(['eq-digital']);
  });

  it('férias de hoje não apagam quem trabalhou julho inteiro', async () => {
    estadoDeHoje();
    retratoDeJulho();
    const r = await buscarEquipesComOperadores('emp-1', '2026-07');
    expect(r.situacaoPorOperador['maria']).toBe('ativo');
  });

  it('equipe sem ninguém no mês não vira card zerado', async () => {
    estadoDeHoje();
    retratoDeJulho();
    const r = await buscarEquipesComOperadores('emp-1', '2026-07');
    expect(r.equipes.map(e => e.id).sort()).toEqual(['eq-digital', 'eq-play4']);
    expect(r.equipes.find(e => e.id === 'eq-vazia')).toBeUndefined();
  });

  it('a equipe formada só por clone continua na lista', async () => {
    // O mesmo defeito já corrigido na visão ao vivo: nenhum perfil aponta para
    // ela, e sem isto ela sumiria do painel do mês passado.
    estadoDeHoje();
    retratoDeJulho();
    const r = await buscarEquipesComOperadores('emp-1', '2026-07');
    expect(r.equipes.find(e => e.id === 'eq-digital')?.nome).toBe('Digital');
  });
});

describe('buscarEquipesComOperadores — o mês corrente segue ao vivo', () => {
  it('agosto usa o estado de hoje, porque agosto ainda está acontecendo', async () => {
    estadoDeHoje();
    retratoDeJulho();
    const r = await buscarEquipesComOperadores('emp-1', '2026-08');
    expect(r.doRetrato).toBe(false);
    expect(r.operadorEquipeMap['maria'].equipe_id).toBe('eq-play5');
    expect(r.situacaoPorOperador['maria']).toBe('ferias');
  });

  it('sem mês informado, também ao vivo — comportamento antigo preservado', async () => {
    estadoDeHoje();
    retratoDeJulho();
    const r = await buscarEquipesComOperadores('emp-1');
    expect(r.doRetrato).toBe(false);
    expect(r.operadorEquipeMap['maria'].equipe_id).toBe('eq-play5');
  });
});

describe('buscarEquipesComOperadores — sem retrato, não quebra a tela', () => {
  it('mês antigo sem retrato cai no estado de hoje', async () => {
    estadoDeHoje();
    respostas.set('composicao_mes', { data: [], error: null });
    const r = await buscarEquipesComOperadores('emp-1', '2026-05');
    expect(r.doRetrato).toBe(false);
    expect(r.operadorEquipeMap['maria']).toBeDefined();
  });

  it('tabela ausente (migration pendente) cai no estado de hoje', async () => {
    estadoDeHoje();
    respostas.set('composicao_mes', {
      data: null, error: { message: 'relation "composicao_mes" does not exist' },
    });
    const r = await buscarEquipesComOperadores('emp-1', '2026-07');
    expect(r.doRetrato).toBe(false);
    expect(r.operadorEquipeMap['maria'].equipe_id).toBe('eq-play5');
  });
});

describe('buscarSituacaoOperadores — a situação também é do mês', () => {
  it('mês fechado lê o retrato', async () => {
    estadoDeHoje();
    respostas.set('composicao_mes', { data: [
      { operador_id: 'maria', situacao: 'ativo' },
      { operador_id: 'joao',  situacao: 'desligado' },
    ], error: null });

    const m = await buscarSituacaoOperadores('emp-1', '2026-07');
    expect(m).toEqual({ maria: 'ativo', joao: 'desligado' });
  });

  it('mês corrente lê o estado de hoje', async () => {
    respostas.set('perfis', { data: [{ id: 'maria', situacao: 'ferias' }], error: null });
    const m = await buscarSituacaoOperadores('emp-1', '2026-08');
    expect(m).toEqual({ maria: 'ferias' });
  });

  it('sem retrato do mês, cai no estado de hoje', async () => {
    respostas.set('composicao_mes', { data: [], error: null });
    respostas.set('perfis', { data: [{ id: 'maria', situacao: 'ferias' }], error: null });
    const m = await buscarSituacaoOperadores('emp-1', '2026-07');
    expect(m).toEqual({ maria: 'ferias' });
  });

  it('situação nula é tratada como ativo, nos dois caminhos', async () => {
    respostas.set('composicao_mes', { data: [{ operador_id: 'maria', situacao: null }], error: null });
    expect(await buscarSituacaoOperadores('emp-1', '2026-07')).toEqual({ maria: 'ativo' });

    respostas.clear();
    respostas.set('perfis', { data: [{ id: 'joao', situacao: null }], error: null });
    expect(await buscarSituacaoOperadores('emp-1', '2026-08')).toEqual({ joao: 'ativo' });
  });
});
