/**
 * rankingCriterio.test.ts — "quem entra, e quem vem antes".
 *
 * O caso que originou tudo: a Elite fora do ranking por percentual, e uma
 * pessoa fora dele mesmo com a equipe dela dentro.
 */
import { describe, it, expect } from 'vitest';
import {
  participaDoRanking, filtrarParticipantes, ordenarLinhas, agregarGrupos,
  type LinhaRanking,
} from './rankingCriterio';
import {
  CONFIG_RANKING_PADRAO, type RankingConfig,
} from '@/services/analitico/rankingConfig.service';

function linha(p: Partial<LinhaRanking> & { operador_id: string }): LinhaRanking {
  return {
    operador_id:      p.operador_id,
    operador_usuario: p.operador_usuario ?? p.operador_id,
    operador_nome:    p.operador_nome ?? p.operador_id,
    total_recebido:   p.total_recebido ?? 0,
    total_ho:         0,
    total_pagamentos: p.total_pagamentos ?? 0,
    grupoId:          p.grupoId ?? null,
    grupoNome:        p.grupoNome ?? null,
    pct:              p.pct ?? null,
    esperado:         p.esperado ?? null,
  };
}

const config = (p: Partial<RankingConfig>): RankingConfig => ({ ...CONFIG_RANKING_PADRAO, ...p });

const ids = (ls: LinhaRanking[]) => ls.map(l => l.operador_id);

describe('quem participa', () => {
  it('lista de grupos vazia deixa todo mundo entrar', () => {
    const ana = linha({ operador_id: 'ana', grupoId: 'sub-a' });
    expect(participaDoRanking(ana, CONFIG_RANKING_PADRAO)).toBe(true);
  });

  it('com grupos listados, só os listados entram — o caso Elite', () => {
    const ana   = linha({ operador_id: 'ana',   grupoId: 'sub-a' });
    const elite = linha({ operador_id: 'elite', grupoId: 'eq-elite' });
    const c = config({ gruposIncluidos: ['sub-a'] });

    expect(participaDoRanking(ana, c)).toBe(true);
    expect(participaDoRanking(elite, c)).toBe(false);
  });

  it('quem não tem grupo fica de fora quando a lista de grupos existe', () => {
    const solto = linha({ operador_id: 'solto', grupoId: null });
    expect(participaDoRanking(solto, config({ gruposIncluidos: ['sub-a'] }))).toBe(false);
  });

  it('a exclusão nominal vence a inclusão do grupo', () => {
    const chefe = linha({ operador_id: 'chefe', grupoId: 'sub-a' });
    const c = config({ gruposIncluidos: ['sub-a'], perfisExcluidos: ['chefe'] });
    expect(participaDoRanking(chefe, c)).toBe(false);
  });

  it('filtrarParticipantes preserva a ordem de chegada', () => {
    const ls = [
      linha({ operador_id: 'a', grupoId: 'g1' }),
      linha({ operador_id: 'b', grupoId: 'g2' }),
      linha({ operador_id: 'c', grupoId: 'g1' }),
    ];
    expect(ids(filtrarParticipantes(ls, config({ gruposIncluidos: ['g1'] })))).toEqual(['a', 'c']);
  });
});

describe('ordenação por recebimento', () => {
  it('maior valor primeiro', () => {
    const ls = [
      linha({ operador_id: 'baixo', total_recebido: 100 }),
      linha({ operador_id: 'alto',  total_recebido: 900 }),
      linha({ operador_id: 'meio',  total_recebido: 500 }),
    ];
    expect(ids(ordenarLinhas(ls, 'recebimento'))).toEqual(['alto', 'meio', 'baixo']);
  });

  it('não muda a lista original', () => {
    const ls = [
      linha({ operador_id: 'baixo', total_recebido: 100 }),
      linha({ operador_id: 'alto',  total_recebido: 900 }),
    ];
    ordenarLinhas(ls, 'recebimento');
    expect(ids(ls)).toEqual(['baixo', 'alto']);
  });
});

