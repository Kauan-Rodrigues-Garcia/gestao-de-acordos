/**
 * Os setores alternativos, do lado do cliente.
 *
 * O que se trava aqui é a SEPARAÇÃO. Um setor alternativo clona o recebimento
 * de gente que já pertence a outro setor, então o valor dele espelha dinheiro
 * que outro setor já cobrou. Somar contaria duas vezes.
 *
 * Por isso ele vem de uma consulta própria e mora num campo próprio: `total`,
 * `totalEmpresa` e `totalSetores` não podem mudar por causa dele. Um teste que
 * garante isso é barato; descobrir na conferência de fechamento não é.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({
  /** Resposta por nome de RPC. */
  porRpc: {} as Record<string, { data: unknown; error: { message: string } | null }>,
  chamadas: [] as string[],
}));

vi.mock('@/lib/supabaseSemTipo', () => ({
  rpcSemTipo: (nome: string) => {
    mock.chamadas.push(nome);
    return Promise.resolve(mock.porRpc[nome] ?? { data: null, error: null });
  },
  tabelaSemTipo: () => ({ select: () => ({ eq: () => ({ order: () => ({ limit: () => [] }) }) }) }),
}));
vi.mock('@/lib/supabase', () => ({ supabase: { rpc: () => Promise.resolve({ error: null }) } }));

import { buscarGradeDeSetores } from './diretoriaSetores.service';
import { buscarVisaoGeralDiretoria } from './diretoria.service';

const GRADE = {
  mes: '2026-09', mes_anterior: '2026-08', dia_corte: 10, dias_no_mes: 30,
  total_empresa: 1000, total_setores: 1200,
  sem_setor: { valor: 0, linhas: 0 },
  setores: [{
    setor_id: 's1', setor_nome: 'Play 1', foto_url: null,
    valor: 1200, linhas: 10, operadores: 4, carteiras: 1,
    integral_recebido: 0, movido_para_ca: 0,
    valor_anterior: 900, tem_anterior: true, tem_grupo: true,
  }],
  carteiras_sem_setor: [],
};

const VISAO = {
  mes: '2026-09', mes_anterior: '2026-08', dia_corte: 10, dias_no_mes: 30,
  tem_lote: true, tem_lote_anterior: true,
  total: { recebido: 1000, linhas: 10, operadores: 4, carteiras: 1 },
  total_anterior: { recebido: 900, linhas: 9 },
  serie: [], formas: [], carteiras: [],
};

const ALTERNATIVOS = [{
  setor_id: 'alt1', setor_nome: 'Treinamento', foto_url: null,
  valor: 16256.13, valor_anterior: 810.18, linhas: 88,
  operadores: 5, pessoas: 8, carteiras: 0, tem_grupo: false,
  integral_recebido: 0, movido_para_ca: 0, tem_anterior: true,
}];

beforeEach(() => {
  mock.porRpc = {};
  mock.chamadas = [];
});

describe('buscarGradeDeSetores', () => {
  it('o alternativo vem separado, e NÃO entra nos totais', async () => {
    mock.porRpc = {
      fn_mestre_diretoria_setores:     { data: GRADE, error: null },
      fn_mestre_diretoria_alternativos: { data: ALTERNATIVOS, error: null },
    };

    const g = await buscarGradeDeSetores('emp-1', '2026-09');

    expect(g.setores).toHaveLength(1);
    expect(g.alternativos).toHaveLength(1);
    expect(g.alternativos[0].setorNome).toBe('Treinamento');
    expect(g.alternativos[0].pessoas).toBe(8);

    // O ponto do teste: os totais são os do banco, sem o alternativo somado.
    expect(g.totalEmpresa).toBe(1000);
    expect(g.totalSetores).toBe(1200);
  });

  /*
   * A seção do alternativo é secundária. Se ela falhar, a grade — que é o
   * conteúdo principal da aba — tem de continuar aparecendo.
   */
  it('alternativo que falha não derruba a grade', async () => {
    mock.porRpc = {
      fn_mestre_diretoria_setores: { data: GRADE, error: null },
      // sem entrada para os alternativos: a RPC devolve `data: null`
    };

    const g = await buscarGradeDeSetores('emp-1', '2026-09');

    expect(g.setores).toHaveLength(1);
    expect(g.alternativos).toEqual([]);
  });

  it('formato inesperado não vira "map is not a function"', async () => {
    mock.porRpc = {
      fn_mestre_diretoria_setores:      { data: GRADE, error: null },
      fn_mestre_diretoria_alternativos: { data: { erro: 'nao e lista' }, error: null },
    };

    const g = await buscarGradeDeSetores('emp-1', '2026-09');

    expect(g.alternativos).toEqual([]);
    expect(g.setores).toHaveLength(1);
  });
});

describe('buscarVisaoGeralDiretoria', () => {
  it('o alternativo vem separado, e o recebido do mês não muda', async () => {
    mock.porRpc = {
      fn_mestre_diretoria_visao_geral:  { data: VISAO, error: null },
      fn_mestre_diretoria_alternativos: { data: ALTERNATIVOS, error: null },
    };

    const v = await buscarVisaoGeralDiretoria('emp-1', '2026-09');

    expect(v.alternativos).toHaveLength(1);
    expect(v.alternativos[0].valor).toBeCloseTo(16256.13, 2);
    expect(v.alternativos[0].pessoas).toBe(8);

    // Continua sendo o total do arquivo, sem o espelho somado.
    expect(v.recebido).toBe(1000);
  });

  it('sem alternativo, a lista é vazia e o resto segue', async () => {
    mock.porRpc = {
      fn_mestre_diretoria_visao_geral:  { data: VISAO, error: null },
      fn_mestre_diretoria_alternativos: { data: [], error: null },
    };

    const v = await buscarVisaoGeralDiretoria('emp-1', '2026-09');

    expect(v.alternativos).toEqual([]);
    expect(v.recebido).toBe(1000);
  });
});
