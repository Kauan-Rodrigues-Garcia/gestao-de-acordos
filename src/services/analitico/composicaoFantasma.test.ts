/**
 * composicaoFantasma.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * `buscarEquipesComOperadores` com fantasma — a LIGAÇÃO, não a regra pura.
 *
 * `fantasmaTransferencia.test.ts` cobre `aplicarFantasmas` isolada. Estes testes
 * cobrem o que aquele não alcança: a composição realmente lê
 * `perfis_transferencias`, passa o mês certo e monta os nomes das equipes. Um
 * fio solto aqui não quebra nenhum teste puro e some com o recebimento de quem
 * foi transferido — exatamente o caso que a feature existe para evitar.
 *
 * Cenário reproduzido do banco (13/08/2026): Thayra saiu da PaguePlay para a
 * BookPlay no dia 13, deixando 68 linhas e R$ 31.676,23 em agosto. Ela sumiu da
 * consulta de perfis da PaguePlay — `.eq('empresa_id', …)` — mas a equipe
 * Digital, onde ela estava, tem de continuar contando o recebimento dela.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const PAGUEPLAY = 'emp-pagueplay';
const DIGITAL   = 'eq-digital';
const CONECTA   = 'setor-conecta';
const THAYRA    = 'p-thayra';

/** Respostas por tabela, na ordem em que o serviço as pede. */
const respostas = new Map<string, { data: unknown; error: unknown }>();
const filtros: Array<{ tabela: string; coluna: string; valor: unknown }> = [];

function construtor(tabela: string) {
  const alvo: Record<string, unknown> = {};
  for (const m of ['select', 'order', 'limit']) alvo[m] = () => alvo;
  // Só os métodos com coluna+valor entram em `filtros`: é por eles que os
  // testes conferem QUE pergunta foi feita ao banco, não só o que voltou.
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
    alvo.then = (aceitar: (r: unknown) => unknown) =>
      // Sem retrato congelado: força o caminho ao vivo.
      Promise.resolve({ data: [], error: null }).then(aceitar);
    return alvo;
  },
  rpcSemTipo: () => Promise.resolve({ error: null }),
}));

const { buscarEquipesComOperadores } = await import('./analitico.service');

/** Mês corrente — o único em que o fantasma vale. */
function mesAtual(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function montarBanco(opts: { comFantasma: boolean }) {
  respostas.set('perfis', {
    // Thayra NÃO está: ela mudou de empresa e a consulta filtra por empresa_id.
    data: [
      { id: 'p-bruna', equipe_id: DIGITAL, setor_id: CONECTA, situacao: 'ativo',
        equipes: { id: DIGITAL, nome: 'Digital', setor_id: CONECTA } },
    ],
    error: null,
  });
  respostas.set('equipes', {
    data: [{ id: DIGITAL, nome: 'Digital', setor_id: CONECTA }],
    error: null,
  });
  respostas.set('equipe_operadores_clones', { data: [], error: null });
  respostas.set('perfis_transferencias', {
    data: opts.comFantasma
      ? [{
          id: 'transf-1', perfil_id: THAYRA, perfil_nome: 'Thayra Ferreira Silva',
          origem_equipe_id: DIGITAL, origem_setor_id: CONECTA, tipo: 'empresa',
        }]
      : [],
    error: null,
  });
}

beforeEach(() => {
  respostas.clear();
  filtros.length = 0;
});

describe('buscarEquipesComOperadores — fantasma da transferência', () => {
  it('devolve à equipe de origem quem mudou de EMPRESA no mês', async () => {
    montarBanco({ comFantasma: true });

    const c = await buscarEquipesComOperadores(PAGUEPLAY, mesAtual());

    // Ela não veio na consulta de perfis (é de outra empresa agora), então a
    // entrada teve de ser criada. Sem isto o recebimento dela some do card da
    // equipe Digital no meio do mês.
    expect(c.operadorEquipeMap[THAYRA]).toEqual({
      equipe_id:   DIGITAL,
      equipe_nome: 'Digital',
      setor_id:    CONECTA,
    });
    // O nome vem da COLUNA `perfil_nome` (20260813d), não de um JOIN: a
    // PaguePlay não enxerga mais o perfil dela, e é lá que o fantasma aparece.
    expect(c.transferidos?.[THAYRA]).toEqual({
      transferenciaId: 'transf-1',
      tipo: 'empresa',
      nome: 'Thayra Ferreira Silva',
      equipeId: DIGITAL,
    });
  });

  it('consulta o fantasma pela empresa de ORIGEM e pelo mês pedido', async () => {
    montarBanco({ comFantasma: true });
    const mes = mesAtual();

    await buscarEquipesComOperadores(PAGUEPLAY, mes);

    const doFantasma = filtros.filter(f => f.tabela === 'perfis_transferencias');
    expect(doFantasma).toContainEqual({
      tabela: 'perfis_transferencias', coluna: 'empresa_id', valor: PAGUEPLAY,
    });
    expect(doFantasma).toContainEqual({
      tabela: 'perfis_transferencias', coluna: 'mes', valor: mes,
    });
    // Transferência desfeita ou fantasma já tirado não pode voltar a contar.
    expect(doFantasma).toContainEqual({
      tabela: 'perfis_transferencias', coluna: 'fantasma_ativo', valor: true,
    });
    expect(doFantasma).toContainEqual({
      tabela: 'perfis_transferencias', coluna: 'desfeita_em', valor: null,
    });
  });

  it('sem fantasma, a composição fica igual ao estado de hoje', async () => {
    montarBanco({ comFantasma: false });

    const c = await buscarEquipesComOperadores(PAGUEPLAY, mesAtual());

    expect(c.operadorEquipeMap[THAYRA]).toBeUndefined();
    expect(c.transferidos ?? {}).toEqual({});
  });

  it('sem mês, nem pergunta pelo fantasma', async () => {
    // Quem chama sem mês quer o estado de hoje puro — e o fantasma é por mês.
    montarBanco({ comFantasma: true });

    const c = await buscarEquipesComOperadores(PAGUEPLAY);

    expect(filtros.some(f => f.tabela === 'perfis_transferencias')).toBe(false);
    expect(c.operadorEquipeMap[THAYRA]).toBeUndefined();
  });
});