describe('ordenação por percentual', () => {
  /**
   * O ponto do critério: quem recebeu MENOS pode vir na frente, porque a meta
   * dele era menor. É a queixa que originou o pedido.
   */
  it('percentual maior vence recebimento maior', () => {
    const ls = [
      linha({ operador_id: 'grande', total_recebido: 90_000, pct: 90,  esperado: 100_000 }),
      linha({ operador_id: 'pequeno', total_recebido: 6_000, pct: 120, esperado: 5_000 }),
    ];
    expect(ids(ordenarLinhas(ls, 'percentual'))).toEqual(['pequeno', 'grande']);
  });

  it('quem não tem meta vai para o fim, não para o fundo do zero', () => {
    const ls = [
      linha({ operador_id: 'sem_meta', total_recebido: 80_000, pct: null }),
      linha({ operador_id: 'fraco',    total_recebido: 1_000,  pct: 10, esperado: 10_000 }),
    ];
    expect(ids(ordenarLinhas(ls, 'percentual'))).toEqual(['fraco', 'sem_meta']);
  });

  it('empate no percentual desempata pelo recebimento', () => {
    const ls = [
      linha({ operador_id: 'menor', total_recebido: 1_200, pct: 120, esperado: 1_000 }),
      linha({ operador_id: 'maior', total_recebido: 12_000, pct: 120, esperado: 10_000 }),
    ];
    expect(ids(ordenarLinhas(ls, 'percentual'))).toEqual(['maior', 'menor']);
  });

  it('dois sem meta caem no recebimento', () => {
    const ls = [
      linha({ operador_id: 'a', total_recebido: 100 }),
      linha({ operador_id: 'b', total_recebido: 900 }),
    ];
    expect(ids(ordenarLinhas(ls, 'percentual'))).toEqual(['b', 'a']);
  });

  it('critério equipes ordena os operadores por recebimento', () => {
    const ls = [
      linha({ operador_id: 'pct_alto', total_recebido: 100,   pct: 300, esperado: 33 }),
      linha({ operador_id: 'valor',    total_recebido: 9_000, pct: 50,  esperado: 18_000 }),
    ];
    expect(ids(ordenarLinhas(ls, 'equipes'))).toEqual(['valor', 'pct_alto']);
  });
});

describe('agregação por equipe/subgrupo', () => {
  const ls = [
    linha({ operador_id: 'a', grupoId: 'sub-a', grupoNome: 'Sub-A', total_recebido: 100_000, total_pagamentos: 10, pct: 90,  esperado: 111_111 }),
    linha({ operador_id: 'b', grupoId: 'sub-a', grupoNome: 'Sub-A', total_recebido: 10_000,  total_pagamentos: 4,  pct: 200, esperado: 5_000 }),
    linha({ operador_id: 'c', grupoId: 'beta',  grupoNome: 'Beta',  total_recebido: 60_000,  total_pagamentos: 6,  pct: 120, esperado: 50_000 }),
  ];

  it('soma recebimento e pagamentos de cada grupo', () => {
    const g = agregarGrupos(ls, 'recebimento');
    const subA = g.find(x => x.grupoId === 'sub-a')!;
    expect(subA.totalRecebido).toBe(110_000);
    expect(subA.totalPagamentos).toBe(14);
    expect(subA.operadores).toBe(2);
  });

  /**
   * A razão de `esperado` existir na linha. A média dos percentuais do Sub-A
   * daria 145%; a equipe está em 94%.
   */
  it('percentual do grupo é recebido somado ÷ esperado somado, não média', () => {
    const subA = agregarGrupos(ls, 'percentual').find(x => x.grupoId === 'sub-a')!;
    expect(subA.pct).toBe(Math.round((110_000 / 116_111) * 100)); // 95
    expect(subA.pct).toBeLessThan(145);
  });

  it('por percentual, Beta passa na frente do Sub-A mesmo recebendo menos', () => {
    const g = agregarGrupos(ls, 'percentual');
    expect(g.map(x => x.grupoId)).toEqual(['beta', 'sub-a']);
  });

  it('por recebimento, Sub-A vem primeiro', () => {
    const g = agregarGrupos(ls, 'recebimento');
    expect(g.map(x => x.grupoId)).toEqual(['sub-a', 'beta']);
  });

  it('grupo sem ninguém com meta fica sem percentual, não em 0%', () => {
    const g = agregarGrupos([
      linha({ operador_id: 'x', grupoId: 'g', grupoNome: 'G', total_recebido: 500 }),
    ], 'percentual');
    expect(g[0].pct).toBeNull();
  });

  it('quem está sem equipe vira um grupo próprio, para o total continuar fechando', () => {
    const g = agregarGrupos([
      linha({ operador_id: 'x', grupoId: null, total_recebido: 700 }),
      linha({ operador_id: 'y', grupoId: 'g', grupoNome: 'G', total_recebido: 300 }),
    ], 'recebimento');
    const soma = g.reduce((s, x) => s + x.totalRecebido, 0);
    expect(soma).toBe(1_000);
    expect(g.find(x => x.grupoId === null)?.grupoNome).toBe('Sem equipe');
  });
});
